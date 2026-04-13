import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import * as tar from "tar";
import {
  COPILOT_DIR,
  VSCODE_SETTINGS_TAR_PREFIX,
  COPILOT_SETTINGS_FILENAME,
  buildFileList,
  tarFilter,
} from "../shared/config.js";
import { extractCopilotSettings } from "./vscode.js";

export async function push(serverUrl: string, apiKey: string): Promise<void> {
  // Ensure copilot dir exists for temp file operations
  fs.mkdirSync(COPILOT_DIR, { recursive: true, mode: 0o700 });

  const fileList = buildFileList();

  // Extract VS Code copilot settings
  const tempSettingsDir = path.join(COPILOT_DIR, VSCODE_SETTINGS_TAR_PREFIX);
  let hasVSCodeSettings = false;

  const copilotSettings = extractCopilotSettings();
  if (copilotSettings) {
    fs.mkdirSync(tempSettingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(tempSettingsDir, COPILOT_SETTINGS_FILENAME),
      JSON.stringify(copilotSettings, null, 2) + "\n",
      "utf-8"
    );
    fileList.push(VSCODE_SETTINGS_TAR_PREFIX);
    hasVSCodeSettings = true;
  }

  if (fileList.length === 0) {
    console.error(
      "No Copilot config found to sync.\n" +
      "Ensure ~/.copilot/ exists or VS Code has Copilot settings configured."
    );
    process.exit(1);
  }

  try {
    console.log(`Pushing ${fileList.length} entries from ${COPILOT_DIR}`);

    const tarStream = tar.create(
      {
        cwd: COPILOT_DIR,
        gzip: true,
        filter: (_path: string) => tarFilter(_path),
      },
      fileList
    );

    const url = new URL("/sync", serverUrl);
    const transport = url.protocol === "https:" ? https : http;

    const result = await new Promise<{ ok: boolean; bytes?: number; error?: string }>(
      (resolve, reject) => {
        const req = transport.request(
          {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: "PUT",
            timeout: 120_000,
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/gzip",
            },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk: Buffer) => {
              body += chunk.toString();
            });
            res.on("end", () => {
              try {
                const json = JSON.parse(body);
                if (res.statusCode === 200) {
                  resolve(json);
                } else {
                  reject(new Error(json.error || `Server returned ${res.statusCode}`));
                }
              } catch {
                reject(new Error(`Invalid response: ${body}`));
              }
            });
          }
        );

        req.on("timeout", () => {
          req.destroy(new Error("Request timed out after 120 seconds"));
        });
        req.on("error", reject);

        tarStream.on("error", (err: unknown) => {
          const error = err instanceof Error ? err : new Error(String(err));
          req.destroy(error);
          reject(error);
        });

        tarStream.pipe(req);
      }
    );

    const sizeKB = result.bytes ? (result.bytes / 1024).toFixed(1) : "unknown";
    console.log(`Push complete. Uploaded ${sizeKB} KB to server.`);
  } finally {
    // Clean up temp VS Code settings directory
    if (hasVSCodeSettings) {
      fs.rmSync(tempSettingsDir, { recursive: true, force: true });
    }
  }
}
