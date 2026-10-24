// Prueba de punta a punta del receptor de la APK contra un servidor real (local o producción).
// Envía los JSON generados por Android (tests/adaptador/*-fixtures.json) por HTTP y verifica
// respuestas, reintentos, la consulta con cursor y las fotos. Imprime los IDs creados.
//
// Uso: BASE_URL=http://localhost:3000 INGEST_API_KEY=... READ_KEY=... node scripts/probar-apk.mjs
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const KEY = process.env.INGEST_API_KEY;
const READ = process.env.READ_KEY;
const leer = (f) => JSON.parse(readFileSync(new URL(`../tests/adaptador/${f}`, import.meta.url), "utf8"));
let fallos = 0;
const creados = [];

const post = async (body, token = KEY) => {
  const r = await fetch(`${B}/api/events`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: typeof body === "string" ? body : JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const get = async (ruta, token = READ) => {
  const r = await fetch(`${B}${ruta}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: r.status, r };
};
function revisar(nombre, ok, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "OK   " : "FALLA"} ${nombre}${detalle ? ` · ${detalle}` : ""}`);
}

// 1. JSON reales de Android: modo asistido, demo por tiempo y demo con geometría (L01 y L02)
for (const archivo of ["android-fixtures.json", "android-simulation-fixtures.json", "android-mapped-fixtures.json"]) {
  const eventos = leer(archivo);
  const estados = [];
  for (const e of eventos) {
    const r = await post(e);
    estados.push(r.status);
    if (r.status === 201 || r.status === 200) creados.push(e.id);
    else console.log("   respuesta:", JSON.stringify(r.json));
  }
  revisar(`${archivo}: ${eventos.length} eventos aceptados`, estados.every((s) => s === 201 || s === 200), estados.join(","));
}

// 2. Reintento exacto: misma confirmación, sin otra fila
const muestra = leer("android-simulation-fixtures.json").find((e) => e.photo_base64);
const re = await post(muestra);
revisar("reintento del mismo UUID con foto", re.status === 200 && re.json?.new === false && re.json?.id === muestra.id, `HTTP ${re.status}`);

// 3. Rechazos del contrato
const base = leer("android-fixtures.json").find((e) => e.type === "observation" && e.capture_mode === "periodic");
const cambiado = { ...structuredClone(base), scores: { alternaria: 0.9, botrytis: 0.03, sana: 0.05, trips: 0.02 } };
revisar("UUID reutilizado con otro contenido", (await post(cambiado)).status === 409);
const loteMalo = structuredClone(base); loteMalo.id = randomUUID(); loteMalo.route_context.lot_id = "L99";
revisar("bloque fuera del catálogo de /api/lotes", (await post(loteMalo)).status === 422);
const alertaSinFoto = structuredClone(base); alertaSinFoto.id = randomUUID(); alertaSinFoto.alert = true;
revisar("alerta sin foto", (await post(alertaSinFoto)).status === 400);
revisar("token inválido", (await post(base, "malo")).status === 401);

// 4. Los recorridos ya no se muestran, pero el receptor sigue aceptando sus estados
const feed = await get("/api/recorridos");
revisar("feed /api/recorridos retirado", feed.status === 404);
const pagina = await fetch(`${B}/recorridos`, { redirect: "manual" });
revisar("/recorridos redirige a Capturas", pagina.status === 307 || pagina.status === 308);

// 5. Consulta entre servidores y foto
const lista = await (await get("/api/events?after=0")).r.json();
revisar("GET /api/events lista con cursor", Array.isArray(lista.registros) && lista.registros.length > 0, `${lista.registros?.length} registros, siguiente=${lista.siguiente}`);
const conFoto = lista.registros.find((r) => r.tiene_foto);
const foto = await get(`/api/events/${conFoto?.id}/photo`);
revisar("foto JPEG entre servidores", foto.status === 200 && foto.r.headers.get("content-type") === "image/jpeg");
revisar("los registros de demo vienen marcados como simulados", lista.registros.some((r) => r.simulado === true) && lista.registros.some((r) => r.simulado === false));

console.log("IDS_CREADOS=" + JSON.stringify(creados));
console.log(fallos ? `\n${fallos} pruebas fallaron` : "\nTodas las pruebas pasaron");
process.exitCode = fallos ? 1 : 0;
