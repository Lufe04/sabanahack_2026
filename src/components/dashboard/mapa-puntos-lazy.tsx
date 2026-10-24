"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const MapaPuntosLazy = dynamic(() => import("./mapa-puntos").then((m) => m.MapaPuntos), {
  ssr: false,
  loading: () => <Skeleton className="h-[360px] w-full rounded-md" />,
});
