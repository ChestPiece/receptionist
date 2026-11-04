"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeNext } from "@/lib/safety";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// No sign-up: staff accounts are invited from the Supabase dashboard (see 0005_dashboard.sql).
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const linkFailed = params.get("error") === "link";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(linkFailed ? "That sign-in link expired. Ask for a new one." : "");

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setNote("Email or password is wrong.");
    router.replace(next);
    router.refresh();
  }

  async function sendLink() {
    if (!email) return setNote("Type your email first.");
    setBusy(true);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(false);
    setNote(error ? "Could not send the link. Try again." : "Check your email for a sign-in link.");
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Staff sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">Inbox, calendar and patients for your clinic.</p>
        <form onSubmit={signIn} className="mt-8 grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium">
            Email
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Password
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <Button type="submit" disabled={busy} size="lg" className="mt-2">Sign in</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={sendLink}>Email me a sign-in link</Button>
          <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{note}</p>
        </form>
    </div>
  );
}
