"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { TooltipCaja, TooltipFila } from "./tooltip";
import { formatearEje, type FormatoEje } from "@/lib/viz/formatos";

type Props = {
  datos: Record<string, unknown>[];
  claveX: string;
  series: { clave: string; nombre: string; color: string }[];
  formatoX?: FormatoEje;
  alto?: number;
};

export function BarrasApiladas({ datos, claveX, series, formatoX = "texto", alto = 240 }: Props) {
  const fx = (v: unknown) => formatearEje(formatoX, v);
  return (
    <div style={{ height: alto }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={claveX} tickFormatter={fx} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "var(--viz-empty)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const total = payload.reduce((a, p) => a + Number(p.value ?? 0), 0);
              return (
                <TooltipCaja titulo={`${fx(label)} · ${total} brotes`}>
                  {payload
                    .slice()
                    .reverse()
                    .map((p) => {
                      const s = series.find((x) => x.clave === p.dataKey);
                      if (!s || !p.value) return null;
                      return <TooltipFila key={s.clave} color={s.color} nombre={s.nombre} valor={String(p.value)} />;
                    })}
                </TooltipCaja>
              );
            }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          {series.map((s, i) => (
            <Bar
              key={s.clave}
              dataKey={s.clave}
              name={s.nombre}
              stackId="a"
              fill={s.color}
              stroke="var(--viz-surface)"
              strokeWidth={1}
              maxBarSize={36}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
