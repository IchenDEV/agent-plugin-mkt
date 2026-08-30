import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  PLUGIN_PROTOCOLS,
  type PluginProtocol,
} from "@/lib/protocols";
import { cacheCatalogQuery } from "@/lib/server-cache";

// Shared read layer. The web UI, REST API, and MCP endpoint all go through
// these functions so every surface returns consistent results.

export type ComponentType = "skills" | "mcp";
export type Transport = "stdio" | "streamable-http" | "sse";
export type SortOrder = "stars" | "updated" | "recent";

export interface PluginFilters {
  /** Free-text query over name, description, keywords, author. */
  q?: string;
  /** Exact GitHub owner login (creator pages). */
  owner?: string;
  /** Exact keyword match (categories are keywords). */
  category?: string;
  type?: ComponentType;
  transport?: Transport;
  /** Match any selected runtime protocol. */
  protocols?: PluginProtocol[];
  sort?: SortOrder;
  page?: number;
  perPage?: number;
}

export interface PluginSummary {
  slug: string;
  name: string;
  version: string | null;
  description: string | null;
  authorName: string | null;
  license: string | null;
  keywords: string[];
  repoUrl: string;
  repoOwner: string;
  repoStars: number;
  repoForks: number;
  repoOpenIssues: number;
  repoPushedAt: Date | null;
  skillCount: number;
  mcpCount: number;
  transports: Transport[];
  protocols: PluginProtocol[];
  /** When the plugin first entered the index. */
  createdAt: Date;
  /** When the plugin was last (re-)indexed. */
  indexedAt: Date;
}

