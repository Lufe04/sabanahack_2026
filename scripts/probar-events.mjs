// Pruebas del contrato POST/GET /api/events contra un servidor (local por defecto).
// Uso: BASE_URL=http://localhost:3000 INGEST_API_KEY=... READ_KEY=... FOTO=ruta.jpg node scripts/probar-events.mjs
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const KEY = process.env.INGEST_API_KEY;
const READ = process.env.READ_KEY;
const foto = process.env.FOTO ? readFileSync(process.env.FOTO).toString("base64") : null;
let fallos = 0;

async function post(body, headers = { authorization: `Bearer ${KEY}` }) {
  const r = await fetch(`${B}/api/events`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
}
function esperar(nombre, real, esperado, extra = () => true) {
  const ok = real.status === esperado && extra(real.json);
  if (!ok) fallos++;
  console.log(`${ok ? "OK  " : "FALLA"} ${nombre}: HTTP ${real.status} ${JSON.stringify(real.json).slice(0, 160)}`);
}

const plan = randomUUID(), insp = randomUUID(), wp1 = randomUUID(), wp2 = randomUUID();
const obs = (extra = {}) => ({
  id: randomUUID(), schema_version: 2, type: "observation", captured_at: "2026-10-24T15:00:00Z",
  mission: "PRUEBA AUTOMATIZADA", model_version: "experimental-v5",
  scores: { alternaria: 0.02, botrytis: 0.03, sana: 0.93, trips: 0.02 }, alert: false, capture_mode: "periodic",
  photo_filename: null, photo_mime: null, photo_base64: null,
  route_context: { inspection_id: insp, plan_id: plan, lot_id: "L01", waypoint_id: wp1, location: null },
  location: null, status: "experimental_requires_review", device: "android", crop: "blueberry", ...extra,
});

const ids = [];
const a = obs(); ids.push(a.id);
esperar("sin token", await post(a, {}), 401);
esperar("lectura periódica nueva", await post(a), 201, (j) => j.new === true && j.status === "stored" && j.id === a.id);
esperar("reintento mismo contenido", await post(a), 200, (j) => j.new === false);
esperar("mismo UUID con otro contenido", await post({ ...a, scores: { ...a.scores, sana: 0.5 } }), 409);
esperar("lote inexistente", await post(obs({ route_context: { ...a.route_context, lot_id: "L99" } })), 422, (j) => Array.isArray(j.lotesValidos));
esperar("puntuación fuera de rango", await post(obs({ scores: { ...a.scores, trips: 1.4 } })), 400);
esperar("foto con prefijo data:", await post(obs({ photo_mime: "image/jpeg", photo_base64: "data:image/jpeg;base64,AAAA" })), 400);
esperar("JSON inválido", await post("{no es json"), 400);
if (foto) {
  const b = obs({ alert: true, capture_mode: "automatic", photo_filename: "alerta.jpg", photo_mime: "image/jpeg", photo_base64: foto,
    scores: { alternaria: 0.04, botrytis: 0.86, sana: 0.06, trips: 0.04 }, location: { lat: 4.98965, lng: -73.89782, accuracy_m: 6.5 } });
  ids.push(b.id);
  esperar("alerta con foto", await post(b), 201);
  esperar("reintento de alerta con foto", await post(b), 200, (j) => j.new === false);
}
const legado = { id: randomUUID(), captured_at: "2026-10-20T12:00:00Z", scores: { alternaria: 0.1, botrytis: 0.1, sana: 0.7, trips: 0.1 } };
ids.push(legado.id);
esperar("captura de versión anterior sin lote", await post(legado), 201);

const snap = (rev, completo, fase) => ({
  id: randomUUID(), type: "route_snapshot", captured_at: `2026-10-24T15:0${rev}:00Z`,
  route: { id: insp, plan_id: plan, lot_id: "L01", name: "PRUEBA AUTOMATIZADA", phase: fase, completed: false, revision: rev,
    updated_at: `2026-10-24T15:0${rev}:00Z`,
    waypoints: [{ id: wp1, order: 1, completed: completo >= 1, location: { lat: 4.98965, lng: -73.89782, accuracy_m: 8 } }, { id: wp2, order: 2, completed: completo >= 2, location: null }] },
});
const s2 = snap(2, 1, "paused_charging"), s1 = snap(1, 0, "in_progress");
ids.push(s2.id, s1.id);
esperar("recorrido revisión 2", await post(s2), 201);
esperar("recorrido revisión 1 llega tarde", await post(s1), 201);

const lista = await fetch(`${B}/api/events?after=0&lote=L01`, { headers: { authorization: `Bearer ${READ}` } });
const lj = await lista.json();
esperar("GET sin clave de lectura", { status: (await fetch(`${B}/api/events`)).status, json: {} }, 401);
esperar("GET con cursor", { status: lista.status, json: { n: lj.registros?.length, siguiente: lj.siguiente } }, 200, (j) => j.n >= 1);
const conFoto = lj.registros?.find((r) => r.tiene_foto);
if (conFoto) {
  const f = await fetch(`${B}/api/events/${conFoto.id}/photo`, { headers: { authorization: `Bearer ${READ}` } });
  esperar("GET foto", { status: f.status, json: { tipo: f.headers.get("content-type"), bytes: (await f.arrayBuffer()).byteLength } }, 200, (j) => j.tipo === "image/jpeg");
}
const sinFoto = await fetch(`${B}/api/events/${a.id}/photo`, { headers: { authorization: `Bearer ${READ}` } });
esperar("GET foto inexistente", { status: sinFoto.status, json: {} }, 404);

console.log(JSON.stringify({ insp, ids }));
console.log(fallos ? `\n${fallos} pruebas fallaron` : "\nTodas las pruebas pasaron");
process.exitCode = fallos ? 1 : 0;
