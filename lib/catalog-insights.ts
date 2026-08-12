import "server-only";

import { prisma } from "@/lib/db";
import {
  parseKeywords,
  parseProtocols,
  pluginWhereForFilters,
  type Category,
  type PluginFilters,
} from "@/lib/queries";
import { PLUGIN_PROTOCOLS, type PluginProtocol } from "@/lib/protocols";
import { cacheCatalogQuery } from "@/lib/server-cache";

export interface CatalogMetricRow {
  repoUrl: string;
  repoPushedAt: Date | null;
  indexedAt: Date;
  license: string | null;
  keywords: string;
  protocols: string;
  skillCount: number;
  mcpCount: number;
}

export interface CatalogMetrics {
  plugins: number;
  repositories: number;
  skills: number;
  mcpServers: number;
  crossRuntimePlugins: number;
  licensedPlugins: number;
  recentlyUpdatedPlugins: number;
  latestIndexedAt: Date | null;
  protocolCounts: Record<PluginProtocol, number>;
  topCategories: Category[];
}

export function deriveCatalogMetrics(rows: CatalogMetricRow[]): CatalogMetrics {
  const repositories = new Set<string>();
  const categories = new Map<string, number>();
  const protocolCounts = Object.fromEntries(
    PLUGIN_PROTOCOLS.map((protocol) => [protocol, 0]),
  ) as Record<PluginProtocol, number>;
  let skills = 0;
  let mcpServers = 0;
  let crossRuntimePlugins = 0;
  let licensedPlugins = 0;
  let latestIndexedAt: Date | null = null;

  for (const row of rows) {
    repositories.add(row.repoUrl);
    skills += row.skillCount;
    mcpServers += row.mcpCount;
    if (row.license?.trim()) licensedPlugins += 1;
    if (!latestIndexedAt || row.indexedAt > latestIndexedAt) latestIndexedAt = row.indexedAt;

    const protocols = parseProtocols(row.protocols);
    if (protocols.length > 1) crossRuntimePlugins += 1;
    for (const protocol of protocols) protocolCounts[protocol] += 1;
    for (const keyword of parseKeywords(row.keywords)) {
      const category = keyword.trim().toLowerCase();
      if (!category || category.length > 40) continue;
      categories.set(category, (categories.get(category) ?? 0) + 1);
    }
  }

  const freshnessCutoff = latestIndexedAt
    ? new Date(latestIndexedAt.getTime() - 90 * 24 * 60 * 60 * 1000)
    : null;
  const recentlyUpdatedPlugins = freshnessCutoff
    ? rows.filter((row) => row.repoPushedAt && row.repoPushedAt >= freshnessCutoff).length
    : 0;

  return {
    plugins: rows.length,
    repositories: repositories.size,
    skills,
    mcpServers,
    crossRuntimePlugins,
    licensedPlugins,
    recentlyUpdatedPlugins,
    latestIndexedAt,
    protocolCounts,
    topCategories: [...categories.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 12),
  };
}

function metricsCacheKey(filters: PluginFilters): string {
  return JSON.stringify({
    category: filters.category?.trim().toLowerCase() || undefined,
    type: filters.type,
    protocols: filters.protocols ? [...new Set(filters.protocols)].sort() : undefined,
  });
}

export function getCatalogMetrics(filters: PluginFilters = {}): Promise<CatalogMetrics> {
  const key = metricsCacheKey(filters);
  return cacheCatalogQuery(`catalog-metrics:${key}`, async () => {
    const rows = await prisma.plugin.findMany({
      where: pluginWhereForFilters(filters),
      select: {
        repoUrl: true,
        repoPushedAt: true,
        indexedAt: true,
        license: true,
        keywords: true,
        protocols: true,
        skillCount: true,
        mcpCount: true,
      },
    });
    return deriveCatalogMetrics(rows);
  });
}
