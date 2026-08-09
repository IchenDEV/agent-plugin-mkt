import type { Metadata } from "next";
import Link from "next/link";
import { cache, type ReactNode } from "react";
import { JsonLd } from "@/components/json-ld";
import { PluginCard } from "@/components/plugin-card";
import { Container, EmptyState, SearchInput } from "@/components/ui";
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

export const dynamic = "force-dynamic";

const TYPES = ["skills", "mcp"] as const satisfies readonly ComponentType[];
const TRANSPORTS = ["stdio", "streamable-http", "sse"] as const satisfies readonly Transport[];
const SORTS = ["stars", "updated", "recent"] as const satisfies readonly SortOrder[];
const PROTOCOLS = PLUGIN_PROTOCOLS satisfies readonly PluginProtocol[];

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
  const sp = await searchParams;
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
  const title = displayCategory
    ? `${displayCategory} Agent Plugins${page > 1 ? ` — Page ${page}` : ""}`
    : `Browse Agent Plugins${page > 1 ? ` — Page ${page}` : ""}`;
  const description = displayCategory
    ? `Browse open-source ${displayCategory} Agent Plugins, skills, and MCP servers indexed from GitHub.`
    : "Browse and compare open-source Agent Plugins, agent skills, and MCP servers indexed from public GitHub repositories.";
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
      } ${active ? "bg-iris-soft font-medium text-iris-deep" : "text-gray-600 hover:bg-white hover:text-ink"}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {multi ? (
          <span
            aria-hidden
            className={`grid size-4 shrink-0 place-items-center rounded border text-[10px] ${
              active ? "border-iris bg-iris text-white" : "border-gray-300 bg-white"
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
  const sp = await searchParams;
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
  const countSentence = hasFilters
    ? `${total} plugin${total === 1 ? "" : "s"} match${total === 1 ? "es" : ""} the active filters.`
    : `${total} plugin${total === 1 ? "" : "s"} indexed from public GitHub repos.`;

  const hidden: Record<string, string | string[]> = {};
  for (const key of ["category", "type", "transport", "protocol", "sort"] as const) {
    const value = active[key];
    if (value) hidden[key] = value;
  }

  const chips: { key: string; label: string; mono?: boolean; href: string }[] = [];
  if (q) chips.push({ key: "q", label: `search: ${q}`, href: hrefWith(active, { q: null }) });
  if (category)
    chips.push({
      key: "category",
      label: `category: ${category}`,
      href: hrefWith(active, { category: null }),
    });
  if (type)
    chips.push({
      key: "type",
      label: type === "skills" ? "has skills" : "has MCP servers",
      href: hrefWith(active, { type: null }),
    });
  if (transport)
    chips.push({
      key: "transport",
      label: transport,
      mono: true,
      href: hrefWith(active, { transport: null }),
    });
  for (const protocol of protocols) {
    chips.push({
      key: `protocol-${protocol}`,
      label: `runtime: ${PROTOCOL_LABELS[protocol]}`,
      href: hrefWith(active, {
        protocol: protocols.filter((value) => value !== protocol),
      }),
    });
  }

  const typeOptions = [
    { label: "All", href: hrefWith(active, { type: null }), active: !type },
    { label: "Has skills", href: hrefWith(active, { type: "skills" }), active: type === "skills" },
    { label: "Has MCP servers", href: hrefWith(active, { type: "mcp" }), active: type === "mcp" },
  ];

  const transportOptions = TRANSPORTS.map((t) => ({
    label: t,
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
    { label: "Most stars", href: hrefWith(active, { sort: null }), active: sort === "stars" },
    {
      label: "Recently updated",
      href: hrefWith(active, { sort: "updated" }),
      active: sort === "updated",
    },
    { label: "Newly indexed", href: hrefWith(active, { sort: "recent" }), active: sort === "recent" },
  ];
  const currentPath = hrefWith(active, { page: page > 1 ? String(page) : null });
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${absoluteUrl(currentPath)}#collection`,
    url: absoluteUrl(currentPath),
    name: category ? `${category} Agent Plugins` : "Browse Agent Plugins",
    description: countSentence,
    inLanguage: "en",
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
          Browse plugins
        </h1>
        <p className="mt-2 text-sm text-gray-500">{countSentence}</p>
        <div className="mt-5">
          <SearchInput defaultValue={q ?? ""} hidden={hidden} />
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside aria-label="Filters" className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <FilterGroup label="Runtime">
            <RailLink
              label="All runtimes"
              href={hrefWith(active, { protocol: null })}
              active={protocols.length === 0}
            />
            {protocolOptions.map((option) => (
              <RailLink key={option.label} {...option} multi />
            ))}
          </FilterGroup>
          <FilterGroup label="Component type">
            {typeOptions.map((option) => (
              <RailLink key={option.label} {...option} />
            ))}
          </FilterGroup>
          <FilterGroup label="Transport">
            {transportOptions.map((option) => (
              <RailLink key={option.label} {...option} mono />
            ))}
          </FilterGroup>
          <FilterGroup label="Sort">
            {sortOptions.map((option) => (
              <RailLink key={option.label} {...option} />
            ))}
          </FilterGroup>
          {categories.length > 0 ? (
            <FilterGroup label="Categories">
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

        <section aria-label="Results">
          {chips.length > 0 ? (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {chips.map((chip) => (
                <Link
                  key={chip.key}
                  href={chip.href}
                  aria-label={`Remove filter: ${chip.label}`}
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
                Clear all
              </Link>
            </div>
          ) : null}

          {results.total === 0 ? (
            <EmptyState
              title="No plugins match"
              hint="Clear the filters or try a broader term — the index only includes public repos with a valid supported manifest."
              action={
                <Link
                  href="/plugins"
                  className="inline-flex rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-iris"
                >
                  Clear all filters
                </Link>
              }
            />
          ) : results.items.length === 0 ? (
            <EmptyState
              title="Nothing on this page"
              hint="This page is past the end of the results — head back to page 1 with the filters kept."
              action={
                <Link
                  href={hrefWith(active, { page: null })}
                  className="inline-flex rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-iris"
                >
                  Back to page 1
                </Link>
              }
            />
          ) : (
            <>
              <ul className="grid gap-x-4 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
                {results.items.map((plugin) => (
                  <li key={plugin.slug}>
                    <PluginCard plugin={plugin} />
                  </li>
                ))}
              </ul>
              {results.totalPages > 1 ? (
                <nav
                  aria-label="Pagination"
                  className="mt-10 flex items-center justify-center gap-4 text-sm font-medium"
                >
                  {results.page > 1 ? (
                    <Link
                      href={hrefWith(active, {
                        page: results.page === 2 ? null : String(results.page - 1),
                      })}
                      className="rounded-md border border-gray-200 bg-surface px-3 py-1.5 text-gray-600 hover:border-iris hover:text-iris"
                    >
                      ← Prev
                    </Link>
                  ) : (
                    <span aria-hidden className="rounded-md border border-gray-100 px-3 py-1.5 text-gray-300">
                      ← Prev
                    </span>
                  )}
                  <span className="text-gray-500">
                    Page {results.page} of {results.totalPages}
                  </span>
                  {results.page < results.totalPages ? (
                    <Link
                      href={hrefWith(active, { page: String(results.page + 1) })}
                      className="rounded-md border border-gray-200 bg-surface px-3 py-1.5 text-gray-600 hover:border-iris hover:text-iris"
                    >
                      Next →
                    </Link>
                  ) : (
                    <span aria-hidden className="rounded-md border border-gray-100 px-3 py-1.5 text-gray-300">
                      Next →
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
