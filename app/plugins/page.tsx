import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PluginCard } from "@/components/plugin-card";
import { Container, EmptyState, SearchInput } from "@/components/ui";
import {
  getCategories,
  searchPlugins,
  type ComponentType,
  type SortOrder,
  type Transport,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Browse plugins" };

const TYPES = ["skills", "mcp"] as const satisfies readonly ComponentType[];
const TRANSPORTS = ["stdio", "streamable-http", "sse"] as const satisfies readonly Transport[];
const SORTS = ["stars", "updated", "recent"] as const satisfies readonly SortOrder[];

const PARAM_KEYS = ["q", "category", "type", "transport", "sort", "page"] as const;
type ParamKey = (typeof PARAM_KEYS)[number];
type ActiveParams = Partial<Record<ParamKey, string>>;

type BrowsePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Invalid values are treated as unset, never an error. */
function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value !== undefined && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function positiveInt(value: string | undefined): number | undefined {
  if (!value || !/^[0-9]+$/.test(value)) return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 ? n : undefined;
}

/**
 * Build a /plugins href by merging the active params with a patch.
 * A `null` patch value removes the param; `page` always resets unless patched.
 */
function hrefWith(active: ActiveParams, patch: Partial<Record<ParamKey, string | null>>): string {
  const search = new URLSearchParams();
  for (const key of PARAM_KEYS) {
    const value = key in patch ? patch[key] : active[key];
    if (value) search.set(key, value);
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
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  mono?: boolean;
  count?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm ${
        mono ? "font-mono text-[13px]" : ""
      } ${active ? "bg-iris-soft font-medium text-iris-deep" : "text-gray-600 hover:bg-white hover:text-ink"}`}
    >
      <span className="truncate">{label}</span>
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
  const sort = oneOf(first(sp.sort), SORTS) ?? "stars";
  const page = positiveInt(first(sp.page)) ?? 1;

  const [results, categories] = await Promise.all([
    searchPlugins({ q, category, type, transport, sort, page }),
    getCategories(30),
  ]);

  // Canonical params for link building: default sort and page 1 stay out of URLs.
  const active: ActiveParams = {
    q,
    category,
    type,
    transport,
    sort: sort === "stars" ? undefined : sort,
  };
  const hasFilters = Boolean(q || category || type || transport);

  const total = results.total;
  const countSentence = hasFilters
    ? `${total} plugin${total === 1 ? "" : "s"} match${total === 1 ? "es" : ""} the active filters.`
    : `${total} plugin${total === 1 ? "" : "s"} indexed from public GitHub repos.`;

  const hidden: Record<string, string> = {};
  for (const key of ["category", "type", "transport", "sort"] as const) {
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

  const sortOptions = [
    { label: "Most stars", href: hrefWith(active, { sort: null }), active: sort === "stars" },
    {
      label: "Recently updated",
      href: hrefWith(active, { sort: "updated" }),
      active: sort === "updated",
    },
    { label: "Newly indexed", href: hrefWith(active, { sort: "recent" }), active: sort === "recent" },
  ];

  return (
    <Container className="py-10">
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

          {results.items.length === 0 ? (
            <EmptyState
              title="No plugins match"
              hint="Clear the filters or try a broader term — the index only includes public repos with a valid plugin.json."
              action={
                <Link
                  href="/plugins"
                  className="inline-flex rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-iris"
                >
                  Clear all filters
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
