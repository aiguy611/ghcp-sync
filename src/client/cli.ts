#!/usr/bin/env node

import { push } from "./push.js";
import { pull } from "./pull.js";

const command = process.argv[2];

if (!command || !["push", "pull"].includes(command)) {
  console.error("Usage: ghcp-sync <push|pull>");
  console.error("");
  console.error("Commands:");
  console.error("  push    Upload local Copilot config to server");
  console.error("  pull    Download Copilot config from server");
  console.error("");
  console.error("Environment variables:");
  console.error("  GHCP_SYNC_URL    Server URL (e.g. http://my-server:3457)");
  console.error("  GHCP_SYNC_KEY    Shared API key for authentication");
  process.exit(1);
}

const serverUrl = process.env.GHCP_SYNC_URL;
const apiKey = process.env.GHCP_SYNC_KEY;

if (!serverUrl) {
  console.error("Error: GHCP_SYNC_URL environment variable is required.");
  console.error("Example: GHCP_SYNC_URL=http://localhost:3457");
  process.exit(1);
}

if (!apiKey) {
  console.error("Error: GHCP_SYNC_KEY environment variable is required.");
  process.exit(1);
}

async function main() {
  try {
    if (command === "push") {
      await push(serverUrl!, apiKey!);
    } else {
      await pull(serverUrl!, apiKey!);
    }
  } catch (err) {
    if (err instanceof Error) {
      const code = (err as NodeJS.ErrnoException).code;
      const msg = err.message || code || String(err);
      if (code === "ECONNREFUSED") {
        console.error(`Error: Could not connect to server at ${serverUrl} (${code})`);
      } else {
        console.error(`Error: ${msg}`);
      }
    } else {
      console.error(`Error: ${err}`);
    }
    process.exit(1);
  }
}

main();
