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
    compatibility: "Supports Codex, Claude Code, and Agent Plugins",
    title: "Find plugins for your AI tools",
    intro: "Search open-source plugins from public GitHub repositories. See which plugin formats they support, the skills and MCP servers they include, and their source before installing.",
    searchPlaceholder: "Search by name, task, or tag",
    search: "Search",
    browse: "Find plugins →",
    agentsLink: "Use the developer API →",
    stats: "Directory totals",
    statPlugins: "Plugins",
    statSkills: "Skills",
    statMcp: "MCP servers",
    statCategories: "Tags",
    emptyTitle: "No plugins are available yet",
    emptyHint: "The directory is being prepared. Check back soon.",
    featured: "Popular on GitHub",
    browseAll: "View all plugins →",
    recent: "Recently added",
    noDescription: "Description not provided.",
    added: "Added",
    anatomy: "Know what’s inside a plugin",
    anatomyBody: "A plugin is a folder that contains a manifest for one or more supported formats, skills under",
    anatomyBodyEnd: ", and optional MCP configuration. Review these files and the repository instructions before installing.",
    codexDocs: "Codex plugin documentation →",
    claudeDocs: "Claude Code plugin documentation →",
    treeLabel: "Example plugin directory layout",
    codexManifest: "Codex plugin manifest",
    claudeManifest: "Claude Code plugin manifest",
    skillComment: "instructions for one skill",
    mcpComment: "MCP server configuration",
    agentsTitle: "Search from your own tools",
    agentsIntro: "Use the REST API in an app or script, or connect an MCP client so an agent can find plugins without leaving its current task.",
    apiBody: "Find plugins, apply filters, and receive paginated JSON results.",
    apiLink: "REST API documentation →",
    mcpBody: "Let an MCP-compatible client search the directory with built-in tools.",
    mcpLink: "MCP setup →",
  },
  "zh-CN": {
    compatibility: "支持 Codex、Claude Code 和 Agent Plugins",
    title: "查找适合你的 AI 工具的插件",
    intro: "搜索公开 GitHub 仓库中的开源插件。安装前可查看插件支持的格式、包含的技能与 MCP 服务器，以及源码仓库。",
    searchPlaceholder: "按名称、用途或标签搜索",
    search: "搜索",
    browse: "查找插件 →",
    agentsLink: "使用开发者 API →",
    stats: "目录统计",
    statPlugins: "插件",
    statSkills: "技能",
    statMcp: "MCP 服务器",
    statCategories: "标签",
    emptyTitle: "暂时没有可用插件",
    emptyHint: "插件目录正在准备中，请稍后再来查看。",
    featured: "GitHub 热门插件",
    browseAll: "查看全部插件 →",
    recent: "最近新增",
    noDescription: "暂未提供描述。",
    added: "添加于",
    anatomy: "了解插件包含什么",
    anatomyBody: "插件是一个文件夹，其中包含一种或多种受支持格式的清单、位于",
    anatomyBodyEnd: " 下的技能，以及可选的 MCP 配置。安装前请查看这些文件和仓库中的说明。",
    codexDocs: "Codex 插件文档 →",
    claudeDocs: "Claude Code 插件文档 →",
    treeLabel: "插件目录结构示例",
    codexManifest: "Codex 插件清单",
    claudeManifest: "Claude Code 插件清单",
    skillComment: "一个技能的说明文件",
    mcpComment: "MCP 服务器配置",
    agentsTitle: "在你的工具中搜索",
    agentsIntro: "应用或脚本可以调用 REST API；MCP 客户端也可以让 Agent 在当前任务中直接查找插件。",
    apiBody: "查找插件、应用筛选条件，并获取分页 JSON 结果。",
    apiLink: "REST API 文档 →",
    mcpBody: "让兼容 MCP 的客户端通过内置工具搜索插件目录。",
    mcpLink: "MCP 设置 →",
  },
} as const;

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} — Plugins, skills, and MCP servers` },
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
      { "@type": "PropertyValue", name: "Plugins", value: stats.plugins },
      { "@type": "PropertyValue", name: "Skills", value: stats.skills },
      { "@type": "PropertyValue", name: "MCP servers", value: stats.mcpServers },
      { "@type": "PropertyValue", name: "Tags", value: stats.categories },
    ],
  };

  return (
    <div>
      <JsonLd data={collectionJsonLd} />
      {/* Hero */}
      <section>
        <Container className="pb-14 pt-16 sm:pb-16 sm:pt-24">
          <p className="inline-flex items-center gap-2 font-mono text-xs text-gray-500">
            <span aria-hidden className="inline-block size-1.5 rounded-full bg-iris" />
            {c.compatibility}
          </p>
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

          {/* Recently added */}
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
                          {locale === "zh-CN" ? c.added : `${c.added} `}{relativeTime(plugin.createdAt, locale)}
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
