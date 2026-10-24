"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const MapaLotesLazy = dynamic(() => import("./mapa-lotes").then((m) => m.MapaLotes), {
  ssr: false,
  loading: () => <Skeleton className="h-[360px] w-full rounded-md" />,
});
