import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { Card, Container, EmptyState, SearchInput, StatBlock } from "@/components/ui";
import { PluginCard } from "@/components/plugin-card";
import { formatNumber, relativeTime } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { getStats, searchPlugins } from "@/lib/queries";
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

const CODEX_SPEC_URL = "https://developers.openai.com/plugins/build/plugins";
const CLAUDE_SPEC_URL = "https://code.claude.com/docs/en/plugins-reference";

const HOME_COPY = {
  en: {
    compatibility: "Codex + Claude Code compatible",
    title: "One registry for agent plugins",
    intro: "Discover open-source skills and MCP servers packaged for Codex, Claude Code, or both, indexed straight from canonical GitHub manifests.",
    searchPlaceholder: "Search plugins, skills, MCP servers…",
    search: "Search",
    browse: "Browse all plugins →",
    agentsLink: "For agents: API & MCP →",
    stats: "Registry stats",
    statPlugins: "Plugins indexed",
    statSkills: "Skills",
    statMcp: "MCP servers",
    statCategories: "Categories",
    emptyTitle: "The index is empty",
    emptyHint: "Nothing has been crawled yet — run npm run db:seed to index the sample registry, then refresh this page.",
    featured: "Featured plugins",
    browseAll: "Browse all →",
    recent: "Recently indexed",
    noDescription: "No description in manifest.",
    indexed: "indexed",
    anatomy: "Anatomy of a plugin",
    anatomyBody: "Codex and Claude Code plugins share the same self-contained shape: runtime metadata, skills under",
    anatomyBodyEnd: ", and optional MCP configuration. Their canonical manifest directories differ, so the index records both.",
    codexDocs: "Codex packaging docs →",
    claudeDocs: "Claude Code reference →",
    treeLabel: "Example plugin directory layout",
    codexManifest: "Codex manifest",
    claudeManifest: "Claude Code manifest",
    skillComment: "one directory per skill",
    mcpComment: "MCP server definitions",
    agentsTitle: "Built for agents",
    agentsIntro: "Every surface reads from the same index — humans get this site, agents get structured endpoints.",
    apiBody: "Search, filter, and page through the full index as plain JSON.",
    apiLink: "API reference →",
    mcpBody: "An MCP endpoint agents can call natively to query the registry from inside a session.",
    mcpLink: "MCP endpoint →",
  },
  "zh-CN": {
    compatibility: "兼容 Codex 与 Claude Code",
    title: "一个 Agent 插件注册中心",
    intro: "发现为 Codex、Claude Code 或两者打包的开源技能与 MCP 服务器，数据直接来自 GitHub 上的规范清单。",
    searchPlaceholder: "搜索插件、技能和 MCP 服务器…",
    search: "搜索",
    browse: "浏览全部插件 →",
    agentsLink: "Agent 接入：API 与 MCP →",
    stats: "注册中心统计",
    statPlugins: "已收录插件",
    statSkills: "技能",
    statMcp: "MCP 服务器",
    statCategories: "分类",
    emptyTitle: "索引为空",
    emptyHint: "目前还没有抓取任何内容。运行 npm run db:seed 收录示例注册表，然后刷新此页面。",
    featured: "精选插件",
    browseAll: "浏览全部 →",
    recent: "最近收录",
    noDescription: "清单中没有描述。",
    indexed: "收录于",
    anatomy: "插件的组成",
    anatomyBody: "Codex 与 Claude Code 插件采用相同的自包含结构：运行时元数据、位于",
    anatomyBodyEnd: " 下的技能，以及可选的 MCP 配置。两者的规范清单目录不同，因此索引会同时记录。",
    codexDocs: "Codex 打包文档 →",
    claudeDocs: "Claude Code 参考文档 →",
    treeLabel: "插件目录结构示例",
    codexManifest: "Codex 清单",
    claudeManifest: "Claude Code 清单",
    skillComment: "每个技能一个目录",
    mcpComment: "MCP 服务器定义",
    agentsTitle: "为 Agent 而建",
    agentsIntro: "所有界面读取同一份索引：人类使用网站，Agent 使用结构化接口。",
    apiBody: "以纯 JSON 搜索、筛选并分页读取完整索引。",
    apiLink: "API 参考 →",
    mcpBody: "Agent 可以在会话中原生调用 MCP 端点来查询注册中心。",
    mcpLink: "MCP 端点 →",
  },
} as const;

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} — Agent skills & MCP servers` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

/** One line of the static directory tree. Glyph prefix stays gray; the name carries the component color. */
function TreeLine({
  prefix = "",
  name,
  nameClass = "text-gray-600",
  comment,
}: {
  prefix?: string;
  name: string;
  nameClass?: string;
  comment?: string;
}) {
  return (
    <div className="flex whitespace-pre">
      {prefix ? <span className="text-gray-300">{prefix}</span> : null}
      <span className={nameClass}>{name}</span>
      {comment ? <span className="hidden text-gray-400 sm:inline">{`   # ${comment}`}</span> : null}
    </div>
  );
}

