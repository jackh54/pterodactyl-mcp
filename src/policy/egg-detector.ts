import type { PolicyPreset } from "./command-policy.js";
import type { ServerDetails } from "../pterodactyl/client.js";

export function detectEggPreset(server: Pick<ServerDetails, "dockerImage" | "invocation">): PolicyPreset | null {
  const haystack = `${server.dockerImage} ${server.invocation}`.toLowerCase();

  if (/minecraft|paper|spigot|bukkit|forge|fabric|velocity|waterfall|purpur|pufferfish|server\.jar/.test(haystack)) {
    return "minecraft";
  }
  if (/rust/.test(haystack)) {
    return "rust";
  }

  return null;
}
