/** Corre la simulación sin lecturas y muestra conteos para calibrar el modelo. */
import { generarHistorial } from "../src/lib/simulador";

const h = generarHistorial({ conLecturas: false, seed: Number(process.env.SEED ?? 7) });
console.log(`Brotes detectados: ${h.eventos.length}, brotes totales: ${h.estado.eventos.length}`);

const porLote: Record<string, number> = {};
const porEnf: Record<string, number> = {};
const porOrigen: Record<string, number> = {};
const porEstado: Record<string, number> = {};
const porMes: Record<string, number> = {};
for (const ev of h.eventos) {
  porLote[ev.loteId] = (porLote[ev.loteId] ?? 0) + 1;
  porEnf[ev.enfermedad] = (porEnf[ev.enfermedad] ?? 0) + 1;
  porOrigen[ev.origen] = (porOrigen[ev.origen] ?? 0) + 1;
  porEstado[ev.estado ?? "?"] = (porEstado[ev.estado ?? "?"] ?? 0) + 1;
  const mes = ev.fechaInicio.slice(0, 7);
  porMes[mes] = (porMes[mes] ?? 0) + 1;
}
console.log("Por lote:", porLote);
console.log("Por enfermedad:", porEnf);
console.log("Por origen:", porOrigen);
console.log("Por estado:", porEstado);
console.log("Por mes:", porMes);

const ultimo = h.resumen.filter((r) => r.fecha === h.resumen[h.resumen.length - 1].fecha);
console.log("Riesgo hoy:", ultimo.map((r) => `${r.loteId}:${r.indiceRiesgo}`).join(" "));
const hsProm: Record<string, number[]> = {};
for (const r of h.resumen) (hsProm[r.loteId] ??= []).push(r.humedadSueloProm ?? 0);
console.log(
  "Humedad suelo prom:",
  Object.entries(hsProm).map(([k, v]) => `${k}:${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}`).join(" "),
);
const horas = h.resumen.filter((r) => r.loteId === "B01").map((r) => r.horasHumedadAlta ?? 0);
console.log("Horas humedad alta prom L01:", (horas.reduce((a, b) => a + b, 0) / horas.length).toFixed(1));

const kg = h.cosechas.reduce((a, c) => a + c.kgCosechados, 0);
const desc = h.cosechas.reduce((a, c) => a + c.kgDescartados, 0);
console.log(`Cosechas: ${h.cosechas.length} filas, ${kg.toFixed(0)} kg cosechados, ${desc.toFixed(0)} kg descartados (${((100 * desc) / (kg + desc)).toFixed(1)} %)`);
