import { getKpis, getRankingLotes, getTasaBrotePorCondicion, getBrotesPorDrenaje, getResumenEnfermedades } from "../src/lib/queries/analitica";
import { getLotesEstado, getSerieDiariaFinca, getEventos } from "../src/lib/queries/lotes";
import { getSensoresEstado, getSerieHorariaFinca } from "../src/lib/queries/sensores";
import { closeDb } from "../src/db";
(async () => {
  console.log("KPIs", await getKpis());
  console.log("Ranking", (await getRankingLotes()).slice(0, 3));
  console.log("Tasa humedad aire", await getTasaBrotePorCondicion("horas_humedad_alta"));
  console.log("Tasa humedad suelo", await getTasaBrotePorCondicion("temp_prom"));
  console.log("Drenaje", await getBrotesPorDrenaje());
  console.log("Enfermedades", await getResumenEnfermedades());
  console.log("Lotes estado", (await getLotesEstado()).slice(0, 1));
  console.log("Serie finca", (await getSerieDiariaFinca(5)));
  console.log("Eventos abiertos", (await getEventos({ soloAbiertos: true })).length);
  const s = await getSensoresEstado(); console.log("Sensores", s.filter(x => x.estado !== "ok"));
  console.log("Serie horaria", (await getSerieHorariaFinca(3)).slice(0, 4));
  await closeDb();
})().catch(e => { console.error(e); process.exit(1); });
