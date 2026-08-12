import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { PluginCard } from "@/components/plugin-card";
import { Card, Container, StatBlock } from "@/components/ui";
import { getCatalogMetrics } from "@/lib/catalog-insights";
import { formatDate, formatNumber } from "@/lib/format";
import { getLocale } from "@/lib/i18n-server";
import { searchPlugins } from "@/lib/queries";
import {
  INTENT_LANDINGS,
  intentBrowseHref,
  type IntentLandingKey,
} from "@/lib/seo-content";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

export async function intentLandingMetadata(key: IntentLandingKey): Promise<Metadata> {
  const locale = await getLocale();
  const definition = INTENT_LANDINGS[key];
  const copy = definition.copy[locale];
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: definition.path },
    openGraph: {
      type: "website",
      title: copy.title,
      description: copy.description,
      url: definition.path,
      siteName: SITE_NAME,
    },
    twitter: { card: "summary_large_image", title: copy.title, description: copy.description },
  };
}

export async function IntentLanding({ intent }: { intent: IntentLandingKey }) {
  const definition = INTENT_LANDINGS[intent];
  const [locale, results, metrics] = await Promise.all([
    getLocale(),
    searchPlugins({ ...definition.filters, sort: "stars", perPage: 9 }),
    getCatalogMetrics(definition.filters),
  ]);
  const copy = definition.copy[locale];
  const zh = locale === "zh-CN";
  const browseHref = intentBrowseHref(definition);
  const reportDate = formatDate(metrics.latestIndexedAt, locale);
  const pageJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${absoluteUrl(definition.path)}#collection`,
    url: absoluteUrl(definition.path),
    name: copy.title,
    description: copy.description,
    inLanguage: locale,
    dateModified: metrics.latestIndexedAt?.toISOString(),
    isPartOf: { "@id": `${absoluteUrl("/")}#website` },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: results.items.length,
      itemListElement: results.items.map((plugin, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: plugin.name,
        url: absoluteUrl(`/plugins/${encodeURIComponent(plugin.slug)}`),
      })),
    },
  };

  return (
    <div>
      <JsonLd data={pageJsonLd} />
      <section>
        <Container className="pb-12 pt-14 sm:pb-16 sm:pt-20">
          <p className="font-mono text-xs text-gray-500">{copy.eyebrow}</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold tracking-tight sm:text-5xl">
            {copy.title}
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-gray-600">
            {copy.description}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={browseHref}
              className="rounded-md bg-action px-4 py-2 text-sm font-semibold text-on-action hover:bg-iris"
            >
              {copy.browseLabel} →
            </Link>
            <a
              href={definition.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-gray-200 bg-surface px-4 py-2 text-sm font-medium text-gray-600 hover:border-iris hover:text-iris"
            >
              {copy.sourceLabel} ↗
            </a>
          </div>
        </Container>
      </section>

      <section aria-label={zh ? "目录数据" : "Directory evidence"}>
        <Container className="pb-16">
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 border-y border-gray-200 py-8 sm:grid-cols-4 sm:gap-x-6">
            <StatBlock value={formatNumber(metrics.plugins, locale)} label={zh ? "匹配插件" : "Matching plugins"} />
            <StatBlock value={formatNumber(metrics.repositories, locale)} label={zh ? "源码仓库" : "Source repositories"} />
            <StatBlock value={formatNumber(metrics.skills, locale)} label={zh ? "包含技能" : "Included skills"} />
            <StatBlock value={formatNumber(metrics.mcpServers, locale)} label={zh ? "MCP 服务器" : "MCP servers"} />
          </div>
          <p className="mt-3 text-xs text-gray-500">
            {zh ? `数据快照更新于 ${reportDate}。` : `Catalog snapshot updated ${reportDate}.`} {" "}
            <Link href="/insights#methodology" className="font-medium text-iris hover:text-iris-deep">
              {zh ? "查看索引方法" : "See the indexing methodology"} →
            </Link>
          </p>
        </Container>
      </section>

      <section>
        <Container className="grid gap-5 pb-16 lg:grid-cols-2">
          <Card className="h-full p-5 sm:p-6">
            <h2 className="font-display text-xl font-bold tracking-tight">{copy.guideTitle}</h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">{copy.guideBody}</p>
          </Card>
          <Card className="h-full p-5 sm:p-6">
            <h2 className="font-display text-xl font-bold tracking-tight">{copy.checklistTitle}</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-gray-600">
              {copy.checklist.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="text-gray-400">—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Container>
      </section>

      {metrics.topCategories.length > 0 ? (
        <section>
          <Container className="pb-16">
            <h2 className="font-display text-xl font-bold tracking-tight">
              {zh ? "常见标签" : "Common tags in this collection"}
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {metrics.topCategories.slice(0, 10).map((category) => (
                <Link
                  key={category.name}
                  href={`/plugins?category=${encodeURIComponent(category.name)}`}
                  className="rounded-full border border-gray-200 bg-surface px-3 py-1.5 font-mono text-xs text-gray-600 hover:border-iris hover:text-iris"
                >
                  {category.name} <span className="text-gray-400">{category.count}</span>
                </Link>
              ))}
            </div>
          </Container>
        </section>
      ) : null}

      <section>
        <Container className="pb-16 sm:pb-20">
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-2xl font-bold tracking-tight">{copy.collectionTitle}</h2>
            <Link href={browseHref} className="text-sm font-medium text-iris hover:text-iris-deep">
              {copy.browseLabel} →
            </Link>
          </div>
          <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {results.items.map((plugin) => (
              <PluginCard key={plugin.slug} plugin={plugin} locale={locale} />
            ))}
          </div>
        </Container>
      </section>
    </div>
  );
}
