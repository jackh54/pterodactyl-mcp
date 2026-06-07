# pterodactyl-mcp

MCP server for [Pterodactyl Panel](https://pterodactyl.io). Lets AI clients like Cursor connect over HTTP, authenticate with a Pterodactyl Client API key, and manage only the servers that key has access to.

## Features

### Phase 1
- **Streamable HTTP** MCP transport at `/mcp`
- **Bearer auth** via Pterodactyl Client API keys (`ptlc_*`)
- **Tools:** `list_accessible_servers`, `get_server`, `get_server_resources`, `send_console_command`
- **Command blocklist**, audit logging, rate limiting, admin toggle

### Phase 2
- **`get_console_output`** — fetch recent console logs via WebSocket
- **`send_console_command`** — optional `wait_for_output` to capture command response
- **Command policy modes:** `strict`, `standard`, `admin` with egg presets (`generic`, `minecraft`, `rust`)
- **MCP resources:** `server://{id}/status`, `server://list`
- **MCP prompt:** `diagnose_server` — structured troubleshooting workflow

## Quick start

### 1. Create a Pterodactyl Client API key

In your panel: **Account → API Credentials → Create API Key**

Grant only the permissions you want the AI to have. Console tools require `control.console` on target server(s).

### 2. Configure

```bash
cp .env.example .env
# Edit .env — set PTERODACTYL_PANEL_URL to your panel URL
```

### 3. Run

```bash
npm install
npm run dev
# or
npm run build && npm start
```

### Docker

```bash
export PTERODACTYL_PANEL_URL=https://panel.example.com
docker compose up -d
```

## Connect from Cursor

```json
{
  "mcpServers": {
    "pterodactyl": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer ptlc_YOUR_CLIENT_API_KEY"
      }
    }
  }
}
```

## MCP tools

| Tool | Description |
|------|-------------|
| `list_accessible_servers` | List all servers for the authenticated user |
| `get_server` | Server details and effective permissions |
| `get_server_resources` | CPU, memory, disk, power state |
| `get_console_output` | Recent console log lines via WebSocket |
| `send_console_command` | Send a console command; set `wait_for_output: true` to capture response |

## MCP resources

| URI | Description |
|-----|-------------|
| `server://list` | All accessible servers |
| `server://{server_id}/status` | Live status + resource usage for one server |

## MCP prompts

| Prompt | Description |
|--------|-------------|
| `diagnose_server` | Gathers status, resources, and recent logs; guides the AI through troubleshooting |

## Command policy modes

| Mode | Behavior |
|------|----------|
| `standard` (default) | Blocklist dangerous commands (`sudo`, `op`, `stop`, etc.) |
| `strict` | Only allowlisted commands (use `COMMAND_POLICY_PRESET` for game-specific lists) |
| `admin` | Minimal blocks — only shell-injection patterns |

```bash
COMMAND_POLICY_MODE=strict
COMMAND_POLICY_PRESET=minecraft
```

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PTERODACTYL_PANEL_URL` | Yes | — | Panel base URL (no trailing slash) |
| `HOST` | No | `0.0.0.0` | Bind address |
| `PORT` | No | `3000` | HTTP port |
| `MCP_ENABLED` | No | `true` | Master on/off switch |
| `AUDIT_LOG_PATH` | No | stdout | Path for JSON-lines audit log |
| `RATE_LIMIT_PER_MINUTE` | No | `60` | Max tool calls per API key per minute |
| `ALLOWED_HOSTS` | No | — | Comma-separated hosts for DNS rebinding protection |
| `COMMAND_POLICY_MODE` | No | `standard` | `strict`, `standard`, or `admin` |
| `COMMAND_POLICY_PRESET` | No | `generic` | `generic`, `minecraft`, or `rust` (strict mode) |
| `CONSOLE_MAX_LINES` | No | `100` | Max console lines per fetch |
| `CONSOLE_TIMEOUT_MS` | No | `8000` | WebSocket collect timeout |
| `CONSOLE_SESSION_IDLE_MS` | No | `300000` | Idle WebSocket session eviction |
| `CONSOLE_MAX_SESSIONS` | No | `32` | Max concurrent console sessions |

## Security model

1. **No admin keys** — only Pterodactyl **Client** API keys (`ptlc_*`) are accepted.
2. **Panel ACL** — every tool call is scoped to the key owner's servers and permissions.
3. **Command policy** — strict/standard/admin modes with game-specific allowlists.
4. **Audit trail** — all tool calls are logged with user, server, and outcome.

## Roadmap

- **Phase 3:** Power actions with confirmation, file read tools, Panel Laravel addon + OAuth
- **Phase 4:** Egg-specific policy overrides, metrics dashboard

## License

MIT
