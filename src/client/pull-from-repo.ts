import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Content types to copy from .github/ (no format conversion for GHCP)
const CONTENT_DIRS = ["agents", "skills", "prompts", "hooks"];

export async function pullFromRepo(
  repoUrl: string,
  target: string,
  only?: string[]
): Promise<void> {
  // Verify git is available
  try {
    execSync("git --version", { stdio: "pipe" });
  } catch {
    throw new Error("git is required for --from. Please install git.");
  }

  const targetDir = path.resolve(target);
  fs.mkdirSync(targetDir, { recursive: true });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ghcp-sync-"));

  try {
    // Clone the repo
    console.log(`Cloning ${repoUrl} (shallow)...`);
    try {
      execSync(`git clone --depth 1 "${repoUrl}" "${tempDir}/repo"`, {
        stdio: "pipe",
      });
    } catch (err) {
      const stderr = err instanceof Error && "stderr" in err
        ? (err as { stderr: Buffer }).stderr?.toString()
        : "";
      throw new Error(`Failed to clone repository: ${stderr || err}`);
    }

    // Find .github/ directory
    const githubDir = path.join(tempDir, "repo", ".github");
    if (!fs.existsSync(githubDir)) {
      throw new Error(
        "Repository does not contain a .github/ directory."
      );
    }
    console.log("Found .github/ directory");

    // Determine which dirs to process
    const activeDirs = only
      ? CONTENT_DIRS.filter((d) => only.includes(d))
      : CONTENT_DIRS;

    let totalCopied = 0;

    for (const dirName of activeDirs) {
      const sourceDir = path.join(githubDir, dirName);
      if (!fs.existsSync(sourceDir)) {
        console.log(`Skipping ${dirName} (not found in repository)`);
        continue;
      }

      const destDir = path.join(targetDir, dirName);
      fs.mkdirSync(destDir, { recursive: true });

      if (dirName === "skills") {
        // Skills are directories -- copy each skill subdirectory
        const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
        let count = 0;
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          if (entry.name.toLowerCase() === "resources") continue;
          fs.cpSync(
            path.join(sourceDir, entry.name),
            path.join(destDir, entry.name),
            { recursive: true }
          );
          count++;
        }
        console.log(`Copied ${count} skills → ${dirName}/`);
        totalCopied += count;
      } else {
        // Files -- copy directly (skip README.md)
        const files = fs.readdirSync(sourceDir);
        let count = 0;
        for (const file of files) {
          const srcPath = path.join(sourceDir, file);
          if (!fs.statSync(srcPath).isFile()) continue;
          if (file.toLowerCase() === "readme.md") continue;

          fs.copyFileSync(srcPath, path.join(destDir, file));
          count++;
        }
        console.log(`Copied ${count} files → ${dirName}/`);
        totalCopied += count;
      }
    }

    if (totalCopied === 0) {
      console.warn("Warning: No matching content found in repository.");
    } else {
      console.log(`Pull complete. Copied ${totalCopied} items to ${targetDir}`);
    }
  } finally {
    // Cleanup temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
