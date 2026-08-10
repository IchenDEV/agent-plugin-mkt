import type { Metadata } from "next";
import Link from "next/link";
import { cache, type ReactNode } from "react";
import { JsonLd } from "@/components/json-ld";
import { PluginCard } from "@/components/plugin-card";
import { Container, EmptyState, SearchInput, transportLabel } from "@/components/ui";
import {
  getCategories,
  searchPlugins,
  type ComponentType,
  type SortOrder,
  type Transport,
} from "@/lib/queries";
import {
  PLUGIN_PROTOCOLS,
  PROTOCOL_LABELS,
  type PluginProtocol,
} from "@/lib/protocols";
import { SITE_NAME, absoluteUrl } from "@/lib/site";
import { getLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

const TYPES = ["skills", "mcp"] as const satisfies readonly ComponentType[];
const TRANSPORTS = ["stdio", "streamable-http", "sse"] as const satisfies readonly Transport[];
const SORTS = ["stars", "updated", "recent"] as const satisfies readonly SortOrder[];
const PROTOCOLS = PLUGIN_PROTOCOLS satisfies readonly PluginProtocol[];

const BROWSE_COPY = {
  en: {
    title: "Find plugins",
    searchPlaceholder: "Search by name, task, or tag",
    search: "Search",
    filters: "Filters",
    runtime: "Plugin format",
    allRuntimes: "All formats",
    componentType: "Includes",
    transport: "MCP transport",
    sort: "Sort",
    categories: "Tags",
    results: "Results",
    all: "All",
    hasSkills: "Skills",
    hasMcp: "MCP servers",
    mostStars: "GitHub stars",
    updated: "Last updated",
    indexed: "Recently added",
    clearAll: "Clear all",
    clearAllFilters: "Clear all filters",
    noMatch: "No plugins match",
    noMatchHint: "Clear a filter or try a broader search term.",
    nothing: "Nothing on this page",
    nothingHint: "This page is past the end of the results — head back to page 1 with the filters kept.",
    back: "Back to page 1",
    pagination: "Pagination",
    prev: "← Prev",
    next: "Next →",
  },
  "zh-CN": {
    title: "查找插件",
    searchPlaceholder: "按名称、用途或标签搜索",
    search: "搜索",
    filters: "筛选条件",
    runtime: "插件格式",
    allRuntimes: "全部格式",
    componentType: "包含内容",
    transport: "MCP 传输方式",
    sort: "排序",
    categories: "标签",
    results: "搜索结果",
    all: "全部",
    hasSkills: "技能",
    hasMcp: "MCP 服务器",
    mostStars: "GitHub Stars",
    updated: "最后更新",
    indexed: "最近新增",
    clearAll: "清除全部",
    clearAllFilters: "清除全部筛选",
    noMatch: "没有匹配的插件",
    noMatchHint: "请清除一个筛选条件，或尝试更宽泛的关键词。",
    nothing: "本页没有结果",
    nothingHint: "当前页超出了结果范围，请保留筛选条件并返回第 1 页。",
    back: "返回第 1 页",
    pagination: "分页",
    prev: "← 上一页",
    next: "下一页 →",
  },
} as const;

const PARAM_KEYS = ["q", "category", "type", "transport", "protocol", "sort", "page"] as const;
type ParamKey = (typeof PARAM_KEYS)[number];
type ParamValue = string | string[];
type ActiveParams = Partial<Record<ParamKey, ParamValue>>;

type BrowsePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const getBrowseResults = cache(
  (
    q: string | undefined,
    category: string | undefined,
    type: ComponentType | undefined,
    transport: Transport | undefined,
    protocols: PluginProtocol[],
    sort: SortOrder,
    page: number,
  ) => searchPlugins({ q, category, type, transport, protocols, sort, page }),
);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Invalid values are treated as unset, never an error. */
function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value !== undefined && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function manyOf<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
): T[] {
  const requested = new Set(
    (Array.isArray(value) ? value : value ? [value] : []).flatMap((item) => item.split(",")),
  );
  return allowed.filter((item) => requested.has(item));
}

function positiveInt(value: string | undefined): number | undefined {
  if (!value || !/^[0-9]+$/.test(value)) return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 ? n : undefined;
}

