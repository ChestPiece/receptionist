"use client";

import { CalendarDaysIcon, ChevronsUpDownIcon, InboxIcon, LayoutListIcon, SettingsIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { supabaseBrowser } from "@/lib/supabase/client";
import { pickClinic } from "./actions";

const NAV = [
  { href: "/dashboard", label: "Today", icon: LayoutListIcon },
  { href: "/dashboard/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDaysIcon },
  { href: "/dashboard/patients", label: "Patients", icon: UsersIcon },
];

function NavLink({ href, label, icon: Icon, children }: { href: string; label: string; icon: typeof InboxIcon; children?: ReactNode }) {
  const path = usePathname();
  const { setOpenMobile } = useSidebar();
  const active = href === "/dashboard" ? path === href : path.startsWith(href);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={label} className="h-9 data-[active=true]:bg-card data-[active=true]:shadow-[var(--shadow-slip)] data-[active=true]:ring-1 data-[active=true]:ring-border">
        <Link href={href} aria-current={active ? "page" : undefined} onClick={() => setOpenMobile(false)}>
          <Icon />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
      {children}
    </SidebarMenuItem>
  );
}

// `inboxBadge` and `settings` stream in behind Suspense (they need the signed-in user); the links themselves render at once.
export function Nav({ inboxBadge, settings }: { inboxBadge?: ReactNode; settings?: ReactNode }) {
  return (
    <SidebarMenu>
      {NAV.map((n) => (
        <NavLink key={n.href} {...n}>{n.href === "/dashboard/inbox" && inboxBadge}</NavLink>
      ))}
      {settings}
    </SidebarMenu>
  );
}

export const SettingsLink = () => <NavLink href="/dashboard/settings" label="Settings" icon={SettingsIcon} />;

export const InboxBadge = ({ count }: { count: number }) =>
  count > 0 ? <SidebarMenuBadge className="rounded-full bg-alert px-1.5 text-white peer-data-[active=true]/menu-button:text-white">{count}</SidebarMenuBadge> : null;

// With several clinics the header is a dropdown; with one it is a plain label.
export function ClinicSwitcher({ clinics, current }: { clinics: { id: string; name: string }[]; current: { id: string; name: string } }) {
  const label = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">{current.name.charAt(0)}</span>
      <span className="min-w-0 flex-1 truncate text-start text-sm font-medium">{current.name}</span>
    </>
  );
  if (clinics.length < 2) return <SidebarMenuButton size="lg" className="pointer-events-none">{label}</SidebarMenuButton>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" aria-label="Switch clinic">
          {label}
          <ChevronsUpDownIcon className="ms-auto size-4 text-muted-foreground" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        {clinics.map((c) => (
          <DropdownMenuItem
            key={c.id}
            onSelect={() => {
              const f = new FormData();
              f.set("clinic", c.id);
              void pickClinic(f);
            }}
          >
            {c.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Re-renders the page when this clinic's chats or visits change (staff pauses refresh on their own; a bot handoff always logs a message). RLS limits what Realtime sends.
export function Live({ clinicId }: { clinicId: string }) {
  const router = useRouter();
  useEffect(() => {
    const sb = supabaseBrowser();
    let t: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(t);
      t = setTimeout(() => router.refresh(), 1000);
    };
    const channel = sb
      .channel(`desk-${clinicId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `clinic_id=eq.${clinicId}` }, soon)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `clinic_id=eq.${clinicId}` }, soon)
      .subscribe();
    return () => {
      clearTimeout(t);
      sb.removeChannel(channel);
    };
  }, [clinicId, router]);
  return null;
}
