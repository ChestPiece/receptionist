// Settings > Data: which categories an owner can clear, and the order that keeps foreign keys happy.
export const WIPE_KINDS = ["chats", "calendar", "activity", "patients", "services", "dentists"] as const; // delete order
export type WipeKind = (typeof WIPE_KINDS)[number];

// Dentists with visits cannot go (appointments.dentist_id is on delete restrict), so dentists bring the calendar along.
export function wipePlan(picked: unknown): WipeKind[] | null {
  if (!Array.isArray(picked) || !picked.length || !picked.every((k) => (WIPE_KINDS as readonly unknown[]).includes(k))) return null;
  const set = new Set<WipeKind>(picked);
  if (set.has("dentists")) set.add("calendar");
  return WIPE_KINDS.filter((k) => set.has(k));
}
