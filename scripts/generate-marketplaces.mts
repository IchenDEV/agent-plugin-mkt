import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "@/lib/db";
import {
  buildClaudeMarketplace,
  buildCodexMarketplace,
  type MarketplacePluginInput,
} from "@/lib/marketplaces";
import { parseProtocols } from "@/lib/queries";

const CODEX_PATH = resolve(".agents/plugins/marketplace.json");
const CLAUDE_PATH = resolve(".claude-plugin/marketplace.json");

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function main(): Promise<void> {
  const rows = await prisma.plugin.findMany({
    orderBy: { slug: "asc" },
    select: {
      slug: true,
      repoUrl: true,
      pluginPath: true,
      protocols: true,
    },
  });
  const plugins: MarketplacePluginInput[] = rows.map((row) => ({
    ...row,
    protocols: parseProtocols(row.protocols),
  }));
  const outputs = [
    { path: CODEX_PATH, text: serialize(buildCodexMarketplace(plugins)) },
    { path: CLAUDE_PATH, text: serialize(buildClaudeMarketplace(plugins)) },
  ];

  if (process.argv.includes("--check")) {
    for (const output of outputs) {
      const current = await readFile(output.path, "utf8");
      if (current !== output.text) {
        throw new Error(`${output.path} is stale; run npm run marketplace:generate`);
      }
    }
    console.log("marketplace catalogs are current");
    return;
  }

  await Promise.all(outputs.map((output) => writeFile(output.path, output.text)));
  console.log(
    `wrote ${buildCodexMarketplace(plugins).plugins.length} Codex entries and ` +
      `${buildClaudeMarketplace(plugins).plugins.length} Claude Code entries`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
