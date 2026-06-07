import { describe, expect, it } from "vitest";
import { tailLines } from "../src/pterodactyl/console-output.js";

describe("tailLines", () => {
  it("returns the last non-empty lines", () => {
    expect(tailLines("one\ntwo\nthree\n", 2)).toEqual(["two", "three"]);
  });

  it("strips ansi sequences", () => {
    expect(tailLines("\x1b[31merror\x1b[0m\nok\n", 2)).toEqual(["error", "ok"]);
  });
});
