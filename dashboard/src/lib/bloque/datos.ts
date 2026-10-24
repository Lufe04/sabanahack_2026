import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import type { Enfermedad } from "@/db/schema";
import { getLotesEstado, type LoteEstado } from "@/lib/queries/lotes";
import { getCapturasPorPlanta } from "@/lib/queries/cultivos";
import { construirPlano, type BrotePlano, type Plano, type PlanoResumen } from "./plano";

/** Brotes que pintan el plano: abiertos, o cerrados hace menos de 10 días (recuperándose). */
async function brotesParaPlano(loteId?: string) {
  const res = await getDb().execute(sql`
    SELECT id, lote_id AS "loteId", enfermedad, severidad_max AS "severidadMax", area_afectada_pct AS "areaAfectadaPct", estado
    FROM eventos_enfermedad
    WHERE (estado <> 'cerrado' OR fecha_fin >= current_date - 10)
      ${loteId ? sql`AND lote_id = ${loteId}` : sql``}
  `);
  return res.rows as (BrotePlano & { loteId: string })[];
}

/** Última lectura de cada sensor (de las últimas 6 horas). */
async function ultimasLecturas(loteId?: string) {
  const res = await getDb().execute(sql`
    SELECT s.id, s.lote_id AS "loteId", s.tipo, s.unidad,
           (SELECT le.valor FROM lecturas le WHERE le.sensor_id = s.id AND le.ts <= now() AND le.ts > now() - interval '6 hours' ORDER BY le.ts DESC LIMIT 1) AS valor
    FROM sensores s
    ${loteId ? sql`WHERE s.lote_id = ${loteId}` : sql``}
  `);
  return res.rows as { id: string; loteId: string; tipo: string; unidad: string; valor: number | null }[];
}

function entrada(lote: LoteEstado, brotes: BrotePlano[], sensores: { id: string; tipo: string; unidad: string; valor: number | null }[]) {
  const temp = sensores.find((s) => s.tipo === "temperatura")?.valor ?? lote.tempProm;
  const hum = sensores.find((s) => s.tipo === "humedad_aire")?.valor ?? lote.humedadAireProm;
  return {
    bloque: { id: lote.id, poligono: lote.poligono, drenaje: lote.drenaje },
    brotes,
    clima: { temperatura: temp, humedadAire: hum, horasHumedadAlta: lote.horasHumedadAlta },
    sensores,
  };
}

/** Plano completo de un bloque, con las capturas reales del robot sobre sus plantas. */
export async function getPlanoBloque(loteId: string): Promise<{ plano: Plano; lote: LoteEstado } | null> {
  const [lotes, brotes, sensores, capturas] = await Promise.all([getLotesEstado(), brotesParaPlano(loteId), ultimasLecturas(loteId), getCapturasPorPlanta(loteId)]);
  const lote = lotes.find((l) => l.id === loteId);
  if (!lote) return null;
  return { plano: construirPlano({ ...entrada(lote, brotes, sensores), capturas }), lote };
}

/** Campo compacto (valores redondeados) para pintar el calor del bloque en el mapa de la finca. */
export type CampoCompacto = { cols: number; filas: number; valores: number[] };

export type SanidadBloque = PlanoResumen & {
  loteId: string;
  campos: Record<"sanidad" | "temperatura" | "humedadAire" | "humedadSuelo", CampoCompacto>;
  temperatura: number | null;
  humedadAire: number | null;
  humedadSuelo: number | null;
  plagaPrincipal: Enfermedad | null;
};

/** Sanidad y microclima de todos los bloques, para el mapa de calor de la finca. */
export async function getSanidadFinca(lotes?: LoteEstado[]): Promise<SanidadBloque[]> {
  const [todos, brotes, sensores] = await Promise.all([lotes ? Promise.resolve(lotes) : getLotesEstado(), brotesParaPlano(), ultimasLecturas()]);
  return todos.map((l) => {
    const s = sensores.filter((x) => x.loteId === l.id);
    const { resumen, campos } = construirPlano(entrada(l, brotes.filter((b) => b.loteId === l.id), s));
    const compacto = (c: { cols: number; filas: number; valores: number[] }, d = 0): CampoCompacto => ({ cols: c.cols, filas: c.filas, valores: c.valores.map((v) => Number(v.toFixed(d))) });
    const principal = (Object.entries(resumen.porPlaga) as [Enfermedad, number][]).sort((a, b) => b[1] - a[1])[0];
    const sondas = s.filter((x) => x.tipo === "humedad_suelo" && x.valor !== null);
    return {
      ...resumen,
      loteId: l.id,
      campos: { sanidad: compacto(campos.sanidad), temperatura: compacto(campos.temperatura, 1), humedadAire: compacto(campos.humedadAire), humedadSuelo: compacto(campos.humedadSuelo) },
      temperatura: s.find((x) => x.tipo === "temperatura")?.valor ?? l.tempProm,
      humedadAire: s.find((x) => x.tipo === "humedad_aire")?.valor ?? l.humedadAireProm,
      humedadSuelo: sondas.length ? sondas.reduce((a, x) => a + (x.valor ?? 0), 0) / sondas.length : l.humedadSueloProm,
      plagaPrincipal: principal && principal[1] > 0 ? principal[0] : null,
    };
  });
}
