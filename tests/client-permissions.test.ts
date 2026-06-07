import { describe, expect, it } from "vitest";
import { PterodactylClient } from "../src/pterodactyl/client.js";
import type { ServerDetails } from "../src/pterodactyl/client.js";

function server(overrides: Partial<ServerDetails>): ServerDetails {
  return {
    identifier: "abc12345",
    uuid: "abc12345-0000-0000-0000-000000000000",
    internalId: 1,
    name: "Test",
    description: "",
    node: "node1",
    status: null,
    isSuspended: false,
    isInstalling: false,
    invocation: "",
    dockerImage: "",
    limits: { memory: 1024, swap: 0, disk: 1024, io: 500, cpu: 100 },
    userPermissions: [],
    isServerOwner: false,
    ...overrides,
  };
}

describe("PterodactylClient.hasPermission", () => {
  const client = new PterodactylClient("https://panel.example.com", "ptlc_test");

  it("grants all permissions to server owners", () => {
    expect(
      client.hasPermission(
        server({ isServerOwner: true, userPermissions: [] }),
        "control.console",
      ),
    ).toBe(true);
  });

  it("grants permissions when user_permissions contains wildcard", () => {
    expect(
      client.hasPermission(
        server({ userPermissions: ["*"] }),
        "control.console",
      ),
    ).toBe(true);
  });

  it("checks explicit permission strings for subusers", () => {
    const subuser = server({ userPermissions: ["file.read", "control.start"] });
    expect(client.hasPermission(subuser, "control.start")).toBe(true);
    expect(client.hasPermission(subuser, "control.console")).toBe(false);
  });
});
