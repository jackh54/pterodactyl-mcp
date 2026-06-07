import "dotenv/config";
import { loadConfig } from "./config.js";
import { startServer } from "./http.js";

const config = loadConfig();
startServer(config);
