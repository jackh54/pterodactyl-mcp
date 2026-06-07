import { describe, expect, it } from "vitest";
import { tokenFingerprint } from "../src/auth/middleware.js";

describe("tokenFingerprint", () => {
  it("masks the middle of the token", () => {
    const fp = tokenFingerprint("ptlc_abcdefghijklmnopqrstuvwxyz");
    expect(fp.startsWith("ptlc_abc")).toBe(true);
    expect(fp.endsWith("wxyz")).toBe(true);
    expect(fp).toContain("…");
  });
});
