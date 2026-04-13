import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import * as tar from "tar";
export async function pull(serverUrl: string, apiKey: string, target: string): Promise<void> {
  const targetDir = path.resolve(target);
  fs.mkdirSync(targetDir, { recursive: true });

  const tempTarball = path.join(targetDir, ".sync-download.tar.gz");

  // Step 1: Download tarball to temp file
  console.log("Downloading config from server...");
  await downloadTarball(serverUrl, apiKey, tempTarball);

  // Step 2: Verify tarball integrity
  console.log("Verifying tarball...");
  let entryCount = 0;
  try {
    await tar.list({
      file: tempTarball,
      onReadEntry: () => {
        entryCount++;
      },
    });
  } catch (err) {
    fs.rmSync(tempTarball, { force: true });
    throw new Error(`Downloaded tarball is corrupted: ${err}`);
  }
  console.log(`Tarball verified: ${entryCount} entries.`);

  // Step 3: Extract tarball
  console.log(`Extracting config to ${targetDir}...`);
  await tar.extract({
    file: tempTarball,
    cwd: targetDir,
    preserveOwner: false,
  });

  // Step 4: Cleanup temp tarball
  fs.rmSync(tempTarball, { force: true });

  console.log(`Pull complete. Extracted ${entryCount} entries to ${targetDir}`);
}

function downloadTarball(serverUrl: string, apiKey: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL("/sync", serverUrl);
    const transport = url.protocol === "https:" ? https : http;

    const req = transport.get(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        timeout: 120_000,
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
      (res) => {
        if (res.statusCode === 404) {
          reject(new Error("No config on server yet. Run `ghcp-sync push` first."));
          res.resume();
          return;
        }
        if (res.statusCode !== 200) {
          let body = "";
          res.on("data", (chunk: Buffer) => {
            body += chunk.toString();
          });
          res.on("end", () => {
            reject(new Error(`Server returned ${res.statusCode}: ${body}`));
          });
          return;
        }

        const writeStream = fs.createWriteStream(destPath);
        res.pipe(writeStream);

        writeStream.on("finish", resolve);
        writeStream.on("error", (err) => {
          fs.rmSync(destPath, { force: true });
          reject(err);
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("Download timed out after 120 seconds"));
    });
    req.on("error", reject);
  });
}
