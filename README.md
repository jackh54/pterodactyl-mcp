# pterodactyl-mcp

MCP server for [Pterodactyl Panel](https://pterodactyl.io). Lets AI clients like Cursor connect over HTTP, authenticate with a Pterodactyl Client API key, and manage only the servers that key has access to.

## Features (Phase 1)

- **Streamable HTTP** MCP transport at `/mcp`
- **Bearer auth** via Pterodactyl Client API keys (`ptlc_*`)
- **Tools:**
  - `list_accessible_servers` — list servers for the authenticated user
  - `get_server` — server details and effective permissions
  - `get_server_resources` — CPU, memory, disk, power state
  - `send_console_command` — send a console command (with blocklist policy)
- **Command blocklist** — rejects dangerous patterns (`sudo`, `op`, `stop`, etc.)
- **Audit logging** — JSON-lines log of every tool invocation
- **Admin toggle** — disable MCP with `MCP_ENABLED=false`
- **Rate limiting** — per API key, configurable per minute

## Quick start

### 1. Create a Pterodactyl Client API key

In your panel: **Account → API Credentials → Create API Key**

Grant only the permissions you want the AI to have. For console commands, the key needs `control.console` on the target server(s).

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

Add a remote MCP server in Cursor settings:

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

Replace the URL with your deployed MCP server address when not running locally.

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

## Security model

1. **No admin keys** — only Pterodactyl **Client** API keys (`ptlc_*`) are accepted.
2. **Panel ACL** — every tool call is scoped to the key owner's servers and permissions.
3. **Command policy** — blocklist rejects high-risk console commands before they reach Wings.
4. **Audit trail** — all tool calls are logged with user, server, and outcome.

## Architecture

```
Cursor (MCP client)
    │  HTTPS + Bearer ptlc_*
    ▼
pterodactyl-mcp (/mcp)
    │  Pterodactyl Client API
    ▼
Pterodactyl Panel → Wings → Game servers
```

## Development

```bash
npm run dev      # hot reload
npm test         # unit tests
npm run typecheck
```

## Roadmap

- **Phase 2:** WebSocket console output, power actions, MCP resources
- **Phase 3:** Panel Laravel addon, full OAuth 2.1 login flow
- **Phase 4:** Egg-specific command presets, file read tools

## License

MIT
