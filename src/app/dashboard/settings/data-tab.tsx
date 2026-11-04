"use client";

// Owner only: clear whole categories of clinic data. The server re-checks the role, the list and the typed name.
import { useState } from "react";
import { WIPE_KINDS, type WipeKind } from "@/lib/wipe";
import { ConfirmDelete } from "../confirm-delete";
import { wipeData } from "./actions";

const ROWS: Record<WipeKind, { label: string; what: string }> = {
  patients: { label: "Patients", what: "Every patient, with their visits, chats, messages and activity." },
  chats: { label: "Chats", what: "All messages and Sara's chat memory. Patients and visits stay." },
  calendar: { label: "Calendar", what: "Every visit, past and upcoming." },
  dentists: { label: "Dentists", what: "Every dentist, their time off and the services they offer." },
  services: { label: "Services", what: "Every service. Past visits keep the service name." },
  activity: { label: "Activity log", what: "The Activity page history." },
};
const SHOWN: WipeKind[] = ["patients", "chats", "calendar", "dentists", "services", "activity"];

export function DataTab({ clinicName, counts }: { clinicName: string; counts: Record<WipeKind, number> }) {
  const [picked, setPicked] = useState<WipeKind[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const has = (k: WipeKind) => picked.includes(k) || (k === "calendar" && picked.includes("dentists"));
  const toggle = (k: WipeKind) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const chosen = WIPE_KINDS.filter(has);
  const names = chosen.map((k) => `${ROWS[k].label.toLowerCase()} (${counts[k]})`).join(", ");

  return (
    <section className="grid max-w-2xl gap-4">
      <div>
        <h2 className="text-base font-semibold">Delete clinic data</h2>
        <p className="text-sm text-muted-foreground">Pick what to clear. Clinic details, opening hours, branding and staff accounts stay.</p>
      </div>
      <ul className="divide-y rounded-xl border bg-card">
        {SHOWN.map((k) => {
          const forced = k === "calendar" && picked.includes("dentists");
          return (
            <li key={k}>
              <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/50">
                <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={has(k)} disabled={forced} onChange={() => toggle(k)} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{ROWS[k].label}</span>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">{counts[k]}</span>
                  </span>
                  <span className="block text-xs text-muted-foreground">{forced ? "Included: dentists can't be deleted while they have visits." : ROWS[k].what}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <ConfirmDelete
          label={chosen.length ? `Delete ${chosen.length} ${chosen.length === 1 ? "category" : "categories"}` : "Delete selected"}
          disabled={!chosen.length}
          title="Delete clinic data?"
          body={`This deletes all ${names} for ${clinicName}.`}
          confirmText={clinicName}
          run={(typed) => wipeData(chosen, typed)}
          after={() => { setDone(`Deleted ${names}.`); setPicked([]); }}
        />
        {done && <p role="status" className="text-sm text-muted-foreground">{done}</p>}
      </div>
    </section>
  );
}
