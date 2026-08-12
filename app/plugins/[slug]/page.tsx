import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, Suspense, cache, type ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { JsonLd } from "@/components/json-ld";
import { PluginCard } from "@/components/plugin-card";
import { Badge, Card, Container, transportBadgeVariant, transportLabel } from "@/components/ui";
import { formatDate, formatNumber, relativeTime, stripControlChars } from "@/lib/format";
import { getPluginBySlug, searchPlugins, type PluginDetail } from "@/lib/queries";
import { PROTOCOL_LABELS } from "@/lib/protocols";
import {
  compactDescription,
  pluginDescription,
  pluginPageTitle,
  pluginRuntimeLabel,
} from "@/lib/seo-content";
import { SITE_NAME, absoluteUrl } from "@/lib/site";
import type { Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

// Dedupes the query between generateMetadata and the page render.
const getPlugin = cache(getPluginBySlug);

type PluginPageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PluginPageProps): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, getLocale()]);
  const zh = locale === "zh-CN";
  const plugin = await getPlugin(slug);
  if (!plugin) return { title: zh ? "未找到插件" : "Plugin not found", robots: { index: false, follow: false } };
  const description = compactDescription(pluginDescription(plugin, locale));
  const title = pluginPageTitle(plugin, locale);
  const canonical = absoluteUrl(`/plugins/${encodeURIComponent(plugin.slug)}`);
  return {
    title,
    description,
    keywords: plugin.keywords,
    authors: plugin.authorName ? [{ name: plugin.authorName }] : undefined,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

function pluginJsonLd(plugin: PluginDetail, locale: Locale): Record<string, unknown> {
  const zh = locale === "zh-CN";
  const canonical = absoluteUrl(`/plugins/${encodeURIComponent(plugin.slug)}`);
  const description = pluginDescription(plugin, locale);
  const parts: Record<string, unknown>[] = [
    ...plugin.skills.map((skill) => ({
      "@type": "CreativeWork",
      name: skill.name,
      description: skill.description ?? undefined,
      learningResourceType: "Skill",
    })),
    ...plugin.mcpServers.map((server) => ({
      "@type": "SoftwareApplication",
      name: `${server.serverId} MCP server`,
      applicationCategory: "DeveloperApplication",
      applicationSubCategory: "Model Context Protocol server",
    })),
  ];
  const source: Record<string, unknown> = {
    "@type": "SoftwareSourceCode",
    "@id": `${canonical}#plugin`,
    name: plugin.name,
    description,
    url: canonical,
    codeRepository: plugin.repoUrl,
    mainEntityOfPage: { "@id": `${canonical}#webpage` },
    runtimePlatform: plugin.protocols.map((protocol) => PROTOCOL_LABELS[protocol]).join(", "),
    isAccessibleForFree: true,
    dateModified: (plugin.repoPushedAt ?? plugin.indexedAt).toISOString(),
  };

  if (plugin.authorName) source.author = plugin.authorName;
  if (plugin.version) source.version = plugin.version;
  if (plugin.license) source.license = plugin.license;
  if (plugin.keywords.length > 0) source.keywords = plugin.keywords.join(", ");
  if (plugin.homepage?.startsWith("https://") || plugin.homepage?.startsWith("http://")) {
    source.sameAs = plugin.homepage;
  }
  if (parts.length > 0) source.hasPart = parts;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: `${plugin.name} ${zh ? "插件" : "plugin"}`,
        description,
        inLanguage: locale,
        isPartOf: { "@id": `${absoluteUrl("/")}#website` },
        breadcrumb: { "@id": `${canonical}#breadcrumb` },
        mainEntity: { "@id": `${canonical}#plugin` },
      },
      source,
      {
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: zh ? "首页" : "Home", item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: zh ? "插件" : "Plugins", item: absoluteUrl("/plugins") },
          { "@type": "ListItem", position: 3, name: plugin.name, item: canonical },
        ],
      },
    ],
  };
}

function StarIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 fill-current">
      <path d="M8 1.5l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.3l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.5z" />
    </svg>
  );
}

function SectionHeading({ title, count }: { title: string; count?: number }) {
  return (
    <h2 className="font-display text-lg font-semibold tracking-tight">
      {title}
      {count !== undefined ? (
        <span className="ml-2 text-sm font-medium text-gray-400">{count}</span>
      ) : null}
    </h2>
  );
}

function SourceCard({ plugin, locale }: { plugin: PluginDetail; locale: Locale }) {
  const zh = locale === "zh-CN";
  // Defense-in-depth: this string reaches the user's clipboard and terminal.
  const safePath = stripControlChars(plugin.pluginPath);
  const command = `git clone ${stripControlChars(plugin.repoUrl)}`;
  return (
    <Card>
      <div className="flex items-center gap-3 px-4 py-3">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[13px] text-gray-800">
          <span aria-hidden className="select-none text-gray-400">
            {"$ "}
          </span>
          git clone {plugin.repoUrl}
        </code>
        <CopyButton
          text={command}
          label={zh ? "复制命令" : "Copy command"}
          copiedLabel={zh ? "已复制" : "Copied"}
          errorLabel={zh ? "复制失败" : "Copy failed"}
        />
      </div>
      <p className="border-t border-gray-100 px-4 py-2.5 text-xs leading-relaxed text-gray-500">
        {zh
          ? `克隆源码仓库后，请按照仓库中的设置说明，将插件添加到兼容的客户端。${safePath ? `插件根目录位于 ${safePath}/。` : "仓库根目录就是插件根目录。"}`
          : `Clone the source repository, then follow its setup instructions to add the plugin to a compatible client.${safePath ? ` The plugin root is ${safePath}/.` : " The repository root is the plugin root."}`}
      </p>
    </Card>
  );
}

/** The signature element: the plugin’s real directory layout, from indexed data. */
function DirectoryTree({ plugin }: { plugin: PluginDetail }) {
  const entries: ("manifest" | "skills" | "mcp")[] = ["manifest"];
  if (plugin.skills.length > 0) entries.push("skills");
  if (plugin.mcpCount > 0) entries.push("mcp");

  const rows: ReactNode[] = [];
  entries.forEach((entry, i) => {
    const last = i === entries.length - 1;
    const connector = last ? "└── " : "├── ";
    if (entry === "manifest") {
      const paths = plugin.protocols
        .map((protocol) => plugin.manifests[protocol]?.path)
        .filter((path): path is string => typeof path === "string")
        .map((path) => (plugin.pluginPath && path.startsWith(`${plugin.pluginPath}/`) ? path.slice(plugin.pluginPath.length + 1) : path));
      paths.forEach((path, pathIndex) => {
        rows.push(
          <div key={path}>
            {pathIndex === paths.length - 1 && entries.length === 1 ? "└── " : "├── "}
            {path}
          </div>,
        );
      });
    } else if (entry === "skills") {
      plugin.skills.forEach((skill, j) => {
        const skillLast = j === plugin.skills.length - 1;
        rows.push(
          <div key={skill.path}>
            {skillLast && last ? "└── " : "├── "}
            <span className="text-iris">{skill.path}</span>
          </div>
        );
      });
    } else {
      rows.push(
        <div key="mcp.json">
          {connector}
          <span className="text-teal-700">
            {plugin.protocols.some((protocol) => protocol !== "agent-plugins") ? ".mcp.json" : "mcp.json"}
          </span>
        </div>
      );
    }
  });

  const root = plugin.pluginPath ? `${plugin.pluginPath}/` : `${plugin.name}/`;

  return (
    <Card tab={root}>
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[13px] leading-6 text-gray-600">{rows}</pre>
    </Card>
  );
}

