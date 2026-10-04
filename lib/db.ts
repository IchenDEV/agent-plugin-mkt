import { PrismaClient } from "@prisma/client";
import { databaseUrl } from "@/lib/database-location";

// A production custom DATABASE_URL cannot silently disagree with the public
// snapshot identity. Indexing/local development still support custom SQLite DBs.
process.env.DATABASE_URL = databaseUrl();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
