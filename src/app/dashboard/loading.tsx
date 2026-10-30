import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <section className="grid gap-4 border-b py-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">This week</h1>
        <Skeleton className="h-4 w-56" />
      </section>
      <div className="flex flex-wrap gap-x-8 gap-y-3 border-b py-4">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-40" />)}
      </div>
      <div className="grid grid-cols-1 gap-7 py-8 xl:grid-cols-[340px_1fr]">
        <Skeleton className="h-[320px]" />
        <Skeleton className="h-[600px]" />
      </div>
    </>
  );
}
