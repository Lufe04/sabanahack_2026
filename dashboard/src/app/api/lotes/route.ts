import { NextResponse } from "next/server";
import { getLotesEstado } from "@/lib/queries/lotes";

/** GET /api/lotes: estado actual de cada lote (riesgo, humedad, brotes) y su contorno. */
export async function GET() {
  const lotes = await getLotesEstado();
  return NextResponse.json({ lotes, generadoEn: new Date().toISOString() });
}
