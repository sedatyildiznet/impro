import { describe, expect, it } from "vitest";
import { toMatrixUserId, validateUsername, assertImproMatrixId } from "@impro/shared";

describe("username + matrix id", () => {
  it("accepts a localpart and maps to @user:impro.chat", () => {
    const v = validateUsername("Alice");
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.username).toBe("alice");
      expect(toMatrixUserId(v.username)).toBe("@alice:impro.chat");
    }
  });

  it("rejects reserved and illegal forms", () => {
    expect(validateUsername("admin").ok).toBe(false);
    expect(validateUsername("_ghost").ok).toBe(false);
    expect(validateUsername("alice.chat").ok).toBe(true);
  });

  it("never uses app.impro.chat or matrix.impro.chat as the ID suffix", () => {
    expect(toMatrixUserId("alice")).toBe("@alice:impro.chat");
    expect(toMatrixUserId("burak")).toBe("@burak:impro.chat");
    expect(() => assertImproMatrixId("@alice:matrix.impro.chat")).toThrow();
    expect(() => assertImproMatrixId("@alice:app.impro.chat")).toThrow();
    expect(() => assertImproMatrixId("@alice:impro.chat")).not.toThrow();
  });
});
