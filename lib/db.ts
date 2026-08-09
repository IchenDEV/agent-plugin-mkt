import { PrismaClient } from "@prisma/client";
import { copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function defaultDatabaseUrl(): string {
  const snapshotPath = path.join(process.cwd(), "prisma", "marketplace.db");

  if (process.env.VERCEL) {
    // Vercel Functions have an ephemeral writable /tmp directory. The bundled
    // database is an immutable preview snapshot, so copy it before Prisma opens
    // it instead of trying to use the read-only function bundle in place.
    const runtimePath = path.join(tmpdir(), "agent-plugin-marketplace.db");
    if (!existsSync(runtimePath)) copyFileSync(snapshotPath, runtimePath);
    return `file:${runtimePath}`;
  }

  return `file:${snapshotPath}`;
}

process.env.DATABASE_URL ??= defaultDatabaseUrl();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
