import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "../page-frame";

export default function Loading() {
  return (
    <>
      <PageHeader title="Settings" />
      <PageBody className="p-3 sm:p-4">
        <div className="grid w-full max-w-4xl content-start gap-3">
          {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-9" />)}
        </div>
      </PageBody>
    </>
  );
}
