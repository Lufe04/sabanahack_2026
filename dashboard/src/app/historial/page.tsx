import Link from "next/link";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Encabezado, Seccion } from "@/components/dashboard/encabezado";
import { Kpi } from "@/components/dashboard/kpi";
import { EnfermedadBadge } from "@/components/dashboard/badges";
import { LineaTiempoBrotes } from "@/components/dashboard/linea-tiempo";
import { BarrasApiladas } from "@/components/charts/barras-apiladas";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getLotesEstado } from "@/lib/queries/lotes";
import {
  getBrotesPeriodo,
  getLotesEnfermosPorDia,
  getProduccionPorLote,
  getProduccionSemanal,
  PRECIO_COP_KG,
} from "@/lib/queries/historial";
import { ENFERMEDADES } from "@/db/schema";
import { COLOR_ENFERMEDAD, NOMBRE_ENFERMEDAD } from "@/lib/viz/palette";
import { fmtNum, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PERIODOS = [
  { dias: 30, etiqueta: "Último mes" },
  { dias: 60, etiqueta: "Últimos 2 meses" },
  { dias: 90, etiqueta: "Últimos 3 meses" },
  { dias: 180, etiqueta: "Últimos 6 meses" },
];

const fmtCop = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0, notation: n >= 1_000_000 ? "compact" : "standard" }).format(n);

function Delta({ actual, previo, invertido = false, unidad = "" }: { actual: number; previo: number; invertido?: boolean; unidad?: string }) {
  const d = actual - previo;
  if (Math.abs(d) < 0.05) return <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="size-3" />igual</span>;
  const malo = invertido ? d < 0 : d > 0;
  const Icono = d > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs", malo ? "text-[var(--status-critical)]" : "text-[var(--status-good-text)]")}>
      <Icono className="size-3" />{d > 0 ? "+" : ""}{fmtNum(d, unidad === "%" ? 1 : 0)}{unidad}
    </span>
  );
}

