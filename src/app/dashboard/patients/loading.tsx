import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b py-8">
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">Patients</h1>
        <Skeleton className="h-10 w-72" />
      </header>
      <div className="slip mt-6 grid gap-3 p-4">
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-8" />)}
      </div>
    </>
  );
}