function AnatomyStrip({ locale }: { locale: Locale }) {
  const c = HOME_COPY[locale];
  return (
    <section className="border-y border-gray-200 bg-surface">
      <Container className="grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {c.anatomy}
          </h2>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-gray-600">
            {c.anatomyBody} <code className="font-mono text-[13px]">skills/</code>
            {c.anatomyBodyEnd}
          </p>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
            <a href={CODEX_SPEC_URL} target="_blank" rel="noopener noreferrer" className="text-iris hover:text-iris-deep">
              {c.codexDocs}
            </a>
            <a href={CLAUDE_SPEC_URL} target="_blank" rel="noopener noreferrer" className="text-iris hover:text-iris-deep">
              {c.claudeDocs}
            </a>
          </div>
        </div>
        <Card className="shadow-sm">
          <div
            className="overflow-x-auto p-4 font-mono text-[13px] leading-6 sm:p-5"
            aria-label={c.treeLabel}
          >
            <TreeLine name="my-plugin/" nameClass="font-semibold text-ink" />
            <TreeLine
              prefix="├── "
              name=".codex-plugin/plugin.json"
              nameClass="font-medium text-ink"
              comment={c.codexManifest}
            />
            <TreeLine prefix="├── " name=".claude-plugin/plugin.json" nameClass="font-medium text-ink" comment={c.claudeManifest} />
            <TreeLine prefix="├── " name="skills/" nameClass="text-iris" />
            <TreeLine prefix="│   ├── " name="code-review/" nameClass="text-iris" />
            <TreeLine
              prefix="│   │   └── "
              name="SKILL.md"
              nameClass="text-iris"
              comment={c.skillComment}
            />
            <TreeLine prefix="│   └── " name="changelog/" nameClass="text-iris" />
            <TreeLine prefix="│       └── " name="SKILL.md" nameClass="text-iris" />
            <TreeLine
              prefix="├── "
              name=".mcp.json"
              nameClass="text-teal-700"
              comment={c.mcpComment}
            />
            <TreeLine prefix="└── " name="README.md" />
          </div>
        </Card>
      </Container>
    </section>
  );
}

function AgentsCallout({ locale }: { locale: Locale }) {
  const c = HOME_COPY[locale];
  return (
    <section>
      <Container className="py-16 sm:py-20">
        <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {c.agentsTitle}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">
          {c.agentsIntro}
        </p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <Card className="p-5">
            <p className="font-mono text-sm">
              <span className="text-gray-400">GET</span>{" "}
              <span className="font-medium">/api/v1/plugins</span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              {c.apiBody}
            </p>
            <Link
              href="/docs"
              className="mt-4 inline-block text-sm font-medium text-iris hover:text-iris-deep"
            >
              {c.apiLink}
            </Link>
          </Card>
          <Card className="p-5">
            <p className="font-mono text-sm">
              <span className="text-gray-400">POST</span>{" "}
              <span className="font-medium">/api/mcp</span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              {c.mcpBody}
            </p>
            <Link
              href="/docs#mcp"
              className="mt-4 inline-block text-sm font-medium text-iris hover:text-iris-deep"
            >
              {c.mcpLink}
            </Link>
          </Card>
        </div>
      </Container>
    </section>
  );
}

