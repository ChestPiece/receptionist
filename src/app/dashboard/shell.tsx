"use client";

import { ActivityIcon, CalendarDaysIcon, ChevronsUpDownIcon, FlaskConicalIcon, InboxIcon, LayoutListIcon, SettingsIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { supabaseBrowser } from "@/lib/supabase/client";
import { markActivitySeen, pickClinic } from "./actions";

const NAV = [
  { href: "/dashboard", label: "Today", icon: LayoutListIcon },
  { href: "/dashboard/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDaysIcon },
  { href: "/dashboard/patients", label: "Patients", icon: UsersIcon },
  { href: "/dashboard/activity", label: "Activity", icon: ActivityIcon },
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

// The badges (by href) and `settings` stream in behind Suspense (they need the signed-in user); the links themselves render at once.
export function Nav({ badges, settings }: { badges?: Record<string, ReactNode>; settings?: ReactNode }) {
  return (
    <SidebarMenu>
      {NAV.map((n) => (
        <NavLink key={n.href} {...n}>{badges?.[n.href]}</NavLink>
      ))}
      {settings}
    </SidebarMenu>
  );
}

// Opens the clinic's own chat in test mode: these chats are marked as test data and kept out of the numbers.
export const TestSaraLink = ({ slug }: { slug: string }) => (
  <SidebarMenuItem>
    <SidebarMenuButton asChild tooltip="Test Sara" className="h-9">
      <a href={`/chat/${slug}?test=1`} target="_blank" rel="noopener">
        <FlaskConicalIcon />
        <span>Test Sara</span>
      </a>
    </SidebarMenuButton>
  </SidebarMenuItem>
);

export const SettingsLink = () => <NavLink href="/dashboard/settings" label="Settings" icon={SettingsIcon} />;

export const CountBadge = ({ count }: { count: number }) =>
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

// Re-renders the page when this clinic's chats, visits or activity change (staff pauses refresh on their own; a bot handoff always logs a message). RLS limits what Realtime sends.
export function Live({ clinicId }: { clinicId: string }) {
  const router = useRouter();
  useEffect(() => {
    const sb = supabaseBrowser();
    let t: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(t);
      t = setTimeout(() => router.refresh(), 1000);
    };
    let channel: ReturnType<typeof sb.channel> | undefined;
    let gone = false;
    // The socket must carry the user's token before joining, or it joins as anon and RLS drops every row.
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => { if (s) sb.realtime.setAuth(s.access_token); });
    void sb.auth.getSession().then(async ({ data }) => {
      if (gone) return;
      if (data.session) await sb.realtime.setAuth(data.session.access_token);
      if (gone) return;
      channel = sb
      .channel(`desk-${clinicId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `clinic_id=eq.${clinicId}` }, soon)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `clinic_id=eq.${clinicId}` }, soon)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_events", filter: `clinic_id=eq.${clinicId}` }, soon)
      .subscribe((status, err) => { if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.error("[realtime]", status, err?.message); });
    });
    return () => {
      gone = true;
      clearTimeout(t);
      sub.subscription.unsubscribe();
      if (channel) sb.removeChannel(channel);
    };
  }, [clinicId, router]);
  return null;
}

// Mounted by the Activity page: marks it seen so the sidebar badge clears.
export function SeenActivity() {
  useEffect(() => { void markActivitySeen(); }, []);
  return null;
}
