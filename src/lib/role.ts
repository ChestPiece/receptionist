export type Role = "owner" | "staff";

// Clinics reach the dashboard only through RLS (is_member). A clinic with no membership row for this user is visible only
// to platform admins, who act as owner everywhere. (platform_admins itself has no read policy, so it is inferred.)
export function roleOf(memberships: { clinic_id: string; role: string }[], clinicId: string): Role {
  const m = memberships.find((x) => x.clinic_id === clinicId);
  return !m || m.role === "owner" ? "owner" : "staff";
}
