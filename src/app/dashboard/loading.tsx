import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "./page-frame";

export default function Loading() {
  return (
    <>
      <PageHeader title="Today" />
      <PageBody className="p-3 sm:p-4">
        <div className="flex gap-8 pb-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-36" />)}</div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[340px_1fr]">
          <Skeleton className="max-xl:h-80" />
          <Skeleton className="max-xl:h-[34rem]" />
        </div>
      </PageBody>
    </>
  );
}
