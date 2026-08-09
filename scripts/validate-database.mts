import { prisma } from "@/lib/db";

async function main(): Promise<void> {
  const integrity = await prisma.$queryRaw<Array<{ integrity_check: string }>>`
    PRAGMA integrity_check
  `;
  if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") {
    throw new Error(`SQLite integrity check failed: ${JSON.stringify(integrity)}`);
  }

  const [plugins, skills, mcpServers] = await Promise.all([
    prisma.plugin.count(),
    prisma.skill.count(),
    prisma.mcpServer.count(),
  ]);
  console.log(`database ok: plugins=${plugins}, skills=${skills}, mcp_servers=${mcpServers}`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
