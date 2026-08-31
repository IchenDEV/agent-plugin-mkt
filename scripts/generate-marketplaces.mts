import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "@/lib/db";
import {
  buildClaudeMarketplace,
  buildCodexMarketplace,
  type MarketplacePluginInput,
} from "@/lib/marketplaces";
import { parseProtocols } from "@/lib/queries";
import type { InstallRuntime } from "@/lib/marketplaces";

const CODEX_PATH = resolve(".agents/plugins/marketplace.json");
const CLAUDE_PATH = resolve(".claude-plugin/marketplace.json");

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function runtimeNames(
  value: string,
): Partial<Record<InstallRuntime, string>> {
  try {
    const manifests = JSON.parse(value);
    if (typeof manifests !== "object" || manifests === null || Array.isArray(manifests)) {
      return {};
    }
    const names: Partial<Record<InstallRuntime, string>> = {};
    for (const runtime of ["codex", "claude-code"] as const) {
      const entry = (manifests as Record<string, unknown>)[runtime];
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
      const raw = (entry as Record<string, unknown>).raw;
      if (typeof raw !== "string") continue;
      const manifest = JSON.parse(raw);
      if (typeof manifest?.name === "string") names[runtime] = manifest.name;
    }
    return names;
  } catch {
    return {};
  }
}

async function main(): Promise<void> {
  const rows = await prisma.plugin.findMany({
    orderBy: { slug: "asc" },
    select: {
      slug: true,
      name: true,
      repoUrl: true,
      pluginPath: true,
      protocols: true,
      manifests: true,
    },
  });
  const plugins: MarketplacePluginInput[] = rows.map(({ manifests, ...row }) => ({
    ...row,
    protocols: parseProtocols(row.protocols),
    runtimeNames: runtimeNames(manifests),
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
