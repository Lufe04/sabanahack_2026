// Captura cada página con Chrome local y reporta errores de consola.
import { chromium } from "playwright-core";
const base = process.env.BASE_URL ?? "http://localhost:3210";
const rutas = { home: "/", lotes: "/lotes", lote: "/lotes/L04", brotes: "/brotes", historial: "/historial", analitica: "/analitica", sensores: "/sensores" };
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, colorScheme: process.env.DARK ? "dark" : "light" });
const errores = [];
page.on("console", (m) => { if (m.type() === "error") errores.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on("pageerror", (e) => errores.push(`[pageerror] ${e.message.slice(0, 300)}`));
for (const [n, r] of Object.entries(rutas)) {
  await page.goto(base + r, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1500);
  const fuente = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  const charts = await page.locator(".recharts-surface").count();
  const mapa = await page.locator(".leaflet-container").count();
  await page.screenshot({ path: `/tmp/cap_${n}${process.env.DARK ? "_dark" : ""}.png`, fullPage: true });
  console.log(`${n}: charts=${charts} mapa=${mapa} fuente=${fuente.slice(0, 60)}`);
}
console.log(errores.length ? "ERRORES:\n" + [...new Set(errores)].join("\n") : "Sin errores de consola");
await browser.close();
