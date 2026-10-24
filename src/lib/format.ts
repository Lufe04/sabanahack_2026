import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export const fmtNum = (n: number | null | undefined, d = 0) =>
  n === null || n === undefined || Number.isNaN(n)
    ? "—"
    : new Intl.NumberFormat("es-CO", { maximumFractionDigits: d, minimumFractionDigits: d }).format(n);

export const fmtPct = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? "—" : `${fmtNum(n, d)} %`);

/** Colombia es UTC-5 todo el año (sin horario de verano). */
const OFFSET_BOGOTA_MIN = 300;

/**
 * Convierte un instante a "hora de pared" de Bogotá para formatearlo igual
 * en el servidor (Vercel corre en UTC) y en cualquier navegador.
 */
function aBogota(d: Date): Date {
  return new Date(d.getTime() + (d.getTimezoneOffset() - OFFSET_BOGOTA_MIN) * 60_000);
}

export const fmtFecha = (s: string | Date | null | undefined, patron = "d MMM") => {
  if (!s) return "—";
  // Fechas sin hora ("2026-10-23") ya son días de calendario: no se desplazan.
  const esInstante = s instanceof Date || s.includes("T");
  const d = typeof s === "string" ? parseISO(s) : s;
  return format(esInstante ? aBogota(d) : d, patron, { locale: es });
};

export const fmtFechaHora = (s: string | Date | null | undefined) => fmtFecha(s, "d MMM, HH:mm");

export const fmtHace = (s: string | Date | null | undefined) => {
  if (!s) return "—";
  const d = typeof s === "string" ? parseISO(s) : s;
  return `hace ${formatDistanceToNowStrict(d, { locale: es })}`;
};

export const fmtMes = (yyyymm: string) => {
  const [y, m] = yyyymm.split("-").map(Number);
  return format(new Date(y, m - 1, 1), "MMM yy", { locale: es });
};
