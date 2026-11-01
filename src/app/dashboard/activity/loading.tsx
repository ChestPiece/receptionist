import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "../page-frame";

export default function Loading() {
  return (
    <>
      <PageHeader title="Activity" />
      <PageBody className="p-3 sm:p-4">
        <div className="slip grid content-start gap-3 p-4">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-8" />)}
        </div>
      </PageBody>
    </>
  );
}
