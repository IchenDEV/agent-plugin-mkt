import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { JsonLd } from "@/components/json-ld";
import { Card, Container, StatBlock } from "@/components/ui";
import { getCatalogMetrics } from "@/lib/catalog-insights";
import { formatDate, formatNumber } from "@/lib/format";
import { getLocale } from "@/lib/i18n-server";
import { PROTOCOL_LABELS, PLUGIN_PROTOCOLS } from "@/lib/protocols";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const zh = locale === "zh-CN";
  const title = zh ? "Agent Plugins 生态数据" : "Agent Plugins ecosystem data";
  const description = zh
    ? "基于公开 GitHub 清单的 Agent Plugins、技能、MCP 服务器、协议覆盖和源码仓库数据快照，并公开索引方法。"
    : "A source-backed snapshot of Agent Plugins, skills, MCP servers, protocol coverage, and public GitHub repositories, with a transparent indexing methodology.";
  return {
    title,
    description,
    alternates: { canonical: "/insights" },
    openGraph: { type: "article", title, description, url: "/insights", siteName: SITE_NAME },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function InsightsPage() {
  const [locale, metrics] = await Promise.all([getLocale(), getCatalogMetrics()]);
  const zh = locale === "zh-CN";
  const snapshotDate = formatDate(metrics.latestIndexedAt, locale);
  const citation = zh
    ? `Agent Plugins Marketplace，《Agent Plugins 生态数据》，${snapshotDate}，https://pluginsmp.com/insights`
    : `Agent Plugins Marketplace, “Agent Plugins ecosystem data,” ${snapshotDate}, https://pluginsmp.com/insights`;
  const description = zh
    ? `截至 ${snapshotDate}，目录从 ${formatNumber(metrics.repositories, locale)} 个公开 GitHub 仓库中索引了 ${formatNumber(metrics.plugins, locale)} 个插件。`
    : `As of ${snapshotDate}, the directory indexes ${formatNumber(metrics.plugins, locale)} plugins from ${formatNumber(metrics.repositories, locale)} public GitHub repositories.`;
  const reportJsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "@id": `${absoluteUrl("/insights")}#report`,
    url: absoluteUrl("/insights"),
    headline: zh ? "Agent Plugins 生态数据" : "Agent Plugins ecosystem data",
    description,
    inLanguage: locale,
    dateModified: metrics.latestIndexedAt?.toISOString(),
    isPartOf: { "@id": `${absoluteUrl("/")}#website` },
    publisher: { "@type": "Organization", name: SITE_NAME },
    about: PLUGIN_PROTOCOLS.map((protocol) => ({
      "@type": "DefinedTerm",
      name: PROTOCOL_LABELS[protocol],
    })),
  };

  return (
    <Container className="py-12 sm:py-16">
      <JsonLd data={reportJsonLd} />
      <header className="max-w-3xl">
        <p className="font-mono text-xs text-gray-500">{zh ? "公开目录快照" : "Public catalog snapshot"}</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
          {zh ? "Agent Plugins 生态数据" : "Agent Plugins ecosystem data"}
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-gray-600">{description}</p>
        <p className="mt-2 text-xs text-gray-500">
          {zh ? `数据更新时间：${snapshotDate}` : `Data updated ${snapshotDate}`}
        </p>
      </header>

      <section aria-label={zh ? "目录规模" : "Catalog scale"} className="mt-10">
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 border-y border-gray-200 py-8 sm:grid-cols-4 sm:gap-x-6">
          <StatBlock value={formatNumber(metrics.plugins, locale)} label={zh ? "插件" : "Plugins"} />
          <StatBlock value={formatNumber(metrics.repositories, locale)} label={zh ? "源码仓库" : "Repositories"} />
          <StatBlock value={formatNumber(metrics.skills, locale)} label={zh ? "技能" : "Skills"} />
          <StatBlock value={formatNumber(metrics.mcpServers, locale)} label={zh ? "MCP 服务器" : "MCP servers"} />
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-bold tracking-tight">
          {zh ? "协议覆盖" : "Protocol coverage"}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">
          {zh
            ? "同一个插件根目录可以同时包含多种规范清单，因此各协议数量之和可能大于插件总数。"
            : "One plugin root can contain manifests for more than one protocol, so protocol counts may add up to more than the plugin total."}
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {PLUGIN_PROTOCOLS.map((protocol) => (
            <Card key={protocol} className="p-5">
              <p className="font-mono text-xs text-gray-500">{PROTOCOL_LABELS[protocol]}</p>
              <p className="mt-2 font-display text-3xl font-bold tracking-tight">
                {formatNumber(metrics.protocolCounts[protocol], locale)}
              </p>
              <Link
                href={protocol === "codex" ? "/codex-plugins" : protocol === "claude-code" ? "/claude-code-plugins" : "/plugins?protocol=agent-plugins"}
                className="mt-3 inline-block text-sm font-medium text-iris hover:text-iris-deep"
              >
                {zh ? "查看插件" : "View plugins"} →
              </Link>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-12 grid gap-5 md:grid-cols-3">
        <Card className="p-5">
          <p className="font-mono text-xs text-gray-500">{zh ? "跨运行时" : "Cross-runtime"}</p>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight">
            {formatNumber(metrics.crossRuntimePlugins, locale)}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            {zh ? "包含两种或以上受支持清单格式的插件。" : "Plugins with two or more supported manifest formats."}
          </p>
        </Card>
        <Card className="p-5">
          <p className="font-mono text-xs text-gray-500">{zh ? "声明许可证" : "License declared"}</p>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight">
            {formatNumber(metrics.licensedPlugins, locale)}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            {zh ? "在索引清单中提供了许可证信息的插件。" : "Plugins whose indexed metadata includes license information."}
          </p>
        </Card>
        <Card className="p-5">
          <p className="font-mono text-xs text-gray-500">{zh ? "90 天内活跃" : "Active in 90 days"}</p>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight">
            {formatNumber(metrics.recentlyUpdatedPlugins, locale)}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            {zh ? "源码仓库最近推送时间处于快照日期前 90 天内。" : "Source repositories pushed within 90 days of the snapshot date."}
          </p>
        </Card>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-bold tracking-tight">{zh ? "常见标签" : "Common manifest tags"}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">
          {zh ? "标签直接来自插件清单关键词，不是目录编辑添加的主题判断。" : "Tags come directly from plugin manifest keywords rather than editorial topic assignments."}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {metrics.topCategories.map((category) => (
            <Link
              key={category.name}
              href={`/plugins?category=${encodeURIComponent(category.name)}`}
              className="rounded-full border border-gray-200 bg-surface px-3 py-1.5 font-mono text-xs text-gray-600 hover:border-iris hover:text-iris"
            >
              {category.name} <span className="text-gray-400">{category.count}</span>
            </Link>
          ))}
        </div>
      </section>

      <section id="methodology" className="mt-12 scroll-mt-24">
        <Card tab="methodology.md">
          <div className="p-5 sm:p-6">
            <h2 className="font-display text-2xl font-bold tracking-tight">{zh ? "索引方法" : "Indexing methodology"}</h2>
            <ol className="mt-4 space-y-3 text-sm leading-relaxed text-gray-600">
              <li><span className="mr-2 font-mono text-gray-400">01</span>{zh ? "从公开 GitHub 仓库发现候选插件根目录。" : "Discover candidate plugin roots in public GitHub repositories."}</li>
              <li><span className="mr-2 font-mono text-gray-400">02</span>{zh ? "只接受 Codex、Claude Code 或 Agent Plugins 的规范清单位置。" : "Accept only canonical Codex, Claude Code, or Agent Plugins manifest locations."}</li>
              <li><span className="mr-2 font-mono text-gray-400">03</span>{zh ? "验证清单结构并索引技能、MCP 配置、源码路径和仓库元数据。" : "Validate manifest structure and index skills, MCP configuration, source paths, and repository metadata."}</li>
              <li><span className="mr-2 font-mono text-gray-400">04</span>{zh ? "保留源码链接和原始清单，方便访问者独立复核；收录不等于安全背书。" : "Keep source links and raw manifests available for independent review; inclusion is not a security endorsement."}</li>
            </ol>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
              <a href="https://github.com/IchenDEV/agent-plugin-mkt" target="_blank" rel="noopener noreferrer" className="text-iris hover:text-iris-deep">
                {zh ? "查看索引器源码" : "Review the indexer source"} ↗
              </a>
              <Link href="/docs" className="text-iris hover:text-iris-deep">
                {zh ? "使用公开 API" : "Use the public API"} →
              </Link>
            </div>
          </div>
        </Card>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-bold tracking-tight">{zh ? "引用这份快照" : "Cite this snapshot"}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">
          {zh ? "引用时请保留快照日期和页面链接；数据会随目录刷新而变化。" : "Keep the snapshot date and page URL in citations; totals change as the directory refreshes."}
        </p>
        <Card className="mt-4">
          <div className="flex items-start gap-3 p-4">
            <code className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-gray-700">{citation}</code>
            <CopyButton text={citation} label={zh ? "复制引用" : "Copy citation"} copiedLabel={zh ? "已复制" : "Copied"} errorLabel={zh ? "复制失败" : "Copy failed"} />
          </div>
        </Card>
      </section>
    </Container>
  );
}