function McpServerCard({ server }: { server: PluginDetail["mcpServers"][number] }) {
  const { config } = server;
  const rows: { key: string; value: string }[] = [];
  if (typeof config.command === "string") rows.push({ key: "command", value: config.command });
  if (Array.isArray(config.args)) {
    const args = config.args.filter((a): a is string => typeof a === "string");
    if (args.length > 0) rows.push({ key: "args", value: args.join(" ") });
  }
  if (typeof config.url === "string") rows.push({ key: "url", value: config.url });
  if (typeof config.cwd === "string") rows.push({ key: "cwd", value: config.cwd });
  const env = config.env;
  if (env && typeof env === "object" && !Array.isArray(env)) {
    for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
      if (typeof value === "string") rows.push({ key: `env.${key}`, value });
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2.5">
        <span className="font-mono text-sm font-medium">{server.serverId}</span>
        <Badge mono variant={transportBadgeVariant(server.transport)}>
          {transportLabel(server.transport)}
        </Badge>
      </div>
      {rows.length > 0 ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 px-4 py-3.5 font-mono text-[13px]">
          {rows.map((row) => (
            <Fragment key={row.key}>
              <dt className="text-gray-400">{row.key}</dt>
              <dd className="whitespace-pre-wrap break-all text-gray-700">{row.value}</dd>
            </Fragment>
          ))}
        </dl>
      ) : null}
    </Card>
  );
}

function ManifestCard({ manifest, path, locale }: { manifest: string; path: string; locale: Locale }) {
  let pretty = manifest;
  try {
    pretty = JSON.stringify(JSON.parse(manifest), null, 2);
  } catch {
    // Not valid JSON as stored; show the raw text.
  }
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5">
        <span className="font-mono text-xs text-gray-500">{path}</span>
        <CopyButton
          text={pretty}
          label={locale === "zh-CN" ? "复制 JSON" : "Copy JSON"}
          copiedLabel={locale === "zh-CN" ? "已复制" : "Copied"}
          errorLabel={locale === "zh-CN" ? "复制失败" : "Copy failed"}
        />
      </div>
      <pre className="max-h-[480px] overflow-x-auto overflow-y-auto px-4 py-3.5 font-mono text-xs leading-relaxed text-gray-700">{pretty}</pre>
    </Card>
  );
}

function shortUrl(url: string): string {
  const short = url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return short.length > 48 ? `${short.slice(0, 47)}…` : short;
}

/** Renders a link only for http(s) URLs; anything else stays plain text. */
function ExternalLink({ url }: { url: string }) {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return <span className="break-all">{url}</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="break-all text-iris hover:underline"
    >
      {shortUrl(url)}
    </a>
  );
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[11px] uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="mt-1 break-words text-sm text-gray-700">{children}</dd>
    </div>
  );
}

function MetaSidebar({ plugin, locale }: { plugin: PluginDetail; locale: Locale }) {
  const zh = locale === "zh-CN";
  const keywords = [...new Set(plugin.keywords)];
  return (
    <Card className="p-4">
      <h2 className="sr-only">{zh ? "插件详情" : "Plugin details"}</h2>
      <dl className="space-y-4">
        <MetaRow label={zh ? "源码仓库" : "Source repository"}>
          <ExternalLink url={plugin.repoUrl} />
        </MetaRow>
        {plugin.homepage ? (
          <MetaRow label={zh ? "插件网站" : "Plugin website"}>
            <ExternalLink url={plugin.homepage} />
          </MetaRow>
        ) : null}
        {plugin.license ? <MetaRow label={zh ? "许可证" : "License"}>{plugin.license}</MetaRow> : null}
        {plugin.version ? (
          <MetaRow label={zh ? "版本" : "Version"}>
            <span className="font-mono">{plugin.version}</span>
          </MetaRow>
        ) : null}
        <MetaRow label={zh ? "插件格式" : "Plugin formats"}>
          <span className="flex flex-wrap gap-1.5">
            {plugin.protocols.map((protocol) => (
              <Badge key={protocol} variant="neutral">
                {PROTOCOL_LABELS[protocol]}
              </Badge>
            ))}
          </span>
        </MetaRow>
        {keywords.length > 0 ? (
          <MetaRow label={zh ? "标签" : "Tags"}>
            <span className="flex flex-wrap gap-1.5">
              {keywords.map((kw) => (
                <Link
                  key={kw}
                  href={`/plugins?category=${encodeURIComponent(kw)}`}
                  className="rounded-full bg-gray-100 px-2.5 py-0.5 font-mono text-xs text-gray-600 hover:bg-iris-soft hover:text-iris-deep"
                >
                  {kw}
                </Link>
              ))}
            </span>
          </MetaRow>
        ) : null}
        <MetaRow label={zh ? "添加到目录" : "Added to directory"}>{relativeTime(plugin.createdAt, locale)}</MetaRow>
      </dl>
    </Card>
  );
}

