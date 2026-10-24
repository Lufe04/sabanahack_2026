import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export const fmtNum = (n: number | null | undefined, d = 0) =>
  n === null || n === undefined || Number.isNaN(n)
    ? "—"
    : new Intl.NumberFormat("es-CO", { maximumFractionDigits: d, minimumFractionDigits: d }).format(n);

export const fmtPct = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? "—" : `${fmtNum(n, d)} %`);

export const fmtFecha = (s: string | Date | null | undefined, patron = "d MMM") => {
  if (!s) return "—";
  const d = typeof s === "string" ? parseISO(s) : s;
  return format(d, patron, { locale: es });
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
