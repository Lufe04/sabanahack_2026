import {
  customType,
  uuid,
  doublePrecision,
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
import { relations } from "drizzle-orm";

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

export const ORIGENES_EVENTO = ["dron", "inspeccion"] as const;
export const origenEventoEnum = pgEnum("origen_evento", ORIGENES_EVENTO);

export const ESTADOS_EVENTO = ["activo", "controlado", "cerrado"] as const;
export type EstadoEvento = (typeof ESTADOS_EVENTO)[number];
export const estadoEventoEnum = pgEnum("estado_evento", ESTADOS_EVENTO);

// ---------- Tablas ----------

/** Lote de cultivo dentro de la finca. */
export const lotes = pgTable("lotes", {
  id: text("id").primaryKey(), // ej. "L01"
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
    id: text("id").primaryKey(), // ej. "L01-HS-1"
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

/** Vuelo de dron sobre un lote. */
export const vuelosDron = pgTable(
  "vuelos_dron",
  {
    id: serial("id").primaryKey(),
    loteId: text("lote_id")
      .notNull()
      .references(() => lotes.id, { onDelete: "cascade" }),
    dronId: text("dron_id").notNull(),
    fecha: timestamp("fecha", { withTimezone: true }).notNull(),
    duracionMin: real("duracion_min").notNull(),
    coberturaPct: real("cobertura_pct").notNull(),
    /** Índice de vegetación promedio del lote (0 a 1). */
    ndvi: real("ndvi").notNull(),
    ndviMin: real("ndvi_min").notNull(),
    /** % del área del lote marcada como anómala por el modelo de visión. */
    areaAnomalaPct: real("area_anomala_pct").notNull(),
    imagenUrl: text("imagen_url"),
  },
  (t) => [index("vuelos_lote_fecha_idx").on(t.loteId, t.fecha)],
);

/** Detección puntual de enfermedad en un vuelo. */
export const detecciones = pgTable(
  "detecciones",
  {
    id: serial("id").primaryKey(),
    vueloId: integer("vuelo_id")
      .notNull()
      .references(() => vuelosDron.id, { onDelete: "cascade" }),
    loteId: text("lote_id")
      .notNull()
      .references(() => lotes.id, { onDelete: "cascade" }),
    enfermedad: enfermedadEnum("enfermedad").notNull(),
    /** 1 (leve) a 5 (crítica). */
    severidad: integer("severidad").notNull(),
    plantasAfectadasPct: real("plantas_afectadas_pct").notNull(),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    confianza: real("confianza").notNull(),
  },
  (t) => [
    index("detecciones_lote_idx").on(t.loteId),
    index("detecciones_vuelo_idx").on(t.vueloId),
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
    ndvi: real("ndvi"),
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
// Estas tablas guardan observaciones reales del teléfono y nunca se mezclan con
// la simulación. No tienen clave foránea a `lotes` a propósito: así un reseed de
// la simulación (que trunca `lotes` en cascada) no borra evidencia real. El lote
// se valida en el receptor contra el mismo catálogo que expone /api/lotes.

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
    /** UUID generado por la APK. Es la clave de idempotencia. */
    id: uuid("id").primaryKey(),
    /** Orden de llegada, para paginar con cursor estable. */
    seq: bigserial("seq", { mode: "number" }).notNull().unique(),
    tipo: text("tipo").notNull(), // observation | route_snapshot | legacy
    schemaVersion: integer("schema_version"),
    capturadoEn: timestamp("capturado_en", { withTimezone: true }).notNull(),
    recibidoEn: timestamp("recibido_en", { withTimezone: true }).notNull().defaultNow(),
    loteId: text("lote_id"),
    inspectionId: uuid("inspection_id"),
    planId: uuid("plan_id"),
    waypointId: uuid("waypoint_id"),
    modelo: text("modelo"),
    puntuaciones: jsonb("puntuaciones").$type<Puntuaciones>(),
    alerta: boolean("alerta").notNull().default(false),
    modoCaptura: text("modo_captura"), // periodic | automatic | manual | route_reference
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    precisionM: doublePrecision("precision_m"),
    foto: bytea("foto"),
    fotoMime: text("foto_mime"),
    fotoNombre: text("foto_nombre"),
    fotoBytes: integer("foto_bytes"),
    /** Payload completo sin la foto, para no perder ningún campo de la APK. */
    datos: jsonb("datos").notNull(),
    /** SHA-256 del contenido canónico: distingue un reintento de un UUID reutilizado. */
    huella: text("huella").notNull(),
    revisionHumana: text("revision_humana").notNull().default("pendiente"),
    revisadoEn: timestamp("revisado_en", { withTimezone: true }),
  },
  (t) => [
    index("cultivos_registros_lote_idx").on(t.loteId, t.capturadoEn),
    index("cultivos_registros_inspection_idx").on(t.inspectionId),
    index("cultivos_registros_capturado_idx").on(t.capturadoEn),
  ],
);

/** Última versión conocida de cada revisión (inspection). Nunca retrocede. */
export const cultivosRecorridos = pgTable(
  "cultivos_recorridos",
  {
    inspectionId: uuid("inspection_id").primaryKey(),
    planId: uuid("plan_id"),
    loteId: text("lote_id"),
    nombre: text("nombre"),
    fase: text("fase"),
    completados: integer("completados").notNull().default(0),
    total: integer("total").notNull().default(0),
    completa: boolean("completa").notNull().default(false),
    revision: integer("revision").notNull().default(0),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).notNull(),
    puntos: jsonb("puntos").$type<unknown[]>().notNull(),
    datos: jsonb("datos").notNull(),
    ultimoEventoId: uuid("ultimo_evento_id").notNull(),
    recibidoEn: timestamp("recibido_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cultivos_recorridos_lote_idx").on(t.loteId), index("cultivos_recorridos_plan_idx").on(t.planId)],
);

export type CultivoRegistro = typeof cultivosRegistros.$inferSelect;
export type CultivoRecorrido = typeof cultivosRecorridos.$inferSelect;

// ---------- Relaciones ----------

export const lotesRelations = relations(lotes, ({ many }) => ({
  sensores: many(sensores),
  vuelos: many(vuelosDron),
  eventos: many(eventosEnfermedad),
}));

export const sensoresRelations = relations(sensores, ({ one, many }) => ({
  lote: one(lotes, { fields: [sensores.loteId], references: [lotes.id] }),
  lecturas: many(lecturas),
}));

export const lecturasRelations = relations(lecturas, ({ one }) => ({
  sensor: one(sensores, { fields: [lecturas.sensorId], references: [sensores.id] }),
}));

export const vuelosRelations = relations(vuelosDron, ({ one, many }) => ({
  lote: one(lotes, { fields: [vuelosDron.loteId], references: [lotes.id] }),
  detecciones: many(detecciones),
}));

export const deteccionesRelations = relations(detecciones, ({ one }) => ({
  vuelo: one(vuelosDron, { fields: [detecciones.vueloId], references: [vuelosDron.id] }),
  lote: one(lotes, { fields: [detecciones.loteId], references: [lotes.id] }),
}));

export const eventosRelations = relations(eventosEnfermedad, ({ one }) => ({
  lote: one(lotes, { fields: [eventosEnfermedad.loteId], references: [lotes.id] }),
}));

// ---------- Tipos ----------

export type Lote = typeof lotes.$inferSelect;
export type Sensor = typeof sensores.$inferSelect;
export type Lectura = typeof lecturas.$inferSelect;
export type VueloDron = typeof vuelosDron.$inferSelect;
export type Deteccion = typeof detecciones.$inferSelect;
export type EventoEnfermedad = typeof eventosEnfermedad.$inferSelect;
export type ResumenDiarioLote = typeof resumenDiarioLote.$inferSelect;
export type Cosecha = typeof cosechas.$inferSelect;
export type NuevaCosecha = typeof cosechas.$inferInsert;

export type NuevoLote = typeof lotes.$inferInsert;
export type NuevoSensor = typeof sensores.$inferInsert;
export type NuevaLectura = typeof lecturas.$inferInsert;
export type NuevoVuelo = typeof vuelosDron.$inferInsert;
export type NuevaDeteccion = typeof detecciones.$inferInsert;
export type NuevoEvento = typeof eventosEnfermedad.$inferInsert;
export type NuevoResumenDiario = typeof resumenDiarioLote.$inferInsert;