export interface PluginDetail extends PluginSummary {
  homepage: string | null;
  repository: string | null;
  pluginPath: string;
  repoPushedAt: Date | null;
  manifest: string;
  manifestPath: string;
  manifests: Partial<Record<PluginProtocol, { path: string; raw: string }>>;
  skills: { dirName: string; path: string; name: string; description: string | null }[];
  mcpServers: { serverId: string; transport: Transport; config: Record<string, unknown> }[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export const MAX_PER_PAGE = 50;
export const DEFAULT_PER_PAGE = 24;
export const MAX_QUERY_LENGTH = 200;

type PluginWithTransports = Prisma.PluginGetPayload<{
  include: { mcpServers: { select: { transport: true } } };
}>;

export function parseKeywords(json: string): string[] {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export function parseProtocols(json: string): PluginProtocol[] {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value)
      ? value.filter(
          (protocol): protocol is PluginProtocol =>
            typeof protocol === "string" &&
            (PLUGIN_PROTOCOLS as readonly string[]).includes(protocol),
        )
      : [];
  } catch {
    return [];
  }
}

function parseManifests(
  json: string,
): Partial<Record<PluginProtocol, { path: string; raw: string }>> {
  try {
    const value = JSON.parse(json);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    const manifests: Partial<Record<PluginProtocol, { path: string; raw: string }>> = {};
    for (const protocol of PLUGIN_PROTOCOLS) {
      const entry = (value as Record<string, unknown>)[protocol];
      if (
        typeof entry === "object" &&
        entry !== null &&
        !Array.isArray(entry) &&
        typeof (entry as Record<string, unknown>).path === "string" &&
        typeof (entry as Record<string, unknown>).raw === "string"
      ) {
        manifests[protocol] = {
          path: (entry as Record<string, string>).path,
          raw: (entry as Record<string, string>).raw,
        };
      }
    }
    return manifests;
  } catch {
    return {};
  }
}

function toSummary(plugin: PluginWithTransports): PluginSummary {
  return {
    slug: plugin.slug,
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,
    authorName: plugin.authorName,
    license: plugin.license,
    keywords: parseKeywords(plugin.keywords),
    repoUrl: plugin.repoUrl,
    repoOwner: plugin.repoOwner,
    repoStars: plugin.repoStars,
    repoForks: plugin.repoForks,
    repoOpenIssues: plugin.repoOpenIssues,
    repoPushedAt: plugin.repoPushedAt,
    skillCount: plugin.skillCount,
    mcpCount: plugin.mcpCount,
    transports: [...new Set(plugin.mcpServers.map((s) => s.transport as Transport))],
    protocols: parseProtocols(plugin.protocols),
    createdAt: plugin.createdAt,
    indexedAt: plugin.indexedAt,
  };
}

export function pluginWhereForFilters(filters: PluginFilters = {}): Prisma.PluginWhereInput {
  const where: Prisma.PluginWhereInput = {};
  const and: Prisma.PluginWhereInput[] = [];

  const q = filters.q?.trim().slice(0, MAX_QUERY_LENGTH);
  if (q) {
    and.push({
      OR: [
        { name: { contains: q } },
        { description: { contains: q } },
        { keywords: { contains: q } },
        { authorName: { contains: q } },
      ],
    });
  }
  const owner = filters.owner?.trim().toLowerCase();
  if (owner) and.push({ repoOwner: owner });
  const category = filters.category?.trim().toLowerCase();
  if (category) {
    // Keywords are stored normalized (trimmed, lowercased) as a JSON array
    // string; normalize the filter the same way and match the quoted element.
    and.push({ keywords: { contains: JSON.stringify(category) } });
  }
  if (filters.type === "skills") and.push({ skillCount: { gt: 0 } });
  if (filters.type === "mcp") and.push({ mcpCount: { gt: 0 } });
  if (filters.transport) and.push({ mcpServers: { some: { transport: filters.transport } } });
  if (filters.protocols?.length) {
    and.push({
      OR: filters.protocols.map((protocol) => ({
        protocols: { contains: JSON.stringify(protocol) },
      })),
    });
  }
  if (and.length) where.AND = and;
  return where;
}

function normalizedCacheFilters(filters: PluginFilters): PluginFilters {
  return {
    q: filters.q?.trim().slice(0, MAX_QUERY_LENGTH) || undefined,
    owner: filters.owner?.trim().toLowerCase() || undefined,
    category: filters.category?.trim().toLowerCase() || undefined,
    type: filters.type,
    transport: filters.transport,
    protocols: filters.protocols ? [...new Set(filters.protocols)].sort() : undefined,
    sort: filters.sort ?? "stars",
    page: Math.max(1, Math.floor(filters.page ?? 1)),
    perPage: Math.min(MAX_PER_PAGE, Math.max(1, Math.floor(filters.perPage ?? DEFAULT_PER_PAGE))),
  };
}

async function searchPluginsUncached(filters: PluginFilters = {}): Promise<Paged<PluginSummary>> {
  // Clamp to safe integers here so no surface (REST, MCP, web) can push a
  // skip value past the query engine's 64-bit integer range.
  const rawPage = Math.floor(filters.page ?? 1);
  const page = Number.isSafeInteger(rawPage) ? Math.max(1, rawPage) : 1;
  const rawPerPage = Math.floor(filters.perPage ?? DEFAULT_PER_PAGE);
  const perPage = Number.isSafeInteger(rawPerPage)
    ? Math.min(MAX_PER_PAGE, Math.max(1, rawPerPage))
    : DEFAULT_PER_PAGE;

  const where = pluginWhereForFilters(filters);

  const orderBy: Prisma.PluginOrderByWithRelationInput[] =
    filters.sort === "updated"
      ? [{ repoPushedAt: "desc" }, { repoStars: "desc" }]
      : filters.sort === "recent"
        ? [{ createdAt: "desc" }]
        : [{ repoStars: "desc" }, { name: "asc" }];

  const [total, rows] = await Promise.all([
    prisma.plugin.count({ where }),
    prisma.plugin.findMany({
      where,
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
      include: { mcpServers: { select: { transport: true } } },
    }),
  ]);

  return {
    items: rows.map(toSummary),
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export function searchPlugins(filters: PluginFilters = {}): Promise<Paged<PluginSummary>> {
  const normalized = normalizedCacheFilters(filters);
  // Free-text terms are unbounded user input. Keep them out of the cross-request
  // cache while caching the finite browse, landing-page, and pagination states.
  if (normalized.q) return searchPluginsUncached(normalized);
  return cacheCatalogQuery(`search:${JSON.stringify(normalized)}`, () =>
    searchPluginsUncached(normalized),
  );
}

async function getPluginBySlugUncached(slug: string): Promise<PluginDetail | null> {
  const plugin = await prisma.plugin.findUnique({
    where: { slug },
    include: { skills: { orderBy: { dirName: "asc" } }, mcpServers: { orderBy: { serverId: "asc" } } },
  });
  if (!plugin) return null;
  return {
    ...toSummary(plugin),
    homepage: plugin.homepage,
    repository: plugin.repository,
    pluginPath: plugin.pluginPath,
    repoPushedAt: plugin.repoPushedAt,
    manifest: plugin.manifest,
    manifestPath: plugin.manifestPath,
    manifests: parseManifests(plugin.manifests),
    skills: plugin.skills.map((s) => ({
      dirName: s.dirName,
      path: s.path || `skills/${s.dirName}/SKILL.md`,
      name: s.name,
      description: s.description,
    })),
    mcpServers: plugin.mcpServers.map((s) => {
      let config: Record<string, unknown> = {};
      try {
        config = JSON.parse(s.config);
      } catch {
        // leave empty on malformed stored config
      }
      return { serverId: s.serverId, transport: s.transport as Transport, config };
    }),
  };
}

export function getPluginBySlug(slug: string): Promise<PluginDetail | null> {
  return cacheCatalogQuery(`plugin:${slug}`, () => getPluginBySlugUncached(slug));
}

/** Full summary catalog for machine-readable exports such as llms-full.txt. */
async function getAllPluginSummariesUncached(): Promise<PluginSummary[]> {
  const rows = await prisma.plugin.findMany({
    orderBy: [{ repoStars: "desc" }, { name: "asc" }],
    include: { mcpServers: { select: { transport: true } } },
  });
  return rows.map(toSummary);
}

export function getAllPluginSummaries(): Promise<PluginSummary[]> {
  return cacheCatalogQuery("plugin-summaries:all", getAllPluginSummariesUncached);
}

export interface Stats {
  plugins: number;
  skills: number;
  mcpServers: number;
  categories: number;
}

async function getStatsUncached(): Promise<Stats> {
  const [plugins, skills, mcpServers, categories] = await Promise.all([
    prisma.plugin.count(),
    prisma.skill.count(),
    prisma.mcpServer.count(),
    // Count ALL distinct categories — never the display-capped default list.
    getCategories(Number.POSITIVE_INFINITY).then((c) => c.length),
  ]);
  return { plugins, skills, mcpServers, categories };
}

export function getStats(): Promise<Stats> {
  return cacheCatalogQuery("stats", getStatsUncached);
}

export interface Category {
  name: string;
  count: number;
}

/** Categories are derived from manifest keywords, ranked by frequency. */
async function getCategoriesUncached(limit = 100): Promise<Category[]> {
  const rows = await prisma.plugin.findMany({ select: { keywords: true } });
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const keyword of parseKeywords(row.keywords)) {
      const name = keyword.trim().toLowerCase();
      if (!name || name.length > 40) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function getCategories(limit = 100): Promise<Category[]> {
  const normalizedLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : "all";
  return cacheCatalogQuery(`categories:${normalizedLimit}`, () =>
    getCategoriesUncached(limit),
  );
}

export interface Creator {
  owner: string;
  pluginCount: number;
  totalStars: number;
  /** Most recent push across the creator's indexed repositories. */
  lastPushedAt: Date | null;
  /** Display name from the most recently indexed plugin, when declared. */
  displayName: string | null;
}

async function getCreatorsUncached(limit: number): Promise<Creator[]> {
  const rows = await prisma.plugin.groupBy({
    by: ["repoOwner"],
    where: { repoOwner: { not: "" } },
    _count: { _all: true },
    _sum: { repoStars: true },
    _max: { repoPushedAt: true },
    orderBy: { _sum: { repoStars: "desc" } },
  });
  const owners = rows
    .filter((row) => row.repoOwner)
    .slice(0, limit)
    .map((row) => ({
      owner: row.repoOwner,
      pluginCount: row._count._all,
      totalStars: row._sum.repoStars ?? 0,
      lastPushedAt: row._max.repoPushedAt,
      displayName: null as string | null,
    }));
  if (owners.length === 0) return owners;
  // One batched pass for display names: cheapest row per owner wins.
  const nameRows = await prisma.plugin.findMany({
    where: { repoOwner: { in: owners.map((o) => o.owner) }, authorName: { not: null } },
    select: { repoOwner: true, authorName: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  // Only trust an authorName as the creator's display name when it matches
  // the owner login; manifest authors frequently differ from the repo owner.
  const names = new Map<string, string>();
  for (const row of nameRows) {
    if (
      row.repoOwner &&
      row.authorName &&
      row.authorName.trim().toLowerCase() === row.repoOwner &&
      !names.has(row.repoOwner)
    ) {
      names.set(row.repoOwner, row.authorName);
    }
  }
  return owners.map((owner) => ({ ...owner, displayName: names.get(owner.owner) ?? null }));
}

/** Creators (GitHub owners) ranked by total stars across indexed plugins. */
export function getCreators(limit = 200): Promise<Creator[]> {
  const normalizedLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 200;
  return cacheCatalogQuery(`creators:${normalizedLimit}`, () => getCreatorsUncached(normalizedLimit));
}

export interface CreatorDetail {
  owner: string;
  pluginCount: number;
  totalStars: number;
  totalSkills: number;
  totalMcpServers: number;
  lastPushedAt: Date | null;
  displayName: string | null;
}

async function getCreatorUncached(owner: string): Promise<CreatorDetail | null> {
  const normalized = owner.trim().toLowerCase();
  if (!normalized || normalized.length > 100) return null;
  const rows = await prisma.plugin.findMany({
    where: { repoOwner: normalized },
    select: {
      repoStars: true,
      skillCount: true,
      mcpCount: true,
      repoPushedAt: true,
      authorName: true,
      createdAt: true,
    },
  });
  if (rows.length === 0) return null;
  const selfNamed = rows.find(
    (row) => row.authorName && row.authorName.trim().toLowerCase() === normalized,
  );
  const displayName = selfNamed?.authorName ?? null;
  return {
    owner: normalized,
    pluginCount: rows.length,
    totalStars: rows.reduce((sum, row) => sum + row.repoStars, 0),
    totalSkills: rows.reduce((sum, row) => sum + row.skillCount, 0),
    totalMcpServers: rows.reduce((sum, row) => sum + row.mcpCount, 0),
    lastPushedAt: rows.reduce<Date | null>(
      (latest, row) => (latest && row.repoPushedAt && latest > row.repoPushedAt ? latest : (row.repoPushedAt ?? latest)),
      null,
    ),
    displayName,
  };
}

export function getCreator(owner: string): Promise<CreatorDetail | null> {
  return cacheCatalogQuery(`creator:${owner.trim().toLowerCase()}`, () => getCreatorUncached(owner));
}
