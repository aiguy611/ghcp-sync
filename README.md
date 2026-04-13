# ghcp-sync

Sync your GitHub Copilot configuration between machines via a lightweight Express server and CLI client.

## What It Syncs

- **~/.copilot/config.json** -- Copilot agent configuration
- **~/.copilot/copilot-instructions.md** -- Custom instructions for Copilot
- **~/.copilot/agents/** -- Agent definitions (recursive)
- **~/.copilot/hooks/** -- Hook scripts (recursive)
- **VS Code Copilot settings** -- Key-level merge of `github.copilot.*`, `chat.promptFilesLocations.*`, `chat.instructionsFilesLocations.*`, and `chat.agent.*` keys from VS Code's `settings.json`

Excluded from sync: `node_modules`, `dist`, `.git`, `logs`, `sessions`, `cache`.

## Architecture

```
  Machine A (push)                    Server                     Machine B (pull)
 +-----------------+          +-------------------+          +-----------------+
 | ~/.copilot/     |  gzip    |                   |  gzip    | ~/.copilot/     |
 |   config.json   | tarball  |   Express :3457   | tarball  |   config.json   |
 |   agents/       |--------->|                   |--------->|   agents/       |
 |   hooks/        |  PUT     |   data/           |  GET     |   hooks/        |
 |   copilot-      | /sync    |   copilot-config  | /sync    |   copilot-      |
 |   instructions  |          |   .tar.gz         |          |   instructions  |
 |                 |          |                   |          |                 |
 | VS Code         |          |   Auth: Bearer    |          | VS Code         |
 | settings.json   |          |   API key         |          | settings.json   |
 | (copilot keys)  |          |   (timing-safe)   |          | (key-level      |
 +-----------------+          +-------------------+          |  merge)         |
                                                             +-----------------+
```

## Prerequisites

- **Node.js** >= 18
- **pnpm** (preferred package manager)

## Setup

### 1. Clone and install

```bash
git clone https://github.com/aiguy611/ghcp-sync.git
cd ghcp-sync
pnpm install
pnpm build
```

### 2. Configure environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

### 3. Start the server

```bash
# Load env and start
source .env && pnpm server
```

The server listens on `http://0.0.0.0:3457` by default.

### 4. Run the client

```bash
# Set client env vars (or source .env)
export GHCP_SYNC_URL=http://your-server:3457
export GHCP_SYNC_KEY=your-shared-secret

# Push local config to server
pnpm push
# or
node dist/client/cli.js push

# Pull config from server
pnpm pull
# or
node dist/client/cli.js pull
```

### 5. Global CLI install (optional)

```bash
pnpm link --global
# Now available as:
ghcp-sync push
ghcp-sync pull
```

## Environment Variables

| Variable            | Used By | Default       | Description                          |
|---------------------|---------|---------------|--------------------------------------|
| `GHCP_SYNC_KEY`    | Both    | *(required)*  | Shared secret for Bearer auth        |
| `GHCP_SYNC_URL`    | Client  | *(required)*  | Server URL (e.g. `http://host:3457`) |
| `GHCP_SYNC_PORT`   | Server  | `3457`        | Port the server listens on           |
| `GHCP_SYNC_DATA_DIR` | Server | `./data`      | Directory to store config tarball    |
| `COPILOT_HOME`     | Client  | `~/.copilot`  | Override the copilot config directory|

## Usage Examples

### Push config to server

```bash
export GHCP_SYNC_URL=http://my-server:3457
export GHCP_SYNC_KEY=my-secret
ghcp-sync push
# Pushing 4 entries from /Users/you/.copilot
# Push complete. Uploaded 12.3 KB to server.
```

### Pull config from server

```bash
ghcp-sync pull
# Downloading config from server...
# Tarball verified: 8 entries.
# Cleaning existing config...
# Extracting config...
# Merged 5 copilot settings into VS Code.
# Pull complete. Extracted 8 entries to /Users/you/.copilot
```

### Health check

```bash
curl http://my-server:3457/health
# {"ok":true,"hasConfig":true,"configSize":12648}
```

The `/health` endpoint does not require authentication.

## macOS LaunchAgent (Auto-Start on Boot)

Create `~/Library/LaunchAgents/com.ghcp-sync.server.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ghcp-sync.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/ghcp-sync/dist/server/index.js</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>GHCP_SYNC_KEY</key>
        <string>your-shared-secret</string>
        <key>GHCP_SYNC_PORT</key>
        <string>3457</string>
        <key>GHCP_SYNC_DATA_DIR</key>
        <string>/path/to/ghcp-sync/data</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/ghcp-sync.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/ghcp-sync.err</string>
</dict>
</plist>
```

Load it:

```bash
launchctl load ~/Library/LaunchAgents/com.ghcp-sync.server.plist
```

## How It Works

### Push flow

1. The client scans `~/.copilot/` for allowlisted files and directories (`config.json`, `copilot-instructions.md`, `agents/`, `hooks/`).
2. It extracts `github.copilot.*` and related keys from your VS Code `settings.json`, writes them to a temporary file inside `~/.copilot/__vscode_settings/copilot-settings.json`.
3. Everything is packed into a gzipped tarball and streamed via `PUT /sync` to the server.
4. The server writes to a temp file first, then atomically rotates: current becomes `.bak`, temp becomes current.
5. The temporary VS Code settings directory is cleaned up locally.

### Pull flow

1. The client downloads the tarball via `GET /sync` to a temp file.
2. The tarball is verified by listing its entries (integrity check).
3. Existing synced files/directories in `~/.copilot/` are deleted.
4. The tarball is extracted into `~/.copilot/`.
5. If VS Code settings were included, they are **merged** into the local `settings.json` -- existing copilot keys are removed and replaced with the incoming ones. Non-copilot keys are untouched.
6. Temp files are cleaned up.

### VS Code Settings Handling

- **JSONC support**: VS Code `settings.json` may contain comments (`//`, `/* */`) and trailing commas. The client strips these before parsing.
- **Key-level merge**: Only keys matching these prefixes are touched: `github.copilot`, `chat.promptFilesLocations`, `chat.instructionsFilesLocations`, `chat.agent`. All other settings are preserved.
- **Comments are stripped on merge**: Because JSON does not support comments, any comments in the original `settings.json` will be lost in the copilot-key region after a pull/merge. Non-copilot portions are rewritten without comments as well (this is a known limitation of the JSON round-trip).
- **Cross-platform path detection**: The client auto-detects the `settings.json` location on macOS (`~/Library/Application Support/Code/User/settings.json`), Windows (`%APPDATA%/Code/User/settings.json`), and Linux (`~/.config/Code/User/settings.json`).

### Allowlist Approach

Rather than syncing everything in `~/.copilot/`, the tool uses an explicit allowlist of files and directories. This avoids syncing caches, logs, sessions, and other ephemeral data that should remain machine-local.

## Security Notes

- **API key authentication**: All endpoints except `/health` require a `Bearer` token matching the `GHCP_SYNC_KEY` environment variable.
- **Timing-safe comparison**: The server uses `crypto.timingSafeEqual` to prevent timing attacks on the API key.
- **No TLS by default**: The server listens on plain HTTP. For production use, place it behind a reverse proxy with TLS (e.g., nginx, Caddy) or use an SSH tunnel.
- **Shared secret**: The same `GHCP_SYNC_KEY` value must be set on both server and client. Treat it like a password.
- **Data directory permissions**: The tarball is stored in `./data/` (configurable). Ensure appropriate filesystem permissions.

## Windows Setup

On Windows, paths use the standard `%APPDATA%` location for VS Code settings. The client works the same way:

```powershell
$env:GHCP_SYNC_URL = "http://your-server:3457"
$env:GHCP_SYNC_KEY = "your-shared-secret"
node dist/client/cli.js push
node dist/client/cli.js pull
```

To run the server as a Windows service, use tools like [nssm](https://nssm.cc/) or [pm2](https://pm2.keymetrics.io/).

## Troubleshooting

### `ECONNREFUSED` when pushing/pulling

The server is not running or not reachable at the configured `GHCP_SYNC_URL`. Verify the server is started and the URL/port are correct.

### `401 Unauthorized`

The `GHCP_SYNC_KEY` on the client does not match the server. Ensure both sides use the same value.

### `No config stored yet. Push first.`

The server has no tarball. Run `ghcp-sync push` from a machine that has the config you want to sync.

### VS Code settings not merging

- Ensure VS Code is installed and `settings.json` exists at the expected path.
- The client will print a warning if it cannot find or parse the settings file.
- If the file has syntax errors beyond standard JSONC (comments + trailing commas), the parser may fail.

### `No Copilot config found to sync`

Neither `~/.copilot/` files nor VS Code copilot settings were found. Ensure at least one of these exists before pushing.

### Large tarball or unexpected files

Check that `node_modules`, `dist`, `.git`, `logs`, `sessions`, and `cache` directories aren't nested inside `~/.copilot/agents/` or `~/.copilot/hooks/`. These are excluded by the filter, but parent directories containing them will still be traversed.

## License

MIT -- see [LICENSE](LICENSE).
