"use client";

// Owner-only delete with a confirm step. The server action re-checks the role (and RLS checks it again).
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  title: string;
  body: ReactNode;
  run: (typed: string) => Promise<{ error?: string }>; // typed = the confirmText the owner entered
  after?: () => void;
  redirectTo?: string; // for server pages, which cannot pass `after`
  label?: string;
  disabled?: boolean;
  icon?: boolean;
  confirmText?: string; // the owner must type this (e.g. the clinic name) before Delete unlocks
};

export function ConfirmDelete({ title, body, run, after, redirectTo, label = "Delete", disabled, icon, confirmText }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      const r = await run(typed);
      if (r.error) return setError(r.error);
      setOpen(false);
      after?.();
      if (redirectTo) router.push(redirectTo);
    });
  return (
    <>
      {icon ? (
        <Button type="button" size="icon" variant="ghost" className="size-8 text-alert hover:text-alert" aria-label={label} disabled={disabled} onClick={() => { setError(null); setOpen(true); }}>
          <Trash2Icon />
        </Button>
      ) : (
        <Button type="button" size="sm" variant="outline" className="text-alert hover:text-alert" disabled={disabled} onClick={() => { setError(null); setTyped(""); setOpen(true); }}>
          <Trash2Icon />{label}
        </Button>
      )}
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{body} This cannot be undone.</DialogDescription>
          </DialogHeader>
          {confirmText && (
            <label className="grid gap-1.5 text-sm">
              <span>Type <strong className="font-semibold">{confirmText}</strong> to confirm</span>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
            </label>
          )}
          {error && <p role="alert" className="text-sm text-alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Keep</Button>
            <Button type="button" variant="destructive" onClick={go} disabled={pending || (!!confirmText && typed.trim() !== confirmText.trim())}>{pending ? "Deleting…" : label}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Bulk delete for a server-rendered list: rows carry plain <input type="checkbox" data-pick={group} value={id}>,
// this bar counts the ticked ones and deletes them. No client state in the list itself.
export function BulkDelete({ group, noun, run, body }: { group: string; noun: string; run: (ids: string[]) => Promise<{ error?: string }>; body: string }) {
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    const sel = `input[data-pick="${group}"]`;
    const read = () => setPicked([...document.querySelectorAll<HTMLInputElement>(`${sel}:checked`)].map((i) => i.value));
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.pickAll === group) document.querySelectorAll<HTMLInputElement>(sel).forEach((i) => (i.checked = t.checked));
      if (t.matches(sel) || t.dataset.pickAll === group) read();
    };
    document.addEventListener("change", onChange);
    read();
    return () => document.removeEventListener("change", onChange);
  }, [group]);
  if (!picked.length) return null;
  const n = picked.length;
  return (
    <ConfirmDelete
      label={`Delete ${n} ${noun}${n === 1 ? "" : "s"}`}
      title={`Delete ${n} ${noun}${n === 1 ? "" : "s"}?`}
      body={body}
      run={() => run(picked)}
      after={() => setPicked([])}
    />
  );
}
