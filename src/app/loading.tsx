import { Skeleton } from "@/components/ui/skeleton";

export default function Cargando() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <Skeleton className="h-80" />
      <Skeleton className="h-60" />
    </div>
  );
}
