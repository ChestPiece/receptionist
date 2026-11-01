import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

// Every dashboard page is a PageHeader (56px: title + actions) over a PageBody that fills the rest and never grows the page.
// Pages put their own scroll on an inner pane (ScrollArea or overflow-y-auto), never on the page.
export function PageHeader({ title, children, className }: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4", className)}>
      <SidebarTrigger className="-ms-1" />
      <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-[-0.01em]">{title}</h1>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </header>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-h-0 flex-1 flex-col", className)}>{children}</div>;
}
