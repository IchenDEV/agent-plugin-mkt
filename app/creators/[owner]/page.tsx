import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { PluginCard } from "@/components/plugin-card";
import { Container, EmptyState } from "@/components/ui";
import { getCreator, getCreator as getCreatorCached, searchPlugins } from "@/lib/queries";
import { formatNumber, relativeTime } from "@/lib/format";
import { SITE_NAME, absoluteUrl } from "@/lib/site";
import { getLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

// Dedupes the detail lookup between generateMetadata and the page render.
const getCreatorDetail = getCreatorCached;

const PER_PAGE = 24;

const COPY = {
  en: {
    plugins: "plugins",
    stars: "stars",
    skills: "skills",
    mcp: "MCP servers",
    updated: "Last source update",
    all: "All plugins",
    empty: "No plugins indexed for this creator yet.",
    intro: (count: number, stars: number) =>
      `${count} open-source plugin${count === 1 ? "" : "s"} by this GitHub creator ${stars === 1 ? "is" : "are"} indexed, with ${stars} combined stars.`,
  },
  "zh-CN": {
    plugins: "个插件",
    stars: "Stars",
    skills: "个技能",
    mcp: "个 MCP 服务器",
    updated: "最近源码更新",
    all: "全部插件",
    empty: "该创作者还没有被收录的插件。",
    intro: (count: number, stars: number) =>
      `已收录该 GitHub 创作者发布的 ${count} 个开源插件，合计 ${stars} 个 Star。`,
  },
} as const;

type CreatorPageProps = {
  params: Promise<{ owner: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function positiveInt(value: string | undefined): number | undefined {
  if (!value || !/^[0-9]+$/.test(value)) return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 ? n : undefined;
}

function normalizeOwner(raw: string): string {
  const decoded = decodeURIComponent(raw).trim().toLowerCase();
  // GitHub owner logins: alphanumerics and hyphens, max 39 chars.
  return /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(decoded) ? decoded : "";
}

export async function generateMetadata({ params, searchParams }: CreatorPageProps): Promise<Metadata> {
  const [{ owner: rawOwner }, sp, locale] = await Promise.all([params, searchParams, getLocale()]);
  const zh = locale === "zh-CN";
  const owner = normalizeOwner(rawOwner);
  const creator = owner ? await getCreatorDetail(owner) : null;
  if (!creator) {
    return { title: zh ? "未找到创作者" : "Creator not found", robots: { index: false, follow: false } };
  }
  const page = positiveInt(Array.isArray(sp.page) ? sp.page[0] : sp.page) ?? 1;
  const name = creator.displayName ?? creator.owner;
  const title = zh
    ? `${name} 的插件${page > 1 ? ` — 第 ${page} 页` : ""}`
    : `Plugins by ${name}${page > 1 ? ` — Page ${page}` : ""}`;
  const description = zh
    ? `浏览 ${name} 发布的 ${creator.pluginCount} 个开源 Agent 插件，查看其技能、MCP 服务器、兼容格式和源码。`
    : `Browse ${creator.pluginCount} open-source agent plugins published by ${name} on GitHub, with skills, MCP servers, formats, and source details.`;
  return {
    title,
    description,
    alternates: {
      canonical: page > 1 ? `/creators/${creator.owner}?page=${page}` : `/creators/${creator.owner}`,
    },
    robots: page > 1 ? { index: false, follow: true } : undefined,
    openGraph: { type: "website", title, description, url: absoluteUrl(`/creators/${creator.owner}`), siteName: SITE_NAME },
    twitter: { card: "summary", title, description },
  };
}

export default async function CreatorPage({ params, searchParams }: CreatorPageProps) {
  const [{ owner: rawOwner }, sp, locale] = await Promise.all([params, searchParams, getLocale()]);
  const c = COPY[locale];
  const zh = locale === "zh-CN";
  const owner = normalizeOwner(rawOwner);
  const creator = owner ? await getCreator(owner) : null;
  if (!creator) notFound();

  const page = positiveInt(Array.isArray(sp.page) ? sp.page[0] : sp.page) ?? 1;
  const results = await searchPlugins({ owner, sort: "stars", page, perPage: PER_PAGE });
  const name = creator.displayName ?? creator.owner;
  const canonical = absoluteUrl(`/creators/${creator.owner}`);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": `${canonical}#profile`,
    url: canonical,
    name: zh ? `${name} 的插件` : `Plugins by ${name}`,
    description: c.intro(creator.pluginCount, creator.totalStars),
    inLanguage: locale,
    isPartOf: { "@id": `${absoluteUrl("/")}#website` },
    mainEntity: {
      "@type": "Person",
      name,
      alternateName: creator.owner,
      url: `https://github.com/${creator.owner}`,
    },
    mainEntityOfPage: {
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

  const stats = [
    { label: c.plugins, value: formatNumber(creator.pluginCount, locale) },
    { label: c.stars, value: formatNumber(creator.totalStars, locale) },
    { label: c.skills, value: formatNumber(creator.totalSkills, locale) },
    { label: c.mcp, value: formatNumber(creator.totalMcpServers, locale) },
  ];

  return (
    <Container className="py-10">
      <JsonLd data={jsonLd} />
      <Link href="/creators" className="text-sm font-medium text-gray-500 hover:text-iris">
        ← {zh ? "全部创作者" : "All creators"}
      </Link>

      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="break-all font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
            {creator.owner}
          </h1>
          <a
            href={`https://github.com/${creator.owner}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-gray-200 bg-surface px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-iris hover:text-iris"
          >
            GitHub ↗
          </a>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-500">
          {c.intro(creator.pluginCount, creator.totalStars)}
        </p>
        <dl className="mt-5 grid max-w-xl grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt className="font-mono text-[11px] uppercase tracking-wider text-gray-400">{stat.label}</dt>
              <dd className="mt-1 font-display text-xl font-semibold tracking-tight">{stat.value}</dd>
            </div>
          ))}
        </dl>
        {creator.lastPushedAt ? (
          <p className="mt-3 text-xs text-gray-500">
            {c.updated}: {relativeTime(creator.lastPushedAt, locale)}
          </p>
        ) : null}
      </header>

      <section className="mt-8" aria-label={zh ? "该创作者的插件" : "Plugins by this creator"}>
        {results.total === 0 ? (
          <EmptyState title={c.empty} hint={c.all} />
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
              <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-4 text-sm font-medium">
                {results.page > 1 ? (
                  <Link
                    href={`/creators/${creator.owner}${results.page === 2 ? "" : `?page=${results.page - 1}`}`}
                    className="rounded-md border border-gray-200 bg-surface px-3 py-1.5 text-gray-600 hover:border-iris hover:text-iris"
                  >
                    {zh ? "← 上一页" : "← Prev"}
                  </Link>
                ) : (
                  <span aria-hidden className="rounded-md border border-gray-100 px-3 py-1.5 text-gray-300">
                    {zh ? "← 上一页" : "← Prev"}
                  </span>
                )}
                <span className="text-gray-500">
                  {zh ? `第 ${results.page} / ${results.totalPages} 页` : `Page ${results.page} of ${results.totalPages}`}
                </span>
                {results.page < results.totalPages ? (
                  <Link
                    href={`/creators/${creator.owner}?page=${results.page + 1}`}
                    className="rounded-md border border-gray-200 bg-surface px-3 py-1.5 text-gray-600 hover:border-iris hover:text-iris"
                  >
                    {zh ? "下一页 →" : "Next →"}
                  </Link>
                ) : (
                  <span aria-hidden className="rounded-md border border-gray-100 px-3 py-1.5 text-gray-300">
                    {zh ? "下一页 →" : "Next →"}
                  </span>
                )}
              </nav>
            ) : null}
          </>
        )}
      </section>
    </Container>
  );
}
