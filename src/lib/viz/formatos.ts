import { fmtFecha, fmtFechaHora, fmtMes, fmtNum } from "@/lib/format";

/** Formatos serializables para pasar de componentes de servidor a gráficas de cliente. */
export type FormatoEje = "fecha" | "fechaHora" | "mes" | "texto";

export function formatearEje(tipo: FormatoEje | undefined, v: unknown): string {
  const s = String(v ?? "");
  switch (tipo) {
    case "fecha":
      return fmtFecha(s);
    case "fechaHora":
      return fmtFechaHora(s);
    case "mes":
      return fmtMes(s);
    default:
      return s;
  }
}

export const formatearValor = (decimales: number | undefined, v: number) => fmtNum(v, decimales ?? 0);