export async function generateMetadata({ searchParams }: BrowsePageProps): Promise<Metadata> {
  const [sp, locale] = await Promise.all([searchParams, getLocale()]);
  const zh = locale === "zh-CN";
  const q = first(sp.q)?.trim();
  const category = first(sp.category)?.trim().toLowerCase();
  const type = oneOf(first(sp.type), TYPES);
  const transport = oneOf(first(sp.transport), TRANSPORTS);
  const protocols = manyOf(sp.protocol, PROTOCOLS);
  const sort = oneOf(first(sp.sort), SORTS) ?? "stars";
  const page = positiveInt(first(sp.page)) ?? 1;
  const results = await getBrowseResults(q, category, type, transport, protocols, sort, page);
  const canonicalParams = new URLSearchParams();
  if (category) canonicalParams.set("category", category);
  if (page > 1) canonicalParams.set("page", String(page));
  const canonicalQuery = canonicalParams.toString();
  const canonical = canonicalQuery ? `/plugins?${canonicalQuery}` : "/plugins";
  const displayCategory = category?.slice(0, 40);
  const title = zh
    ? `${displayCategory ? `${displayCategory} 插件` : "查找插件"}${page > 1 ? ` — 第 ${page} 页` : ""}`
    : displayCategory
      ? `${displayCategory} plugins${page > 1 ? ` — Page ${page}` : ""}`
      : `Find plugins${page > 1 ? ` — Page ${page}` : ""}`;
  const description = zh
    ? displayCategory
      ? `查找带有 ${displayCategory} 标签的开源插件，并查看其技能与 MCP 服务器。`
      : "查找适用于 Codex、Claude Code 和 Agent Plugins 的开源插件，并查看其技能、MCP 服务器和源码。"
    : displayCategory
      ? `Find open-source plugins tagged ${displayCategory}, including their skills and MCP servers.`
      : "Find open-source plugins for Codex, Claude Code, and Agent Plugins, and review their skills, MCP servers, and source.";
  const shouldNotIndex = Boolean(
    q ||
      type ||
      transport ||
      protocols.length > 0 ||
      sort !== "stars" ||
      page > results.totalPages ||
      (category && results.total === 0),
  );

  return {
    title,
    description,
    alternates: { canonical },
    robots: shouldNotIndex ? { index: false, follow: true } : undefined,
    openGraph: { type: "website", title, description, url: canonical, siteName: SITE_NAME },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * Build a /plugins href by merging the active params with a patch.
 * A `null` patch value removes the param; `page` always resets unless patched.
 */
function hrefWith(active: ActiveParams, patch: Partial<Record<ParamKey, ParamValue | null>>): string {
  const search = new URLSearchParams();
  for (const key of PARAM_KEYS) {
    const value = key in patch ? patch[key] : active[key];
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, item);
    } else if (value) {
      search.set(key, value);
    }
  }
  const qs = search.toString();
  return qs ? `/plugins?${qs}` : "/plugins";
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-wider text-gray-500">{label}</p>
      <div className="mt-2 space-y-0.5">{children}</div>
    </div>
  );
}

