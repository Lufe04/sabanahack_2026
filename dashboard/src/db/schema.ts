import {
  bigint,
  check,
  customType,
  uuid,
  pgTable,
  pgEnum,
  text,
  real,
  integer,
  bigserial,
  serial,
  boolean,
  date,
  timestamp,
  jsonb,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ---------- Enums ----------

/** Problemas fitosanitarios que se monitorean: una plaga (trips) y dos hongos. */
export const ENFERMEDADES = ["trips", "botrytis", "alternaria"] as const;
export type Enfermedad = (typeof ENFERMEDADES)[number];
export const enfermedadEnum = pgEnum("enfermedad", ENFERMEDADES);

export const TIPOS_SENSOR = [
  "humedad_suelo",
  "humedad_aire",
  "temperatura",
  "radiacion",
  "ph_suelo",
] as const;
export type TipoSensor = (typeof TIPOS_SENSOR)[number];
export const tipoSensorEnum = pgEnum("tipo_sensor", TIPOS_SENSOR);

export const DRENAJES = ["bueno", "regular", "malo"] as const;
export type Drenaje = (typeof DRENAJES)[number];
export const drenajeEnum = pgEnum("drenaje", DRENAJES);

/** Quién detectó el brote: el robot con cámara en su ronda, o una persona en campo. */
export const ORIGENES_EVENTO = ["robot", "inspeccion"] as const;
export const origenEventoEnum = pgEnum("origen_evento", ORIGENES_EVENTO);

export const ESTADOS_EVENTO = ["activo", "controlado", "cerrado"] as const;
export type EstadoEvento = (typeof ESTADOS_EVENTO)[number];
export const estadoEventoEnum = pgEnum("estado_evento", ESTADOS_EVENTO);

// ---------- Tablas ----------

/** Lote de cultivo dentro de la finca. */
export const lotes = pgTable("lotes", {
  id: text("id").primaryKey(), // ej. "B01" (bloque)
  nombre: text("nombre").notNull(),
  variedad: text("variedad").notNull(),
  hectareas: real("hectareas").notNull(),
  fechaSiembra: date("fecha_siembra").notNull(),
  drenaje: drenajeEnum("drenaje").notNull().default("bueno"),
  /** Polígono [lat, lng][] en orden; se cierra solo. */
  poligono: jsonb("poligono").$type<[number, number][]>().notNull(),
  centroLat: real("centro_lat").notNull(),
  centroLng: real("centro_lng").notNull(),
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
});

/** Sensor físico instalado en un lote. */
export const sensores = pgTable(
  "sensores",
  {
    id: text("id").primaryKey(), // ej. "B01-HS-1"
    loteId: text("lote_id")
      .notNull()
      .references(() => lotes.id, { onDelete: "cascade" }),
    tipo: tipoSensorEnum("tipo").notNull(),
    unidad: text("unidad").notNull(), // "%", "°C", "W/m²", "pH"
    instaladoEn: date("instalado_en").notNull(),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [index("sensores_lote_idx").on(t.loteId)],
);

/** Serie de tiempo de lecturas. Es la tabla grande. */
export const lecturas = pgTable(
  "lecturas",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sensorId: text("sensor_id")
      .notNull()
      .references(() => sensores.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    valor: real("valor").notNull(),
  },
  (t) => [
    index("lecturas_sensor_ts_idx").on(t.sensorId, t.ts),
    index("lecturas_ts_idx").on(t.ts),
  ],
);

/** Brote de enfermedad: desde que aparece hasta que se controla. */
export const eventosEnfermedad = pgTable(
  "eventos_enfermedad",
  {
    id: serial("id").primaryKey(),
    loteId: text("lote_id")
      .notNull()
      .references(() => lotes.id, { onDelete: "cascade" }),
    enfermedad: enfermedadEnum("enfermedad").notNull(),
    fechaInicio: date("fecha_inicio").notNull(),
    fechaDeteccion: date("fecha_deteccion"),
    fechaFin: date("fecha_fin"),
    severidadMax: integer("severidad_max").notNull(),
    areaAfectadaPct: real("area_afectada_pct").notNull(),
    origen: origenEventoEnum("origen").notNull(),
    estado: estadoEventoEnum("estado").notNull().default("activo"),
    tratamiento: text("tratamiento"),
    /** Clave interna del simulador, para actualizar el brote día a día. Null en datos reales. */
    claveSim: integer("clave_sim").unique(),
  },
  (t) => [
    index("eventos_lote_idx").on(t.loteId),
    index("eventos_inicio_idx").on(t.fechaInicio),
  ],
);

/**
 * Agregado diario por lote. Se precalcula para que el dashboard
 * no tenga que agregar cientos de miles de lecturas en cada carga.
 */
export const resumenDiarioLote = pgTable(
  "resumen_diario_lote",
  {
    loteId: text("lote_id")
      .notNull()
      .references(() => lotes.id, { onDelete: "cascade" }),
    fecha: date("fecha").notNull(),
    humedadSueloProm: real("humedad_suelo_prom"),
    humedadAireProm: real("humedad_aire_prom"),
    tempProm: real("temp_prom"),
    tempMin: real("temp_min"),
    tempMax: real("temp_max"),
    /** Horas del día con humedad del aire > 85 %. Predictor clave de hongos. */
    horasHumedadAlta: real("horas_humedad_alta"),
    lluviaMm: real("lluvia_mm"),
    eventosActivos: integer("eventos_activos").notNull().default(0),
    /** 0 a 100. Riesgo estimado de brote (cualquier plaga) en los próximos 7 días. */
    indiceRiesgo: real("indice_riesgo").notNull().default(0),
    /** Riesgo 0 a 100 desglosado por plaga: { trips, botrytis, alternaria }. */
    riesgoPorPlaga: jsonb("riesgo_por_plaga").$type<Record<Enfermedad, number>>(),
  },
  (t) => [
    primaryKey({ columns: [t.loteId, t.fecha] }),
    index("resumen_fecha_idx").on(t.fecha),
  ],
);

/**
 * Cosecha semanal por lote. kgDescartados es fruta perdida o rechazada por
 * plagas y enfermedades; de aquí salen las pérdidas en kilos y pesos.
 */
export const cosechas = pgTable(
  "cosechas",
  {
    id: serial("id").primaryKey(),
    loteId: text("lote_id")
      .notNull()
      .references(() => lotes.id, { onDelete: "cascade" }),
    /** Lunes de la semana cosechada. */
    semana: date("semana").notNull(),
    kgCosechados: real("kg_cosechados").notNull(),
    kgDescartados: real("kg_descartados").notNull(),
    /** Plaga responsable de la mayor parte del descarte, si la hubo. */
    plagaPrincipal: enfermedadEnum("plaga_principal"),
  },
  (t) => [index("cosechas_lote_semana_idx").on(t.loteId, t.semana), index("cosechas_semana_idx").on(t.semana)],
);

/** Estado serializado del simulador, para avanzar un día por cron en producción. */
export const estadoSimulador = pgTable("estado_simulador", {
  id: integer("id").primaryKey().default(1),
  estado: jsonb("estado").notNull(),
  actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Datos reales de la APK "Cultivos a bordo" ----------
//
// Mismas tablas y columnas que `001_cultivos.sql` del adaptador 0.2.2, para que su
// código (src/lib/cultivos/adaptador) funcione sin cambios. Diferencias deliberadas:
// - Sin clave foránea a un catálogo: un reseed de la simulación trunca `lotes` en
//   cascada y no debe borrar evidencia real. El receptor valida el lote contra `lotes`,
//   el mismo catálogo que expone /api/lotes (paso 4 del README del adaptador).
// - `revision_humana` y `revisado_en`: decisión del agrónomo sobre cada captura.

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/** Las cuatro salidas del modelo, de 0 a 1, tal como las entrega la APK. */
export type Puntuaciones = { alternaria: number; botrytis: number; sana: number; trips: number };

export const REVISIONES_HUMANAS = ["pendiente", "confirmada", "descartada"] as const;
export type RevisionHumana = (typeof REVISIONES_HUMANAS)[number];

/** Cada evento recibido por POST /api/events: observación o estado de recorrido. */
export const cultivosRegistros = pgTable(
  "cultivos_registros",
  {
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity().unique(),
    id: uuid("id").primaryKey(),
    tipo: text("tipo").notNull(),
    loteId: text("lote_id"),
    capturadoEn: timestamp("capturado_en", { withTimezone: true }).notNull(),
    recibidoEn: timestamp("recibido_en", { withTimezone: true }).notNull().defaultNow(),
    alerta: boolean("alerta").notNull().default(false),
    puntuaciones: jsonb("puntuaciones").$type<Puntuaciones>(),
    datos: jsonb("datos").notNull(),
    foto: bytea("foto"),
    dataHash: text("data_hash").notNull(),
    revisionHumana: text("revision_humana").notNull().default("pendiente"),
    revisadoEn: timestamp("revisado_en", { withTimezone: true }),
  },
  (t) => [
    check("cultivos_registros_tipo_check", sql`${t.tipo} IN ('observation','route_snapshot')`),
    check("cultivos_registros_alerta_foto_check", sql`NOT ${t.alerta} OR ${t.foto} IS NOT NULL`),
    index("cultivos_registros_lote_fecha").on(t.loteId, t.capturadoEn.desc()),
  ],
);

/** Última versión de cada revisión (inspection). Una revisión vieja no la reemplaza. */
export const cultivosRecorridos = pgTable(
  "cultivos_recorridos",
  {
    inspectionId: uuid("inspection_id").primaryKey(),
    planId: uuid("plan_id").notNull(),
    loteId: text("lote_id").notNull(),
    revision: bigint("revision", { mode: "number" }).notNull(),
    fase: text("fase").notNull(),
    completados: integer("completados").notNull(),
    total: integer("total").notNull(),
    datos: jsonb("datos").notNull(),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).notNull(),
    recibidoEn: timestamp("recibido_en", { withTimezone: true }).notNull().defaultNow(),
  },
);

/**
 * Bitácora de cada intento de POST /api/events, aceptado o rechazado. Sirve para
 * diagnosticar la conexión con la APK: si un envío no aparece en Capturas, aquí se ve
 * si llegó y por qué se rechazó. No guarda el cuerpo ni la foto.
 */
export const cultivosIntentos = pgTable(
  "cultivos_intentos",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    recibidoEn: timestamp("recibido_en", { withTimezone: true }).notNull().defaultNow(),
    estado: integer("estado").notNull(),
    error: text("error"),
    eventoId: text("evento_id"),
    tipo: text("tipo"),
    loteId: text("lote_id"),
    bytes: integer("bytes"),
    conToken: boolean("con_token").notNull(),
    agente: text("agente"),
  },
  (t) => [index("cultivos_intentos_fecha_idx").on(t.recibidoEn)],
);

export type CultivoRegistro = typeof cultivosRegistros.$inferSelect;
export type CultivoRecorrido = typeof cultivosRecorridos.$inferSelect;

// ---------- Relaciones ----------

export const lotesRelations = relations(lotes, ({ many }) => ({
  sensores: many(sensores),
  eventos: many(eventosEnfermedad),
}));

export const sensoresRelations = relations(sensores, ({ one, many }) => ({
  lote: one(lotes, { fields: [sensores.loteId], references: [lotes.id] }),
  lecturas: many(lecturas),
}));

export const lecturasRelations = relations(lecturas, ({ one }) => ({
  sensor: one(sensores, { fields: [lecturas.sensorId], references: [sensores.id] }),
}));

export const eventosRelations = relations(eventosEnfermedad, ({ one }) => ({
  lote: one(lotes, { fields: [eventosEnfermedad.loteId], references: [lotes.id] }),
}));

// ---------- Tipos ----------

export type Lote = typeof lotes.$inferSelect;
export type Sensor = typeof sensores.$inferSelect;
export type Lectura = typeof lecturas.$inferSelect;
export type EventoEnfermedad = typeof eventosEnfermedad.$inferSelect;
export type ResumenDiarioLote = typeof resumenDiarioLote.$inferSelect;
export type Cosecha = typeof cosechas.$inferSelect;
export type NuevaCosecha = typeof cosechas.$inferInsert;

export type NuevoLote = typeof lotes.$inferInsert;
export type NuevoSensor = typeof sensores.$inferInsert;
export type NuevaLectura = typeof lecturas.$inferInsert;
export type NuevoEvento = typeof eventosEnfermedad.$inferInsert;
export type NuevoResumenDiario = typeof resumenDiarioLote.$inferInsert;
