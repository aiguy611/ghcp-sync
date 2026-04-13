#!/usr/bin/env node

import { push } from "./push.js";
import { pull } from "./pull.js";

const command = process.argv[2];

if (!command || !["push", "pull"].includes(command)) {
  console.error("Usage: ghcp-sync <push|pull> [options]");
  console.error("");
  console.error("Commands:");
  console.error("  push                Upload local Copilot config to server");
  console.error("  pull [--target dir] [--only types] Download Copilot config from server");
  console.error("");
  console.error("Pull options:");
  console.error("  --target <dir>     Extract to directory (default: current directory)");
  console.error("  --only <types>     Only extract specified content types (comma-separated)");
  console.error("                     Valid types: agents, skills, prompts, hooks");
  console.error("                     Example: --only agents,skills,prompts");
  console.error("");
  console.error("Environment variables:");
  console.error("  GHCP_SYNC_URL    Server URL (e.g. http://my-server:3457)");
  console.error("  GHCP_SYNC_KEY    Shared API key for authentication");
  process.exit(1);
}

// Parse --target flag for pull
let target = ".";
const targetIdx = process.argv.indexOf("--target");
if (targetIdx !== -1 && process.argv[targetIdx + 1]) {
  target = process.argv[targetIdx + 1];
}

// Parse --only flag for pull
const VALID_ONLY_VALUES = ["agents", "skills", "prompts", "hooks"];
let only: string[] | undefined;
const onlyIdx = process.argv.indexOf("--only");
if (onlyIdx !== -1 && process.argv[onlyIdx + 1]) {
  const raw = process.argv[onlyIdx + 1].split(",").map((s) => s.trim()).filter(Boolean);
  const invalid = raw.filter((v) => !VALID_ONLY_VALUES.includes(v));
  if (invalid.length > 0) {
    console.error(`Error: Invalid --only value(s): ${invalid.join(", ")}`);
    console.error(`Valid values: ${VALID_ONLY_VALUES.join(", ")}`);
    process.exit(1);
  }
  only = raw;
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
      await pull(serverUrl!, apiKey!, target, only);
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