function RailLink({
  href,
  active,
  label,
  mono = false,
  multi = false,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  mono?: boolean;
  multi?: boolean;
  count?: number;
}) {
  return (
    <Link
      href={href}
      role={multi ? "checkbox" : undefined}
      aria-checked={multi ? active : undefined}
      aria-current={!multi && active ? "true" : undefined}
      className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm ${
        mono ? "font-mono text-[13px]" : ""
      } ${active ? "bg-iris-soft font-medium text-iris-deep" : "text-gray-600 hover:bg-surface hover:text-ink"}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {multi ? (
          <span
            aria-hidden
            className={`grid size-4 shrink-0 place-items-center rounded border text-[10px] ${
              active ? "border-iris bg-iris text-white" : "border-gray-300 bg-surface"
            }`}
          >
            {active ? "✓" : ""}
          </span>
        ) : null}
        <span className="truncate">{label}</span>
      </span>
      {count !== undefined ? (
        <span className={`text-xs ${active ? "text-iris-deep/70" : "text-gray-400"}`}>{count}</span>
      ) : null}
    </Link>
  );
}

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const [sp, locale] = await Promise.all([searchParams, getLocale()]);
  const c = BROWSE_COPY[locale];
  const zh = locale === "zh-CN";
  const q = first(sp.q)?.trim() || undefined;
  const category = first(sp.category)?.trim() || undefined;
  const type = oneOf(first(sp.type), TYPES);
  const transport = oneOf(first(sp.transport), TRANSPORTS);
  const protocols = manyOf(sp.protocol, PROTOCOLS);
  const sort = oneOf(first(sp.sort), SORTS) ?? "stars";
  const page = positiveInt(first(sp.page)) ?? 1;

  const [results, categories] = await Promise.all([
    getBrowseResults(q, category, type, transport, protocols, sort, page),
    getCategories(30),
  ]);

  // Canonical params for link building: default sort and page 1 stay out of URLs.
  const active: ActiveParams = {
    q,
    category,
    type,
    transport,
    protocol: protocols,
    sort: sort === "stars" ? undefined : sort,
  };
  const hasFilters = Boolean(q || category || type || transport || protocols.length > 0);

  const total = results.total;
  const countSentence = zh
    ? hasFilters
      ? `有 ${total} 个插件符合当前筛选条件。`
      : `目录中有 ${total} 个插件。`
    : hasFilters
      ? `${total} plugin${total === 1 ? "" : "s"} match${total === 1 ? "es" : ""} the active filters.`
      : `${total} plugin${total === 1 ? "" : "s"} available.`;

  const hidden: Record<string, string | string[]> = {};
  for (const key of ["category", "type", "transport", "protocol", "sort"] as const) {
    const value = active[key];
    if (value) hidden[key] = value;
  }

  const chips: { key: string; label: string; mono?: boolean; href: string }[] = [];
  if (q) chips.push({ key: "q", label: `${zh ? "搜索" : "search"}: ${q}`, href: hrefWith(active, { q: null }) });
  if (category)
    chips.push({
      key: "category",
      label: `${zh ? "标签" : "tag"}: ${category}`,
      href: hrefWith(active, { category: null }),
    });
  if (type)
    chips.push({
      key: "type",
      label: type === "skills" ? c.hasSkills : c.hasMcp,
      href: hrefWith(active, { type: null }),
    });
  if (transport)
    chips.push({
      key: "transport",
      label: transportLabel(transport),
      mono: true,
      href: hrefWith(active, { transport: null }),
    });
  for (const protocol of protocols) {
    chips.push({
      key: `protocol-${protocol}`,
      label: `${zh ? "格式" : "format"}: ${PROTOCOL_LABELS[protocol]}`,
      href: hrefWith(active, {
        protocol: protocols.filter((value) => value !== protocol),
      }),
    });
  }

  const typeOptions = [
    { label: c.all, href: hrefWith(active, { type: null }), active: !type },
    { label: c.hasSkills, href: hrefWith(active, { type: "skills" }), active: type === "skills" },
    { label: c.hasMcp, href: hrefWith(active, { type: "mcp" }), active: type === "mcp" },
  ];

  const transportOptions = TRANSPORTS.map((t) => ({
    label: transportLabel(t),
    href: hrefWith(active, { transport: transport === t ? null : t }),
    active: transport === t,
  }));

  const protocolOptions = PROTOCOLS.map((value) => ({
    label: PROTOCOL_LABELS[value],
    href: hrefWith(active, {
      protocol: protocols.includes(value)
        ? protocols.filter((protocol) => protocol !== value)
        : [...protocols, value],
    }),
    active: protocols.includes(value),
  }));

  const sortOptions = [
    { label: c.mostStars, href: hrefWith(active, { sort: null }), active: sort === "stars" },
    {
      label: c.updated,
      href: hrefWith(active, { sort: "updated" }),
      active: sort === "updated",
    },
    { label: c.indexed, href: hrefWith(active, { sort: "recent" }), active: sort === "recent" },
  ];
  const currentPath = hrefWith(active, { page: page > 1 ? String(page) : null });
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${absoluteUrl(currentPath)}#collection`,
    url: absoluteUrl(currentPath),
    name: category ? `${category} ${zh ? "插件" : "plugins"}` : c.title,
    description: countSentence,
    inLanguage: locale,
    isPartOf: { "@id": `${absoluteUrl("/")}#website` },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: results.items.length,
      itemListElement: results.items.map((plugin, index) => ({
        "@type": "ListItem",
        position: (results.page - 1) * results.perPage + index + 1,
        name: plugin.name,
        url: absoluteUrl(`/plugins/${encodeURIComponent(plugin.slug)}`),
      })),
    },
  };

  return (
    <Container className="py-10">
      <JsonLd data={collectionJsonLd} />
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {c.title}
        </h1>
        <p className="mt-2 text-sm text-gray-500">{countSentence}</p>
        <div className="mt-5">
          <SearchInput defaultValue={q ?? ""} hidden={hidden} placeholder={c.searchPlaceholder} submitLabel={c.search} />
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside aria-label={c.filters} className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <FilterGroup label={c.runtime}>
            <RailLink
              label={c.allRuntimes}
              href={hrefWith(active, { protocol: null })}
              active={protocols.length === 0}
            />
            {protocolOptions.map((option) => (
              <RailLink key={option.label} {...option} multi />
            ))}
          </FilterGroup>
          <FilterGroup label={c.componentType}>
            {typeOptions.map((option) => (
              <RailLink key={option.label} {...option} />
            ))}
          </FilterGroup>
          <FilterGroup label={c.transport}>
            {transportOptions.map((option) => (
              <RailLink key={option.label} {...option} mono />
            ))}
          </FilterGroup>
          <FilterGroup label={c.sort}>
            {sortOptions.map((option) => (
              <RailLink key={option.label} {...option} />
            ))}
          </FilterGroup>
          {categories.length > 0 ? (
            <FilterGroup label={c.categories}>
              {categories.map((c) => (
                <RailLink
                  key={c.name}
                  label={c.name}
                  count={c.count}
                  active={category === c.name}
                  href={hrefWith(active, { category: category === c.name ? null : c.name })}
                />
              ))}
            </FilterGroup>
          ) : null}
        </aside>

        <section aria-label={c.results}>
          {chips.length > 0 ? (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {chips.map((chip) => (
                <Link
                  key={chip.key}
                  href={chip.href}
                  aria-label={`${zh ? "移除筛选" : "Remove filter"}: ${chip.label}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-surface px-3 py-1 text-xs font-medium text-gray-600 hover:border-iris hover:text-iris"
                >
                  <span className={chip.mono ? "font-mono" : ""}>{chip.label}</span>
                  <span aria-hidden>×</span>
                </Link>
              ))}
              <Link
                href="/plugins"
                className="text-xs font-medium text-gray-500 underline-offset-2 hover:text-iris hover:underline"
              >
                {c.clearAll}
              </Link>
            </div>
          ) : null}

          {results.total === 0 ? (
            <EmptyState
              title={c.noMatch}
              hint={c.noMatchHint}
              action={
                <Link
                  href="/plugins"
                  className="inline-flex rounded-md bg-action px-4 py-2 text-sm font-semibold text-on-action hover:bg-iris"
                >
                  {c.clearAllFilters}
                </Link>
              }
            />
          ) : results.items.length === 0 ? (
            <EmptyState
              title={c.nothing}
              hint={c.nothingHint}
              action={
                <Link
                  href={hrefWith(active, { page: null })}
                  className="inline-flex rounded-md bg-action px-4 py-2 text-sm font-semibold text-on-action hover:bg-iris"
                >
                  {c.back}
                </Link>
              }
            />
          ) : (
            <>
              <ul className="grid gap-x-4 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
                {results.items.map((plugin) => (
                  <li key={plugin.slug}>
                    <PluginCard plugin={plugin} locale={locale} />
                  </li>
                ))}
              </ul>
              {results.totalPages > 1 ? (
                <nav
                  aria-label={c.pagination}
                  className="mt-10 flex items-center justify-center gap-4 text-sm font-medium"
                >
                  {results.page > 1 ? (
                    <Link
                      href={hrefWith(active, {
                        page: results.page === 2 ? null : String(results.page - 1),
                      })}
                      className="rounded-md border border-gray-200 bg-surface px-3 py-1.5 text-gray-600 hover:border-iris hover:text-iris"
                    >
                      {c.prev}
                    </Link>
                  ) : (
                    <span aria-hidden className="rounded-md border border-gray-100 px-3 py-1.5 text-gray-300">
                      {c.prev}
                    </span>
                  )}
                  <span className="text-gray-500">
                    {zh ? `第 ${results.page} / ${results.totalPages} 页` : `Page ${results.page} of ${results.totalPages}`}
                  </span>
                  {results.page < results.totalPages ? (
                    <Link
                      href={hrefWith(active, { page: String(results.page + 1) })}
                      className="rounded-md border border-gray-200 bg-surface px-3 py-1.5 text-gray-600 hover:border-iris hover:text-iris"
                    >
                      {c.next}
                    </Link>
                  ) : (
                    <span aria-hidden className="rounded-md border border-gray-100 px-3 py-1.5 text-gray-300">
                      {c.next}
                    </span>
                  )}
                </nav>
              ) : null}
            </>
          )}
        </section>
      </div>
    </Container>
  );
}
