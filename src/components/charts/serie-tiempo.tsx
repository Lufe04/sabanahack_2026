"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  BarChart,
  Bar,
} from "recharts";
import { TooltipCaja, TooltipFila } from "./tooltip";
import { formatearEje, formatearValor, type FormatoEje } from "@/lib/viz/formatos";

export type Serie = { clave: string; nombre: string; color: string; unidad?: string; punteada?: boolean };

type Props = {
  datos: Record<string, unknown>[];
  series: Serie[];
  claveX?: string;
  formatoX?: FormatoEje;
  decimalesY?: number;
  alto?: number;
  tipo?: "linea" | "area" | "barra";
  dominioY?: [number | "auto", number | "auto"];
  lineaRef?: { y: number; etiqueta: string };
  sinLeyenda?: boolean;
};

const ejes = {
  tick: { fontSize: 11 },
  axisLine: false as const,
  tickLine: false as const,
};

export function SerieTiempo({
  datos,
  series,
  claveX = "fecha",
  formatoX = "fecha",
  decimalesY = 0,
  alto = 220,
  tipo = "linea",
  dominioY,
  lineaRef,
  sinLeyenda,
}: Props) {
  const fx = (v: unknown) => formatearEje(formatoX, v);
  const fy = (v: number) => formatearValor(decimalesY, v);
  const Contenedor = tipo === "area" ? AreaChart : tipo === "barra" ? BarChart : LineChart;
  const mostrarLeyenda = !sinLeyenda && series.length > 1;

  return (
    <div style={{ height: alto }} className="w-full text-muted-foreground">
      <ResponsiveContainer width="100%" height="100%">
        <Contenedor data={datos} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="0" />
          <XAxis dataKey={claveX} tickFormatter={fx} {...ejes} minTickGap={28} />
          <YAxis tickFormatter={fy} {...ejes} domain={dominioY} width={48} allowDecimals={decimalesY > 0} />
          <Tooltip
            cursor={{ stroke: "var(--viz-axis)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <TooltipCaja titulo={fx(label)}>
                  {payload.map((p) => {
                    const s = series.find((x) => x.clave === p.dataKey);
                    if (!s || p.value === null || p.value === undefined) return null;
                    return (
                      <TooltipFila
                        key={s.clave}
                        color={s.color}
                        nombre={s.nombre}
                        valor={`${fy(Number(p.value))}${s.unidad ? ` ${s.unidad}` : ""}`}
                      />
                    );
                  })}
                </TooltipCaja>
              );
            }}
          />
          {mostrarLeyenda ? (
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          ) : null}
          {lineaRef ? (
            <ReferenceLine
              y={lineaRef.y}
              stroke="var(--viz-muted)"
              strokeDasharray="4 3"
              label={{ value: lineaRef.etiqueta, fontSize: 10, fill: "var(--viz-muted)", position: "insideTopRight" }}
            />
          ) : null}
          {series.map((s) =>
            tipo === "area" ? (
              <Area
                key={s.clave}
                type="monotone"
                dataKey={s.clave}
                name={s.nombre}
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.12}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--viz-surface)" }}
                connectNulls
                isAnimationActive={false}
              />
            ) : tipo === "barra" ? (
              <Bar
                key={s.clave}
                dataKey={s.clave}
                name={s.nombre}
                fill={s.color}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                isAnimationActive={false}
              />
            ) : (
              <Line
                key={s.clave}
                type="monotone"
                dataKey={s.clave}
                name={s.nombre}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.punteada ? "4 3" : undefined}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--viz-surface)" }}
                connectNulls
                isAnimationActive={false}
              />
            ),
          )}
        </Contenedor>
      </ResponsiveContainer>
    </div>
  );
}
