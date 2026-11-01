import { describe, expect, it } from "vitest";
import { roleOf } from "./role";

describe("roleOf", () => {
  const rows = [{ clinic_id: "a", role: "owner" }, { clinic_id: "b", role: "staff" }];
  it("reads the membership role for the clinic", () => {
    expect(roleOf(rows, "a")).toBe("owner");
    expect(roleOf(rows, "b")).toBe("staff");
  });
  // platform_admins has no read policy; RLS shows a clinic without a membership only to platform admins.
  it("treats a visible clinic without a membership row as a platform admin (owner)", () => {
    expect(roleOf(rows, "c")).toBe("owner");
    expect(roleOf([], "c")).toBe("owner");
  });
});
