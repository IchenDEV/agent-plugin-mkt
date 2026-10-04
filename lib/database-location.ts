import { copyFileSync, existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import snapshot from "@/prisma/snapshot.json";

/** Production identity describes the bundled pin, so custom DB URLs are dev-only. */
export function databaseUrl({
  env = process.env,
  cwd = process.cwd(),
  temporaryDirectory = tmpdir(),
}: {
  env?: Partial<NodeJS.ProcessEnv>;
  cwd?: string;
  temporaryDirectory?: string;
} = {}): string {
  if (!env.VERCEL && env.NODE_ENV !== "production" && env.DATABASE_URL) return env.DATABASE_URL;
  const snapshotPath = path.join(cwd, "prisma", "marketplace.db");
  if (env.VERCEL) {
    // Vercel Functions have an ephemeral writable /tmp directory. Preserve the
    // runtime path, but replace a copy carrying a different snapshot identity.
    const runtimePath = path.join(temporaryDirectory, "agent-plugin-marketplace.db");
    const marker = `${runtimePath}.snapshot`;
    const identity = `${snapshot.snapshotId}:${snapshot.database.sha256}`;
    if (!existsSync(runtimePath) || !existsSync(marker) || readFileSync(marker, "utf8") !== identity) {
      const temporary = `${runtimePath}.${process.pid}.tmp`;
      copyFileSync(snapshotPath, temporary);
      renameSync(temporary, runtimePath);
      writeFileSync(marker, identity);
    }
    return `file:${runtimePath}`;
  }
  return `file:${snapshotPath}`;
}
