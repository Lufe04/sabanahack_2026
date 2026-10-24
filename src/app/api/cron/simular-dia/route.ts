import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { verificarCron } from "@/lib/api/auth";
import { Rng, simularDia, eventosAFilas, SENSORES_CAIDOS_DEFAULT, type EstadoSimulacion } from "@/lib/simulador";

export const maxDuration = 120;

/**
 * GET /api/cron/simular-dia
 * Avanza el simulador un día: genera lecturas, vuelos, brotes y resumen del
 * día siguiente al último simulado. Vercel Cron lo llama cada madrugada; en
 * producción real este endpoint desaparece y los datos llegan por /api/ingesta.
 */
export async function GET(req: Request) {
  const noAuth = verificarCron(req);
  if (noAuth) return noAuth;

  const db = getDb();
  const fila = await db.query.estadoSimulador.findFirst({ where: eq(schema.estadoSimulador.id, 1) });
  if (!fila) return NextResponse.json({ error: "No hay estado del simulador. Ejecuta el seed." }, { status: 409 });
  const estado = fila.estado as EstadoSimulacion;

  // No adelantarse al calendario: solo simula días que ya empezaron en Colombia.
  const hoyLocal = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  const inicio = new Date(estado.inicio + "T00:00:00Z");
  const fechaSiguiente = new Date(inicio);
  fechaSiguiente.setUTCDate(fechaSiguiente.getUTCDate() + estado.dia);
  if (fechaSiguiente.toISOString().slice(0, 10) > hoyLocal) {
    return NextResponse.json({ ok: true, mensaje: "Ya está al día", ultimoDia: estado.dia - 1 });
  }

  const [lotes, sensores] = await Promise.all([db.select().from(schema.lotes), db.select().from(schema.sensores)]);
  const rng = new Rng(7 + estado.dia * 7919);
  const salida = simularDia(estado, inicio, lotes, sensores, rng, {
    intervaloLecturasMin: 30,
    sensoresCaidos: SENSORES_CAIDOS_DEFAULT(180),
  });

  await db.transaction(async (tx) => {
    for (let i = 0; i < salida.lecturas.length; i += 4000) {
      await tx.insert(schema.lecturas).values(salida.lecturas.slice(i, i + 4000));
    }
    if (salida.vuelos.length) {
      const ids = await tx.insert(schema.vuelosDron).values(salida.vuelos.map((v) => v.vuelo)).returning({ id: schema.vuelosDron.id });
      const det = salida.vuelos.flatMap((v, i) => v.detecciones.map((d) => ({ ...d, vueloId: ids[i].id })));
      if (det.length) await tx.insert(schema.detecciones).values(det);
    }
    if (salida.cosechas.length) await tx.insert(schema.cosechas).values(salida.cosechas);
    await tx
      .insert(schema.resumenDiarioLote)
      .values(salida.resumen)
      .onConflictDoUpdate({
        target: [schema.resumenDiarioLote.loteId, schema.resumenDiarioLote.fecha],
        set: { indiceRiesgo: sql`excluded.indice_riesgo`, eventosActivos: sql`excluded.eventos_activos` },
      });
    // Upsert de brotes: los ya existentes cambian de estado/fecha de cierre
    const eventos = eventosAFilas(estado.eventos, estado.dia - 1, inicio);
    for (const ev of eventos) {
      await tx
        .insert(schema.eventosEnfermedad)
        .values(ev)
        .onConflictDoUpdate({
          target: schema.eventosEnfermedad.claveSim,
          set: {
            fechaDeteccion: ev.fechaDeteccion,
            fechaFin: ev.fechaFin,
            severidadMax: ev.severidadMax,
            origen: ev.origen,
            estado: ev.estado,
            tratamiento: ev.tratamiento,
          },
        });
    }
    // Poda de brotes viejos en memoria para que el estado no crezca sin límite
    estado.eventos = estado.eventos.filter((e) => e.diaInicio + e.duracion >= estado.dia - 60);
    await tx.update(schema.estadoSimulador).set({ estado, actualizadoEn: new Date() }).where(eq(schema.estadoSimulador.id, 1));
  });

  return NextResponse.json({
    ok: true,
    fecha: salida.fecha,
    lecturas: salida.lecturas.length,
    vuelos: salida.vuelos.length,
    brotesTotales: estado.eventos.length,
  });
}
