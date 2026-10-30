import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b py-8">
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">Inbox</h1>
        <Skeleton className="h-8 w-48 rounded-full" />
      </header>
      <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-[320px_1fr]">
        <div className="slip grid gap-px overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[84px] rounded-none" />)}
        </div>
        <Skeleton className="min-h-[520px] max-lg:hidden lg:h-[calc(100dvh-180px)]" />
      </div>
    </>
  );
}