function DirectoryEvidence({ plugin, locale }: { plugin: PluginDetail; locale: Locale }) {
  const zh = locale === "zh-CN";
  const componentCount = plugin.skillCount + plugin.mcpCount;
  return (
    <Card className="mt-6 p-4 sm:p-5">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        {zh ? "目录证据" : "Directory evidence"}
      </h2>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-wider text-gray-400">{zh ? "运行时" : "Runtimes"}</dt>
          <dd className="mt-1 text-gray-700">{pluginRuntimeLabel(plugin.protocols, locale)}</dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-wider text-gray-400">{zh ? "已解析组件" : "Parsed components"}</dt>
          <dd className="mt-1 text-gray-700">{componentCount} {zh ? "个技能或 MCP 条目" : `skill or MCP entr${componentCount === 1 ? "y" : "ies"}`}</dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-wider text-gray-400">{zh ? "源码更新" : "Source updated"}</dt>
          <dd className="mt-1 text-gray-700">{formatDate(plugin.repoPushedAt, locale)}</dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-wider text-gray-400">{zh ? "清单状态" : "Manifest status"}</dt>
          <dd className="mt-1 text-gray-700">{zh ? "规范路径已解析" : "Canonical path parsed"}</dd>
        </div>
      </dl>
      <p className="mt-4 border-t border-gray-100 pt-3 text-xs leading-relaxed text-gray-500">
        {zh ? "目录验证清单格式和源码位置，不执行插件，也不代表安全审核。" : "The directory validates manifest shape and source location. It does not execute the plugin or provide a security endorsement."}{" "}
        <Link href="/insights#methodology" className="font-medium text-iris hover:text-iris-deep">
          {zh ? "查看索引方法" : "Review the indexing methodology"} →
        </Link>
      </p>
    </Card>
  );
}

async function RelatedPlugins({ plugin, locale }: { plugin: PluginDetail; locale: Locale }) {
  const primaryCategory = plugin.keywords.find((keyword) => keyword.trim().length > 0);
  const results = await searchPlugins({
    category: primaryCategory,
    protocols: primaryCategory ? undefined : plugin.protocols.slice(0, 1),
    sort: "stars",
    perPage: 4,
  });
  const related = results.items.filter((candidate) => candidate.slug !== plugin.slug).slice(0, 3);
  if (related.length === 0) return null;
  const zh = locale === "zh-CN";
  return (
    <section className="mt-14" aria-labelledby="related-plugins-heading">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="related-plugins-heading" className="font-display text-2xl font-bold tracking-tight">
          {zh ? "相关插件" : "Related plugins"}
        </h2>
        {primaryCategory ? (
          <Link
            href={`/plugins?category=${encodeURIComponent(primaryCategory)}`}
            className="text-sm font-medium text-iris hover:text-iris-deep"
          >
            {zh ? `查看“${primaryCategory}”标签` : `Browse the “${primaryCategory}” tag`} →
          </Link>
        ) : null}
      </div>
      <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {related.map((candidate) => (
          <PluginCard key={candidate.slug} plugin={candidate} locale={locale} />
        ))}
      </div>
    </section>
  );
}

