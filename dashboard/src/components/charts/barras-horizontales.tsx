"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, Cell } from "recharts";
import { TooltipCaja, TooltipFila } from "./tooltip";
import { formatearValor } from "@/lib/viz/formatos";

type Props = {
  datos: { etiqueta: string; valor: number; detalle?: string; color?: string }[];
  nombreValor: string;
  color?: string;
  decimales?: number;
  alto?: number;
};

/** Ranking: una serie, un color. El orden lo da la longitud, no el tono. */
export function BarrasHorizontales({ datos, nombreValor, color = "var(--series-1)", decimales = 0, alto }: Props) {
  const formato = (v: number) => formatearValor(decimales, v);
  const h = alto ?? Math.max(120, datos.length * 30 + 16);
  return (
    <div style={{ height: h }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="etiqueta"
            width={84}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--viz-empty)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as Props["datos"][number];
              return (
                <TooltipCaja titulo={d.etiqueta}>
                  <TooltipFila color={d.color ?? color} nombre={nombreValor} valor={formato(d.valor)} />
                  {d.detalle ? <div>{d.detalle}</div> : null}
                </TooltipCaja>
              );
            }}
          />
          <Bar dataKey="valor" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
            {datos.map((d, i) => (
              <Cell key={i} fill={d.color ?? color} />
            ))}
            <LabelList dataKey="valor" position="right" formatter={(v: unknown) => formato(Number(v))} style={{ fontSize: 11, fill: "var(--viz-muted)" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
