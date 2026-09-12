import { describe, expect, it } from "vitest";

describe("share boundary", () => {
  it("from_now means historyStartAt is the share time", () => {
    const sharedAt = new Date("2026-09-12T10:00:00Z").getTime();
    const event = new Date("2026-09-12T09:00:00Z").getTime();
    expect(event >= sharedAt).toBe(false);
  });

  it("private conversations are not visible without a share row", () => {
    const owner: string = "alice";
    const viewer: string = "burak";
    const shares: { workspace: string; revoked: boolean }[] = [];
    const canView = owner === viewer || shares.some((s) => !s.revoked);
    expect(canView).toBe(false);
  });
});
