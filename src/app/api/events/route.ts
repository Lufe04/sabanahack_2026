/**
 * Receptor de la APK Cultivos a bordo (adaptador 0.2.2).
 * POST: observaciones y estados de recorrido, con INGEST_API_KEY.
 * GET: consulta entre servidores con DASHBOARD_READ_API_KEY. Nunca desde el navegador.
 */
export { POST, GET } from "@/lib/cultivos/servicio";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
