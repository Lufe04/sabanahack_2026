import { Siren } from "lucide-react";
import { etiquetaCaptura } from "@/lib/cultivos/clases";

/** Etiqueta visible de una lectura: Alerta, Normal, Foto manual o Referencia de punto. */
export function EtiquetaCaptura({ alerta, modo }: { alerta: boolean | null | undefined; modo: string | null | undefined }) {
  const e = etiquetaCaptura(alerta, modo);
  return e.alerta ? (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--status-critical)]"><Siren className="size-3.5" />{e.texto}</span>
  ) : (
    <span className="text-sm">{e.texto}</span>
  );
}