function RelatedPluginsFallback({ locale }: { locale: Locale }) {
  return (
    <section className="mt-14" aria-label={locale === "zh-CN" ? "加载相关插件" : "Loading related plugins"}>
      <div className="h-7 w-40 animate-pulse rounded bg-gray-100" />
      <div className="mt-6 grid gap-5 sm:grid-cols-3">
        {[0, 1, 2].map((item) => <div key={item} className="h-40 animate-pulse rounded-lg border border-gray-200 bg-surface" />)}
      </div>
    </section>
  );
}

function MaintainerLink({ plugin, locale }: { plugin: PluginDetail; locale: Locale }) {
  const zh = locale === "zh-CN";
  const label = stripControlChars(plugin.name).replace(/[\[\]]/g, "");
  const url = absoluteUrl(`/plugins/${encodeURIComponent(plugin.slug)}`);
  const markdown = `[${label} on Agent Plugins Marketplace](${url})`;
  return (
    <section className="mt-14" aria-labelledby="maintainer-link-heading">
      <h2 id="maintainer-link-heading" className="font-display text-xl font-bold tracking-tight">
        {zh ? "维护者链接" : "For maintainers"}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">
        {zh ? "如果你维护这个插件，可以在 README 中链接到这份源码索引页面，方便使用者核对清单和组件。" : "If you maintain this plugin, link to this source-backed listing from your README so users can review its manifest and indexed components."}
      </p>
      <Card className="mt-4">
        <div className="flex items-start gap-3 p-4">
          <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-gray-700">{markdown}</code>
          <CopyButton text={markdown} label={zh ? "复制 Markdown" : "Copy Markdown"} copiedLabel={zh ? "已复制" : "Copied"} errorLabel={zh ? "复制失败" : "Copy failed"} />
        </div>
      </Card>
    </section>
  );
}