export default async function Historial({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const q = await searchParams;
  const dias = PERIODOS.some((p) => String(p.dias) === q.dias) ? Number(q.dias) : 60;
  const periodo = PERIODOS.find((p) => p.dias === dias)!;

  const [lotes, brotes, enfermosDia, produccion, semanal] = await Promise.all([
    getLotesEstado(),
    getBrotesPeriodo(dias),
    getLotesEnfermosPorDia(dias),
    getProduccionPorLote(dias),
    getProduccionSemanal(dias),
  ]);

  const hoy = enfermosDia[enfermosDia.length - 1]?.fecha ?? new Date().toISOString().slice(0, 10);
  const desde = enfermosDia[0]?.fecha ?? hoy;
  const kgCosechados = produccion.reduce((a, p) => a + p.kgCosechados, 0);
  const kgPerdidos = produccion.reduce((a, p) => a + p.kgDescartados, 0);
  const kgPerdidosPrev = produccion.reduce((a, p) => a + p.kgDescartadosPrev, 0);
  const pctPerdida = (100 * kgPerdidos) / Math.max(1, kgCosechados + kgPerdidos);
  const brotesTotal = produccion.reduce((a, p) => a + p.brotes, 0);
  const brotesPrev = produccion.reduce((a, p) => a + p.brotesPrev, 0);
  const peorLote = produccion[0];

  return (
    <>
      <Encabezado
        titulo="Historial y pérdidas"
        descripcion="Qué ha pasado en la finca: cuánta fruta se perdió, qué bloques estuvieron enfermos y cuándo. Cada período se compara con el período anterior de igual duración."
        acciones={
          <div className="flex flex-wrap gap-1.5">
            {PERIODOS.map((p) => (
              <Link
                key={p.dias}
                href={`/historial?dias=${p.dias}`}
                className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", p.dias === dias ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground")}
              >
                {p.etiqueta}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi etiqueta="Fruta perdida por plagas" valor={fmtNum(kgPerdidos)} unidad="kg" detalle={<Delta actual={kgPerdidos} previo={kgPerdidosPrev} unidad=" kg" />} />
        <Kpi etiqueta="Pérdida sobre lo cosechado" valor={fmtPct(pctPerdida, 1)} detalle={`≈ ${fmtCop(kgPerdidos * PRECIO_COP_KG)} de ${fmtNum(kgCosechados / 1000, 1)} t cosechadas`} tono={pctPerdida > 6 ? "malo" : "neutro"} />
        <Kpi etiqueta="Brotes en el período" valor={brotesTotal} detalle={<Delta actual={brotesTotal} previo={brotesPrev} />} />
      </div>

      <Seccion titulo="Línea de tiempo de brotes por bloque" descripcion={`Cada barra es un brote, desde que inició hasta que se cerró. ${periodo.etiqueta}.`} className="mt-4">
        <LineaTiempoBrotes brotes={brotes} lotes={lotes} desde={desde} hasta={hoy} />
      </Seccion>

      <div className="mt-4">
        <Seccion titulo="Fruta perdida por semana" descripcion="Kilos descartados por semana, según la plaga responsable. Gris: descarte normal de cosecha.">
          <BarrasApiladas
            datos={semanal}
            claveX="semana"
            series={[
              ...ENFERMEDADES.map((e) => ({ clave: e, nombre: NOMBRE_ENFERMEDAD[e], color: COLOR_ENFERMEDAD[e] })),
              { clave: "otros", nombre: "Sin plaga", color: "var(--viz-axis)" },
            ]}
            formatoX="fecha"
            alto={240}
          />
        </Seccion>
      </div>

      <Seccion titulo="¿Dónde se perdió la fruta?" descripcion={`Kilos perdidos, brotes y días con enfermedad en ${periodo.etiqueta.toLowerCase()}, comparados con el período anterior.`} className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bloque</TableHead>
              <TableHead className="text-right">Cosechado</TableHead>
              <TableHead className="text-right">Perdido</TableHead>
              <TableHead className="text-right">% pérdida</TableHead>
              <TableHead>vs. anterior</TableHead>
              <TableHead className="text-right">Valor perdido</TableHead>
              <TableHead className="text-right">Brotes</TableHead>
              <TableHead className="text-right">Días enfermo</TableHead>
              <TableHead>Principal causa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {produccion.map((p) => (
              <TableRow key={p.loteId}>
                <TableCell><Link href={`/bloques/${p.loteId}`} className="font-medium hover:underline">{p.nombre}</Link></TableCell>
                <TableCell className="text-right tabular-nums">{fmtNum(p.kgCosechados)} kg</TableCell>
                <TableCell className="text-right tabular-nums">{fmtNum(p.kgDescartados)} kg</TableCell>
                <TableCell className="text-right tabular-nums">{fmtPct(p.pctPerdida, 1)}</TableCell>
                <TableCell><Delta actual={p.pctPerdida} previo={p.pctPerdidaPrev} unidad="%" /></TableCell>
                <TableCell className="text-right tabular-nums">{fmtCop(p.kgDescartados * PRECIO_COP_KG)}</TableCell>
                <TableCell className="text-right tabular-nums">{p.brotes} <Delta actual={p.brotes} previo={p.brotesPrev} /></TableCell>
                <TableCell className="text-right tabular-nums">{p.diasEnfermo} <Delta actual={p.diasEnfermo} previo={p.diasEnfermoPrev} /></TableCell>
                <TableCell>{p.plagaPrincipal ? <EnfermedadBadge enfermedad={p.plagaPrincipal} /> : <span className="text-muted-foreground">—</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {peorLote ? (
          <p className="mt-3 text-xs text-muted-foreground">
            <Link href={`/bloques/${peorLote.loteId}`} className="font-medium text-foreground underline">{peorLote.nombre}</Link> concentra el {fmtPct((100 * peorLote.kgDescartados) / Math.max(1, kgPerdidos), 0)} de la fruta perdida del período.
            El valor usa un precio de referencia de {fmtNum(PRECIO_COP_KG)} pesos por kilo en finca; cámbialo en el código según el mercado.
          </p>
        ) : null}
      </Seccion>

    </>
  );
}
