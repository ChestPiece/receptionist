import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "../page-frame";

export default function Loading() {
  return (
    <>
      <PageHeader title="Inbox" />
      <PageBody className="p-3 sm:p-4">
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[320px_1fr]">
          <div className="slip grid content-start gap-px overflow-hidden">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[84px] rounded-none" />)}
          </div>
          <Skeleton className="max-lg:hidden" />
        </div>
      </PageBody>
    </>
  );
}
