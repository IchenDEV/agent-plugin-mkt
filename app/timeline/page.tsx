import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { JsonLd } from "@/components/json-ld";
import { Badge, Container, EmptyState } from "@/components/ui";
import { formatDate, formatNumber } from "@/lib/format";
import { searchPlugins, type PluginSummary } from "@/lib/queries";
import { PROTOCOL_LABELS } from "@/lib/protocols";
import { SITE_NAME, absoluteUrl } from "@/lib/site";
import type { Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { pluginDescription } from "@/lib/seo-content";

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
  const [sp, locale] = await Promise.all([searchParams, getLocale()]);
  const zh = locale === "zh-CN";
  const page = positiveInt(first(sp.page)) ?? 1;
  const results = await getTimelineResults(page);
  const canonical = page > 1 ? `/timeline?page=${page}` : "/timeline";
  const title = zh
    ? `最近新增插件${page > 1 ? ` — 第 ${page} 页` : ""}`
    : `Recently added plugins${page > 1 ? ` — Page ${page}` : ""}`;
  const description = zh
    ? "查看最近添加到目录的 Codex、Claude Code 和 Agent Plugins 插件，按添加日期分组。"
    : "See recently added Codex, Claude Code, and Agent Plugins, grouped by the day they were added to the directory.";
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
function groupByDay(items: PluginSummary[], locale: Locale): DayGroup[] {
  const groups = new Map<string, PluginSummary[]>();
  for (const item of items) {
    const day = formatDate(item.createdAt, locale);
    const bucket = groups.get(day);
    if (bucket) bucket.push(item);
    else groups.set(day, [item]);
  }
  return [...groups.entries()].map(([day, dayItems]) => ({ day, items: dayItems }));
}

function StarCount({ stars, locale }: { stars: number; locale: Locale }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-amber-700">
      <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 fill-current">
        <path d="M8 1.5l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.3l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.5z" />
      </svg>
      {formatNumber(stars, locale)}
      <span className="sr-only">{locale === "zh-CN" ? "Stars" : "stars"}</span>
    </span>
  );
}

function TimelineEntry({ plugin, locale }: { plugin: PluginSummary; locale: Locale }) {
  const zh = locale === "zh-CN";
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
        <StarCount stars={plugin.repoStars} locale={locale} />
      </div>
      <p className="mt-0.5 truncate text-sm text-gray-500">
        {pluginDescription(plugin, locale)}
      </p>
      {plugin.protocols.length > 0 || plugin.skillCount > 0 || plugin.mcpCount > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {plugin.protocols.map((protocol) => (
            <Badge key={protocol} variant="neutral">
              {PROTOCOL_LABELS[protocol]}
            </Badge>
          ))}
          {plugin.skillCount > 0 ? (
            <Badge variant="skill">
              {zh ? `${plugin.skillCount} 个技能` : `${plugin.skillCount} skill${plugin.skillCount > 1 ? "s" : ""}`}
            </Badge>
          ) : null}
          {plugin.mcpCount > 0 ? (
            <Badge variant="mcp">
              {zh ? `${plugin.mcpCount} 个 MCP 服务器` : `${plugin.mcpCount} MCP server${plugin.mcpCount > 1 ? "s" : ""}`}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export default async function TimelinePage({ searchParams }: TimelinePageProps) {
  const [sp, locale] = await Promise.all([searchParams, getLocale()]);
  const zh = locale === "zh-CN";
  const page = positiveInt(first(sp.page)) ?? 1;

  const results = await getTimelineResults(page);
  const groups = groupByDay(results.items, locale);
  const currentPath = page > 1 ? `/timeline?page=${page}` : "/timeline";
  const timelineJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${absoluteUrl(currentPath)}#collection`,
    url: absoluteUrl(currentPath),
    name: zh ? `最近新增插件${page > 1 ? ` — 第 ${page} 页` : ""}` : `Recently added plugins${page > 1 ? ` — Page ${page}` : ""}`,
    description: zh ? "最近添加到目录的插件，按添加时间倒序显示。" : "Plugins recently added to the directory, newest first.",
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
      <JsonLd data={timelineJsonLd} />
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{zh ? "最近新增" : "Recently added"}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          {zh ? "按添加到目录的日期分组，最新添加的插件排在前面。" : "Plugins grouped by the day they were added to the directory, newest first."}
        </p>
      </div>

      {results.total === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={zh ? "暂时没有插件" : "No plugins are available yet"}
            hint={zh ? "插件添加到目录后，会按最新优先显示在这里。" : "Plugins will appear here after they are added to the directory."}
          />
        </div>
      ) : results.items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={zh ? "本页没有内容" : "Nothing on this page"}
            hint={zh ? "当前页超出了时间线范围。" : "This page is past the end of the timeline."}
            action={
              <Link
                href="/timeline"
                className="inline-flex rounded-md bg-action px-4 py-2 text-sm font-semibold text-on-action hover:bg-iris"
              >
                {zh ? "返回最新内容" : "Back to the latest"}
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
                    <TimelineEntry key={plugin.slug} plugin={plugin} locale={locale} />
                  ))}
                </ol>
              </section>
            ))}
          </div>

          {results.totalPages > 1 ? (
            <nav
              aria-label={zh ? "分页" : "Pagination"}
              className="mt-12 flex items-center justify-center gap-4 text-sm font-medium"
            >
              {results.page > 1 ? (
                <Link
                  href={results.page === 2 ? "/timeline" : `/timeline?page=${results.page - 1}`}
                  className="rounded-md border border-gray-200 bg-surface px-3 py-1.5 text-gray-600 hover:border-iris hover:text-iris"
                >
                  &larr; {zh ? "较新" : "Newer"}
                </Link>
              ) : (
                <span aria-hidden className="rounded-md border border-gray-100 px-3 py-1.5 text-gray-300">
                  &larr; {zh ? "较新" : "Newer"}
                </span>
              )}
              <span className="text-gray-500">
                {zh ? `第 ${results.page} / ${results.totalPages} 页` : `Page ${results.page} of ${results.totalPages}`}
              </span>
              {results.page < results.totalPages ? (
                <Link
                  href={`/timeline?page=${results.page + 1}`}
                  className="rounded-md border border-gray-200 bg-surface px-3 py-1.5 text-gray-600 hover:border-iris hover:text-iris"
                >
                  {zh ? "较早" : "Older"} &rarr;
                </Link>
              ) : (
                <span aria-hidden className="rounded-md border border-gray-100 px-3 py-1.5 text-gray-300">
                  {zh ? "较早" : "Older"} &rarr;
                </span>
              )}
            </nav>
          ) : null}
        </>
      )}
    </Container>
  );
}