export default async function PluginPage({ params }: PluginPageProps) {
  const [{ slug }, locale] = await Promise.all([params, getLocale()]);
  const zh = locale === "zh-CN";
  const plugin = await getPlugin(slug);
  if (!plugin) notFound();
  const description = pluginDescription(plugin, locale);

  // Portable plugin runtimes expose one of these plugin-root placeholders.
  const hasPlaceholders = plugin.mcpServers.some(({ config }) => {
    const fields: unknown[] = [config.cwd];
    if (Array.isArray(config.args)) fields.push(...config.args);
    if (config.env && typeof config.env === "object" && !Array.isArray(config.env)) {
      fields.push(...Object.values(config.env));
    }
    return fields.some(
      (value) =>
        typeof value === "string" &&
        (value.includes("${PLUGIN_") || value.includes("${CLAUDE_PLUGIN_")),
    );
  });

  const meta: { key: string; node: ReactNode }[] = [];
  if (plugin.authorName) meta.push({ key: "author", node: <>{zh ? "作者" : "By"} {plugin.authorName}</> });
  if (plugin.license) meta.push({ key: "license", node: <>{zh ? "许可证" : "License"}: {plugin.license}</> });
  meta.push({
    key: "stars",
    node: (
      <span className="inline-flex items-center gap-1 text-amber-700">
        <StarIcon />
        {formatNumber(plugin.repoStars, locale)} {zh ? "GitHub Stars" : "GitHub stars"}
      </span>
    ),
  });
  if (plugin.repoPushedAt)
    meta.push({ key: "updated", node: <>{zh ? "更新于" : "Updated"} {relativeTime(plugin.repoPushedAt, locale)}</> });

  return (
    <Container className="py-10">
      <JsonLd data={pluginJsonLd(plugin, locale)} />
      <Link href="/plugins" className="text-sm font-medium text-gray-500 hover:text-iris">
        ← {zh ? "全部插件" : "All plugins"}
      </Link>

      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="break-all font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
            {plugin.name}
          </h1>
          {plugin.version ? (
            <Badge mono variant="neutral">
              v{plugin.version}
            </Badge>
          ) : null}
        </div>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-gray-600">
          {description}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {plugin.protocols.map((protocol) => (
            <Badge key={protocol} variant="neutral">
              {PROTOCOL_LABELS[protocol]}
            </Badge>
          ))}
          {plugin.skillCount > 0 ? (
            <Badge variant="skill">
              {zh ? `${plugin.skillCount} 个技能` : `${plugin.skillCount} Skill${plugin.skillCount === 1 ? "" : "s"}`}
            </Badge>
          ) : null}
          {plugin.mcpCount > 0 ? (
            <Badge variant="mcp">
              {zh ? `${plugin.mcpCount} 个 MCP 服务器` : `${plugin.mcpCount} MCP server${plugin.mcpCount === 1 ? "" : "s"}`}
            </Badge>
          ) : null}
          {plugin.transports.map((t) => (
            <Badge key={t} mono variant={transportBadgeVariant(t)}>
              {transportLabel(t)}
            </Badge>
          ))}
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-gray-500">
          {meta.map((item, i) => (
            <Fragment key={item.key}>
              {i > 0 ? (
                <span aria-hidden className="text-gray-300">
                  ·
                </span>
              ) : null}
              <span>{item.node}</span>
            </Fragment>
          ))}
        </p>
      </header>

      <DirectoryEvidence plugin={plugin} locale={locale} />

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-10">
          <section>
            <SectionHeading title={zh ? "获取插件" : "Get the plugin"} />
            <div className="mt-3">
              <SourceCard plugin={plugin} locale={locale} />
            </div>
          </section>

          <section>
            <SectionHeading title={zh ? "插件文件" : "Plugin files"} />
            <div className="mt-3">
              <DirectoryTree plugin={plugin} />
            </div>
          </section>

          {plugin.skills.length > 0 ? (
            <section>
              <SectionHeading title={zh ? "包含的技能" : "Included Skills"} count={plugin.skills.length} />
              <Card className="mt-3 divide-y divide-gray-100">
                {plugin.skills.map((skill) => (
                  <div key={skill.dirName} className="px-4 py-3.5">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                      <span className="text-sm font-semibold">{skill.name}</span>
                      <span className="font-mono text-xs text-gray-400">
                        {skill.path}
                      </span>
                    </div>
                    {skill.description ? (
                      <p className="mt-1 text-sm leading-relaxed text-gray-600">
                        {skill.description}
                      </p>
                    ) : null}
                  </div>
                ))}
              </Card>
            </section>
          ) : null}

          {plugin.mcpServers.length > 0 ? (
            <section>
              <SectionHeading title={zh ? "MCP 服务器" : "MCP servers"} count={plugin.mcpServers.length} />
              <div className="mt-3 space-y-4">
                {plugin.mcpServers.map((server) => (
                  <McpServerCard key={server.serverId} server={server} />
                ))}
                {hasPlaceholders ? (
                  <p className="text-xs leading-relaxed text-gray-500">
                    {zh ? "MCP 配置使用由运行时提供的插件路径占位符，例如 " : "MCP configuration uses runtime-provided plugin path placeholders such as "}
                    <code className="font-mono">{"${PLUGIN_ROOT}"}</code> {zh ? "或" : "or"}{" "}
                    <code className="font-mono">{"${CLAUDE_PLUGIN_ROOT}"}</code>
                    {zh ? "。请查看清单了解相应运行时的展开规则。" : ". Review the manifest for the runtime-specific expansion rules."}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          <section>
            <SectionHeading title={zh ? "插件清单" : "Plugin manifests"} count={plugin.protocols.length} />
            <div className="mt-3 space-y-4">
              {plugin.protocols.map((protocol) => {
                const entry = plugin.manifests[protocol];
                if (!entry) return null;
                return <ManifestCard key={protocol} manifest={entry.raw} path={entry.path} locale={locale} />;
              })}
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-20">
          <MetaSidebar plugin={plugin} locale={locale} />
        </aside>
      </div>

      <Suspense fallback={<RelatedPluginsFallback locale={locale} />}>
        <RelatedPlugins plugin={plugin} locale={locale} />
      </Suspense>
      <MaintainerLink plugin={plugin} locale={locale} />
    </Container>
  );
}