export default async function HomePage() {
  const [locale, stats, featured, recent] = await Promise.all([
    getLocale(),
    getStats(),
    searchPlugins({ sort: "stars", perPage: 6 }),
    searchPlugins({ sort: "recent", perPage: 5 }),
  ]);
  const c = HOME_COPY[locale];
  const indexIsEmpty = stats.plugins === 0;
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${absoluteUrl("/")}#collection`,
    url: absoluteUrl("/"),
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    inLanguage: locale,
    isPartOf: { "@id": `${absoluteUrl("/")}#website` },
    about: {
      "@type": "DefinedTerm",
      name: "Agent Plugins",
      url: "https://agent-plugins.org/specification",
    },
    mainEntity: {
      "@type": "ItemList",
      name: "Featured Agent Plugins",
      numberOfItems: featured.items.length,
      itemListElement: featured.items.map((plugin, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: plugin.name,
        url: absoluteUrl(`/plugins/${encodeURIComponent(plugin.slug)}`),
      })),
    },
    additionalProperty: [
      { "@type": "PropertyValue", name: "Plugins indexed", value: stats.plugins },
      { "@type": "PropertyValue", name: "Skills", value: stats.skills },
      { "@type": "PropertyValue", name: "MCP servers", value: stats.mcpServers },
      { "@type": "PropertyValue", name: "Categories", value: stats.categories },
    ],
  };

  return (
    <div>
      <JsonLd data={collectionJsonLd} />
      {/* Hero */}
      <section>
        <Container className="pb-14 pt-16 sm:pb-16 sm:pt-24">
          <a
            href={CODEX_SPEC_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 font-mono text-xs text-gray-500 hover:text-iris"
          >
            <span aria-hidden className="inline-block size-1.5 rounded-full bg-iris" />
            {c.compatibility}
          </a>
          <h1 className="mt-4 max-w-2xl font-display text-4xl font-bold tracking-tight sm:text-5xl">
            {c.title}
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-gray-600">
            {c.intro}
          </p>
          <div className="mt-7 max-w-xl">
            <SearchInput action="/plugins" placeholder={c.searchPlaceholder} submitLabel={c.search} />
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
            <Link href="/plugins" className="text-gray-600 hover:text-iris">
              {c.browse}
            </Link>
            <Link href="/docs" className="text-gray-600 hover:text-iris">
              {c.agentsLink}
            </Link>
          </div>
        </Container>
      </section>

      {/* Stats */}
      <section aria-labelledby="stats-heading">
        <Container className="pb-16 sm:pb-20">
          <h2 id="stats-heading" className="sr-only">
            {c.stats}
          </h2>
          <div className="grid grid-cols-2 gap-8 border-t border-gray-200 pt-8 sm:grid-cols-4">
            <StatBlock value={formatNumber(stats.plugins, locale)} label={c.statPlugins} />
            <StatBlock value={formatNumber(stats.skills, locale)} label={c.statSkills} />
            <StatBlock value={formatNumber(stats.mcpServers, locale)} label={c.statMcp} />
            <StatBlock value={formatNumber(stats.categories, locale)} label={c.statCategories} />
          </div>
        </Container>
      </section>

      {indexIsEmpty ? (
        <section>
          <Container className="pb-16 sm:pb-20">
            <EmptyState
              title={c.emptyTitle}
              hint={c.emptyHint}
            />
          </Container>
        </section>
      ) : (
        <>
          {/* Featured */}
          <section aria-labelledby="featured-heading">
            <Container className="pb-16 sm:pb-20">
              <div className="mb-6 flex items-baseline justify-between gap-4">
                <h2
                  id="featured-heading"
                  className="font-display text-2xl font-bold tracking-tight sm:text-3xl"
                >
                  {c.featured}
                </h2>
                <Link
                  href="/plugins"
                  className="shrink-0 text-sm font-medium text-iris hover:text-iris-deep"
                >
                  {c.browseAll}
                </Link>
              </div>
              <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                {featured.items.map((plugin) => (
                  <PluginCard key={plugin.slug} plugin={plugin} locale={locale} />
                ))}
              </div>
            </Container>
          </section>

          {/* Recently indexed */}
          <section aria-labelledby="recent-heading">
            <Container className="pb-16 sm:pb-20">
              <h2
                id="recent-heading"
                className="mb-6 font-display text-2xl font-bold tracking-tight sm:text-3xl"
              >
                {c.recent}
              </h2>
              <Card>
                <ul className="divide-y divide-gray-100">
                  {recent.items.map((plugin) => (
                    <li key={plugin.slug}>
                      <Link
                        href={`/plugins/${plugin.slug}`}
                        className="group flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4"
                      >
                        <span className="shrink-0 font-mono text-sm font-medium group-hover:text-iris">
                          {plugin.name}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-gray-500">
                          {plugin.description ?? c.noDescription}
                        </span>
                        <span
                          className="shrink-0 text-xs text-gray-500"
                          title={plugin.createdAt.toISOString()}
                        >
                          {locale === "zh-CN" ? c.indexed : `${c.indexed} `}{relativeTime(plugin.createdAt, locale)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </Container>
          </section>
        </>
      )}

      <AnatomyStrip locale={locale} />
      <AgentsCallout locale={locale} />
    </div>
  );
}
