import { Suspense } from "react";
import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/ledger";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarInset, SidebarProvider, SidebarRail } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { stillPaused } from "@/lib/agent";
import { desk } from "@/lib/dashboard";
import { signOut } from "./actions";
import { ClinicSwitcher, InboxBadge, Live, Nav, SettingsLink } from "./shell";

// Dashboard is per-user (auth cookies), so it renders on request instead of prerendering.
export const instant = false;
export const metadata: Metadata = { title: { default: "Receptionist Agent", template: "%s · Receptionist Agent" } };

// Fixed-height app shell: the root is h-dvh and never scrolls, only panes inside the pages do.
// The logo and nav render at once; the clinic switcher, Inbox count, Settings link and pages stream in behind Suspense.
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <SidebarProvider className="h-dvh min-h-0 overflow-hidden">
      <Sidebar collapsible="icon">
        <SidebarHeader className="gap-2">
          <Logo className="px-2 pt-1 text-xl group-data-[collapsible=icon]:hidden" />
          <Suspense fallback={<Skeleton className="h-12 w-full" />}>
            <Switcher />
          </Suspense>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <Nav inboxBadge={<Suspense fallback={null}><NeedsStaff /></Suspense>} settings={<Suspense fallback={null}><Settings /></Suspense>} />
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <Suspense fallback={<Skeleton className="h-9 w-full" />}>
            <User />
          </Suspense>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">{children}</SidebarInset>
    </SidebarProvider>
  );
}

async function Switcher() {
  const { clinics, clinic, email } = await desk();
  if (!clinic) {
    return <p className="px-2 text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">Your account ({email}) is not linked to a clinic. Ask the clinic owner to add you.</p>;
  }
  return (
    <>
      <ClinicSwitcher clinics={clinics.map((c) => ({ id: c.id, name: c.name }))} current={{ id: clinic.id, name: clinic.name }} />
      <Live clinicId={clinic.id} />
    </>
  );
}

async function Settings() {
  const { clinic } = await desk();
  return clinic?.role === "owner" ? <SettingsLink /> : null;
}

async function NeedsStaff() {
  const { sb, clinic } = await desk();
  if (!clinic) return null;
  const { data: convos } = await sb.from("conversations").select("bot_paused, updated_at, patients!inner(clinic_id)").eq("patients.clinic_id", clinic.id).eq("bot_paused", true);
  return <InboxBadge count={(convos ?? []).filter((c) => stillPaused(c)).length} />;
}

async function User() {
  const { email, clinic } = await desk();
  return (
    <div className="flex items-center gap-2 group-data-[collapsible=icon]:flex-col">
      <Avatar className="size-8 shrink-0">
        <AvatarFallback className="bg-sidebar-accent text-xs font-medium">{(email || "?").charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
        <p className="truncate text-xs font-medium" title={email}>{email}</p>
        <form action={signOut}>
          <button className="text-xs text-muted-foreground hover:text-foreground">Sign out{clinic?.role === "owner" ? " · owner" : ""}</button>
        </form>
      </div>
      <ThemeToggle />
    </div>
  );
}
