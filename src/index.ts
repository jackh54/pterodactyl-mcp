import "dotenv/config";
import { loadConfig } from "./config.js";
import { startServer } from "./http.js";

try {
  const config = loadConfig();
  startServer(config);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to start pterodactyl-mcp: ${message}`);
  process.exit(1);
}
