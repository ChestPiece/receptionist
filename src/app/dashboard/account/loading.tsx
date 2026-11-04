import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "../page-frame";

export default function Loading() {
  return (
    <>
      <PageHeader title="Account" />
      <PageBody className="p-3 sm:p-4">
        <div className="grid w-full max-w-md gap-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-56" />
        </div>
      </PageBody>
    </>
  );
}
