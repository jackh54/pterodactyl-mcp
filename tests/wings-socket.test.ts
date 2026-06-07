import { describe, expect, it } from "vitest";
import { normalizeWingsSocketUrl } from "../src/pterodactyl/wings-socket.js";

describe("normalizeWingsSocketUrl", () => {
  it("returns the original URL when no override is configured", () => {
    const socket = "wss://internal.node:8080/api/servers/abc/ws";
    expect(normalizeWingsSocketUrl(socket)).toBe(socket);
  });

  it("replaces the host when an override is configured", () => {
    expect(
      normalizeWingsSocketUrl(
        "wss://10.0.0.5:8080/api/servers/abc/ws",
        "node.example.com:8080",
      ),
    ).toBe("wss://node.example.com:8080/api/servers/abc/ws");
  });
});
