import { describe, expect, it } from "vitest";
import { searchConsoleLines } from "../src/pterodactyl/console-output.js";

describe("searchConsoleLines", () => {
  const lines = [
    "[INFO] Server started",
    "[WARN] Low memory detected",
    "[ERROR] Connection refused",
    "[INFO] Player joined",
  ];

  it("returns all lines when no query", () => {
    const result = searchConsoleLines(lines);
    expect(result.lines).toEqual(lines);
    expect(result.totalMatches).toBe(4);
  });

  it("filters by substring", () => {
    const result = searchConsoleLines(lines, { query: "error", caseInsensitive: true });
    expect(result.lines).toEqual(["[ERROR] Connection refused"]);
    expect(result.matchedLineNumbers).toEqual([3]);
  });

  it("supports case-insensitive search", () => {
    const result = searchConsoleLines(lines, { query: "info", caseInsensitive: true });
    expect(result.totalMatches).toBe(2);
  });

  it("supports regex search", () => {
    const result = searchConsoleLines(lines, { query: "\\[(INFO|WARN)\\]", regex: true });
    expect(result.totalMatches).toBe(3);
  });

  it("supports invert match", () => {
    const result = searchConsoleLines(lines, { query: "ERROR", invert: true });
    expect(result.totalMatches).toBe(3);
  });

  it("limits max matches", () => {
    const result = searchConsoleLines(lines, { query: "INFO", maxMatches: 1 });
    expect(result.totalMatches).toBe(1);
  });
});
