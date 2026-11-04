"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "../actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, null);
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="pw-new">New password</Label>
        <Input id="pw-new" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pw-confirm">Type it again</Label>
        <Input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
      </div>
      {state === "saved" ? (
        <p role="status" className="text-sm text-muted-foreground">Password changed. Use it next time you sign in.</p>
      ) : (
        state && <p role="alert" className="text-sm text-alert">{state}</p>
      )}
      <Button disabled={pending} className="justify-self-start">{pending ? "Saving…" : "Change password"}</Button>
    </form>
  );
}
