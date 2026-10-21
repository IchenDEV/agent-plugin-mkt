import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import path from "node:path";
import snapshot from "@/prisma/snapshot.json";

/** Production identity describes the bundled pin, so custom DB URLs are dev-only. */
export function databaseUrl({
  env = process.env,
  cwd = process.cwd(),
  temporaryDirectory = tmpdir(),
  manifest = snapshot,
}: {
  env?: Partial<NodeJS.ProcessEnv>;
  cwd?: string;
  temporaryDirectory?: string;
  manifest?: { snapshotId: string; database: { sha256: string; bytes: number } };
} = {}): string {
  if (!env.VERCEL && env.NODE_ENV !== "production" && env.DATABASE_URL) return env.DATABASE_URL;
  const snapshotPath = path.join(cwd, "prisma", "marketplace.db");
  if (env.VERCEL) {
    // Vercel Functions have an ephemeral writable /tmp directory. Preserve the
    // runtime path, but replace a copy carrying a different snapshot identity.
    const runtimePath = path.join(temporaryDirectory, "agent-plugin-marketplace.db");
    const marker = `${runtimePath}.snapshot`;
    const identity = `${manifest.snapshotId}:${manifest.database.sha256}`;
    if (!existsSync(runtimePath) || !existsSync(marker) || readFileSync(marker, "utf8") !== identity) {
      // Bundle only gzip bytes; never fetch a mutable database at runtime.
      const bytes = gunzipSync(readFileSync(`${snapshotPath}.gz`), { maxOutputLength: manifest.database.bytes });
      if (bytes.length !== manifest.database.bytes || createHash("sha256").update(bytes).digest("hex") !== manifest.database.sha256) {
        throw new Error("Bundled snapshot checksum/size mismatch");
      }
      const temporary = `${runtimePath}.${process.pid}.tmp`;
      try {
        writeFileSync(temporary, bytes, { flag: "wx" });
        renameSync(temporary, runtimePath);
        writeFileSync(marker, identity);
      } finally { rmSync(temporary, { force: true }); }
    }
    return `file:${runtimePath}`;
  }
  return `file:${snapshotPath}`;
}
