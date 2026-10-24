import { pasoSecuencial } from "@/lib/viz/palette";

type Props = {
  filas: { clave: string; etiqueta: string }[];
  columnas: { clave: string; etiqueta: string }[];
  valores: Map<string, number>; // `${fila}|${columna}`
  unidad?: string;
};

/** Heatmap con rampa secuencial de un solo tono. Claro = cerca de cero. */
export function Heatmap({ filas, columnas, valores, unidad = "" }: Props) {
  const max = Math.max(0, ...valores.values());
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="w-24 text-left font-normal text-muted-foreground" />
            {columnas.map((c) => (
              <th key={c.clave} className="pb-1 text-center font-normal text-muted-foreground">
                {c.etiqueta}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clave}>
              <th className="pr-2 text-left font-normal text-muted-foreground">{f.etiqueta}</th>
              {columnas.map((c) => {
                const v = valores.get(`${f.clave}|${c.clave}`) ?? 0;
                const oscuro = max > 0 && v / max > 0.55;
                return (
                  <td
                    key={c.clave}
                    title={`${f.etiqueta} · ${c.etiqueta}: ${v}${unidad}`}
                    className="h-8 min-w-10 rounded-sm text-center tabular-nums"
                    style={{ background: pasoSecuencial(v, max), color: oscuro ? "#fff" : v > 0 ? "var(--foreground)" : "var(--viz-muted)" }}
                  >
                    {v > 0 ? v : "·"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
