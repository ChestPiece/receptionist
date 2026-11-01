import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "../page-frame";

export default function Loading() {
  return (
    <>
      <PageHeader title="Calendar" />
      <PageBody className="p-3 sm:p-4">
        <Skeleton className="min-h-0 flex-1" />
      </PageBody>
    </>
  );
}
