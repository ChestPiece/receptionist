import { Logo } from "@/components/logo";
import type { Metadata } from "next";
import { ThemeToggle } from "@/components/ledger";
import { stillPaused } from "@/lib/agent";
import { desk } from "@/lib/dashboard";
import { pickClinic, signOut } from "./actions";
import { Live, Nav } from "./shell";

// Dashboard is per-user (auth cookies), so it renders on request instead of prerendering.
export const instant = false;
export const metadata: Metadata = { title: { default: "Receptionist Agent", template: "%s · Receptionist Agent" } };

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const { sb, clinics, clinic, email } = await desk();
  if (!clinic) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="slip max-w-sm p-6">
          <h1 className="font-serif text-2xl">No clinic yet</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your account ({email}) is not linked to a clinic. Ask the clinic owner to add you.</p>
          <form action={signOut} className="mt-5">
            <button className="rounded-full bg-foreground px-4 py-2 text-sm text-background">Sign out</button>
          </form>
        </div>
      </main>
    );
  }

  const { data: convos } = await sb.from("conversations").select("bot_paused, updated_at, patients!inner(clinic_id)").eq("patients.clinic_id", clinic.id).eq("bot_paused", true);
  const needsStaff = (convos ?? []).filter((c) => stillPaused(c)).length;

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 border-b p-4 md:sticky md:top-0 md:h-dvh md:w-56 md:border-e md:border-b-0">
        <div className="flex items-center justify-between">
          <Logo className="text-xl" />
          <div className="flex items-center gap-1 md:hidden">
            <form action={signOut}>
              <button className="px-2 text-xs text-muted-foreground hover:text-foreground">Sign out</button>
            </form>
            <ThemeToggle />
          </div>
        </div>
        {clinics.length > 1 ? (
          <form action={pickClinic} className="grid gap-1">
            <label htmlFor="clinic" className="label">Clinic</label>
            <select id="clinic" name="clinic" defaultValue={clinic.id} className="h-9 rounded-[4px] border bg-card px-2 text-sm">
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button className="justify-self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">Switch</button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">{clinic.name}</p>
        )}
        <Nav needsStaff={needsStaff} />
        <div className="mt-auto hidden items-center justify-between gap-2 border-t pt-3 md:flex">
          <form action={signOut}>
            <button className="text-xs text-muted-foreground hover:text-foreground" title={email}>Sign out</button>
          </form>
          <ThemeToggle />
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 pb-16 sm:px-8">{children}</main>
      <Live clinicId={clinic.id} />
    </div>
  );
}
