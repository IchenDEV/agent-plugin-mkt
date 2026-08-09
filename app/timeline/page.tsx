import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { JsonLd } from "@/components/json-ld";
import { Badge, Container, EmptyState } from "@/components/ui";
import { formatDate, formatNumber } from "@/lib/format";
import { searchPlugins, type PluginSummary } from "@/lib/queries";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

type TimelinePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const getTimelineResults = cache((page: number) =>
  searchPlugins({ sort: "recent", page, perPage: PER_PAGE }),
);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Invalid values are treated as unset, never an error. */
function positiveInt(value: string | undefined): number | undefined {
  if (!value || !/^[0-9]+$/.test(value)) return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 ? n : undefined;
}

export async function generateMetadata({ searchParams }: TimelinePageProps): Promise<Metadata> {
  const sp = await searchParams;
  const page = positiveInt(first(sp.page)) ?? 1;
  const results = await getTimelineResults(page);
  const canonical = page > 1 ? `/timeline?page=${page}` : "/timeline";
  const title = `Agent Plugin timeline${page > 1 ? ` — Page ${page}` : ""}`;
  const description = "Recently indexed Agent Plugins, grouped by the day they entered the index.";
  return {
    title,
    description,
    alternates: { canonical },
    robots: page > results.totalPages ? { index: false, follow: true } : undefined,
    openGraph: { type: "website", title, description, url: canonical, siteName: SITE_NAME },
    twitter: { card: "summary_large_image", title, description },
  };
}

interface DayGroup {
  day: string;
  items: PluginSummary[];
}

/**
 * Group plugins by the calendar day of createdAt — the same field the
 * sort:"recent" query orders by, and the day the plugin entered the index
 * (indexedAt is bumped on every re-index run).
 */
function groupByDay(items: PluginSummary[]): DayGroup[] {
  const groups = new Map<string, PluginSummary[]>();
  for (const item of items) {
    const day = formatDate(item.createdAt);
    const bucket = groups.get(day);
    if (bucket) bucket.push(item);
    else groups.set(day, [item]);
  }
  return [...groups.entries()].map(([day, dayItems]) => ({ day, items: dayItems }));
}

function StarCount({ stars }: { stars: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-amber-700">
      <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 fill-current">
        <path d="M8 1.5l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.3l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.5z" />
      </svg>
      {formatNumber(stars)}
      <span className="sr-only">stars</span>
    </span>
  );
}

function TimelineEntry({ plugin }: { plugin: PluginSummary }) {
  return (
    <li className="relative pl-6">
      {/* Dot on the day group's rail */}
      <span
        aria-hidden
        className="absolute left-0 top-[7px] size-2 -translate-x-1/2 rounded-full border border-surface bg-gray-300"
      />
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <Link
          href={`/plugins/${plugin.slug}`}
          className="max-w-full truncate font-mono text-sm font-medium hover:text-iris"
        >
          {plugin.name}
        </Link>
        <StarCount stars={plugin.repoStars} />
      </div>
      <p className="mt-0.5 truncate text-sm text-gray-500">
        {plugin.description ?? "No description in manifest."}
      </p>
      {plugin.skillCount > 0 || plugin.mcpCount > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {plugin.skillCount > 0 ? (
            <Badge variant="skill">
              {plugin.skillCount} skill{plugin.skillCount > 1 ? "s" : ""}
            </Badge>
          ) : null}
          {plugin.mcpCount > 0 ? (
            <Badge variant="mcp">
              {plugin.mcpCount} MCP server{plugin.mcpCount > 1 ? "s" : ""}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export default async function TimelinePage({ searchParams }: TimelinePageProps) {
  const sp = await searchParams;
  const page = positiveInt(first(sp.page)) ?? 1;

  const results = await getTimelineResults(page);
  const groups = groupByDay(results.items);
  const currentPath = page > 1 ? `/timeline?page=${page}` : "/timeline";
  const timelineJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${absoluteUrl(currentPath)}#collection`,
    url: absoluteUrl(currentPath),
    name: `Agent Plugin timeline${page > 1 ? ` — Page ${page}` : ""}`,
    description: "Recently indexed Agent Plugins, newest first.",
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
      <JsonLd data={timelineJsonLd} />
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Timeline</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          Plugins as they entered the index, newest first, grouped by the day they were indexed.
        </p>
      </div>

      {results.total === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="The index is empty"
            hint="Nothing has been crawled yet — once plugins are indexed they show up here, newest first."
          />
        </div>
      ) : results.items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Nothing on this page"
            hint="This page is past the end of the timeline."
            action={
              <Link
                href="/timeline"
                className="inline-flex rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-iris"
              >
                Back to the latest
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-10 space-y-10">
            {groups.map((group) => (
              <section key={group.day} aria-label={group.day}>
                <h2 className="font-display text-lg font-semibold tracking-tight">{group.day}</h2>
                <ol className="ml-1 mt-4 space-y-5 border-l border-gray-200">
                  {group.items.map((plugin) => (
                    <TimelineEntry key={plugin.slug} plugin={plugin} />
                  ))}
                </ol>
              </section>
            ))}
          </div>

          {results.totalPages > 1 ? (
            <nav
              aria-label="Pagination"
              className="mt-12 flex items-center justify-center gap-4 text-sm font-medium"
            >
              {results.page > 1 ? (
                <Link
                  href={results.page === 2 ? "/timeline" : `/timeline?page=${results.page - 1}`}
                  className="rounded-md border border-gray-200 bg-surface px-3 py-1.5 text-gray-600 hover:border-iris hover:text-iris"
                >
                  &larr; Newer
                </Link>
              ) : (
                <span aria-hidden className="rounded-md border border-gray-100 px-3 py-1.5 text-gray-300">
                  &larr; Newer
                </span>
              )}
              <span className="text-gray-500">
                Page {results.page} of {results.totalPages}
              </span>
              {results.page < results.totalPages ? (
                <Link
                  href={`/timeline?page=${results.page + 1}`}
                  className="rounded-md border border-gray-200 bg-surface px-3 py-1.5 text-gray-600 hover:border-iris hover:text-iris"
                >
                  Older &rarr;
                </Link>
              ) : (
                <span aria-hidden className="rounded-md border border-gray-100 px-3 py-1.5 text-gray-300">
                  Older &rarr;
                </span>
              )}
            </nav>
          ) : null}
        </>
      )}
    </Container>
  );
}
