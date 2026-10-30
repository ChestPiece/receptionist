import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b py-8">
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">Calendar</h1>
        <Skeleton className="h-4 w-28" />
      </header>
      <div className="grid gap-6 py-6">
        <Skeleton className="h-[600px]" />
      </div>
    </>
  );
}
