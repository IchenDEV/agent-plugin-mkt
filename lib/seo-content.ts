import type { Locale } from "@/lib/i18n";
import type { PluginFilters, PluginSummary } from "@/lib/queries";
import { PROTOCOL_LABELS, type PluginProtocol } from "@/lib/protocols";

type Localized<T> = Record<Locale, T>;

export type IntentLandingKey = "codex" | "claude-code" | "agent-skills" | "mcp-servers";

export interface IntentLandingCopy {
  eyebrow: string;
  title: string;
  description: string;
  guideTitle: string;
  guideBody: string;
  checklistTitle: string;
  checklist: readonly string[];
  collectionTitle: string;
  browseLabel: string;
  sourceLabel: string;
}

export interface IntentLandingDefinition {
  path: `/${string}`;
  filters: PluginFilters;
  sourceUrl: string;
  copy: Localized<IntentLandingCopy>;
}

export const INTENT_LANDINGS: Record<IntentLandingKey, IntentLandingDefinition> = {
  codex: {
    path: "/codex-plugins",
    filters: { protocols: ["codex"] },
    sourceUrl: "https://developers.openai.com/plugins/build/plugins",
    copy: {
      en: {
        eyebrow: "Canonical .codex-plugin manifests",
        title: "Codex plugins",
        description:
          "Browse open-source Codex plugins indexed from public GitHub repositories. Compare included skills, MCP servers, source activity, and manifest details before installing.",
        guideTitle: "What qualifies as a Codex plugin",
        guideBody:
          "Listings on this page contain a canonical .codex-plugin/plugin.json manifest discovered in the source repository. The directory validates the manifest shape and shows the files it declares; it does not treat inclusion as a security endorsement.",
        checklistTitle: "Review before installing",
        checklist: [
          "Confirm the source repository and plugin root.",
          "Read every included skill and MCP configuration.",
          "Check required commands, environment variables, and network access.",
        ],
        collectionTitle: "Popular Codex plugins",
        browseLabel: "Browse every Codex plugin",
        sourceLabel: "Read the Codex plugin documentation",
      },
      "zh-CN": {
        eyebrow: "规范的 .codex-plugin 清单",
        title: "Codex 插件",
        description:
          "浏览从公开 GitHub 仓库索引的开源 Codex 插件。安装前比较插件包含的技能、MCP 服务器、源码活跃度和清单详情。",
        guideTitle: "什么样的项目会列为 Codex 插件",
        guideBody:
          "本页条目都在源码仓库中包含规范的 .codex-plugin/plugin.json。目录会验证清单结构并展示其声明的文件；被收录不代表通过安全审核。",
        checklistTitle: "安装前检查",
        checklist: [
          "确认源码仓库和插件根目录。",
          "阅读插件包含的每个技能和 MCP 配置。",
          "检查需要执行的命令、环境变量和网络权限。",
        ],
        collectionTitle: "热门 Codex 插件",
        browseLabel: "浏览全部 Codex 插件",
        sourceLabel: "阅读 Codex 插件文档",
      },
    },
  },
  "claude-code": {
    path: "/claude-code-plugins",
    filters: { protocols: ["claude-code"] },
    sourceUrl: "https://code.claude.com/docs/en/plugins-reference",
    copy: {
      en: {
        eyebrow: "Canonical .claude-plugin manifests",
        title: "Claude Code plugins",
        description:
          "Find open-source Claude Code plugins with source-backed manifests, skills, and MCP configuration. Review compatibility and repository evidence before adding a marketplace or plugin.",
        guideTitle: "What qualifies as a Claude Code plugin",
        guideBody:
          "Each listing has a .claude-plugin/plugin.json manifest at its indexed plugin root. Some repositories publish many plugins, so this directory keeps each plugin page tied to its exact source path and component files.",
        checklistTitle: "Review before installing",
        checklist: [
          "Verify the marketplace or repository owner.",
          "Inspect hooks, commands, skills, and MCP servers in the source.",
          "Prefer maintained repositories with clear setup and removal steps.",
        ],
        collectionTitle: "Popular Claude Code plugins",
        browseLabel: "Browse every Claude Code plugin",
        sourceLabel: "Read the Claude Code plugin reference",
      },
      "zh-CN": {
        eyebrow: "规范的 .claude-plugin 清单",
        title: "Claude Code 插件",
        description:
          "查找具有源码清单、技能和 MCP 配置的开源 Claude Code 插件。添加 marketplace 或插件前先核对兼容性与仓库证据。",
        guideTitle: "什么样的项目会列为 Claude Code 插件",
        guideBody:
          "每个条目的插件根目录都包含 .claude-plugin/plugin.json。一个仓库可能发布多个插件，因此目录会把每个详情页绑定到准确的源码路径和组件文件。",
        checklistTitle: "安装前检查",
        checklist: [
          "确认 marketplace 或源码仓库的所有者。",
          "检查源码中的 hooks、commands、skills 和 MCP 服务器。",
          "优先选择持续维护且安装、移除说明清楚的仓库。",
        ],
        collectionTitle: "热门 Claude Code 插件",
        browseLabel: "浏览全部 Claude Code 插件",
        sourceLabel: "阅读 Claude Code 插件参考",
      },
    },
  },
  "agent-skills": {
    path: "/agent-skills",
    filters: { type: "skills" },
    sourceUrl: "https://agentskills.io/specification",
    copy: {
      en: {
        eyebrow: "Portable instructions in SKILL.md",
        title: "Agent skills",
        description:
          "Explore reusable agent skills published inside Codex, Claude Code, and Agent Plugins packages. Compare source paths, descriptions, runtimes, and the surrounding plugin before use.",
        guideTitle: "What the directory counts as a skill",
        guideBody:
          "A skill is counted only when the indexer finds a supported SKILL.md layout and valid frontmatter for its runtime. The detail page keeps the skill name, description, and repository-relative path visible so you can inspect the original instructions.",
        checklistTitle: "Evaluate a skill",
        checklist: [
          "Read the full SKILL.md rather than relying on its short description.",
          "Check which tools, files, and external systems it expects to access.",
          "Review the containing plugin because skills can depend on sibling files.",
        ],
        collectionTitle: "Plugins with agent skills",
        browseLabel: "Browse every plugin with skills",
        sourceLabel: "Read the Agent Skills specification",
      },
      "zh-CN": {
        eyebrow: "SKILL.md 中的可复用指令",
        title: "Agent 技能",
        description:
          "浏览发布在 Codex、Claude Code 和 Agent Plugins 包中的可复用技能。使用前比较源码路径、描述、运行时和所属插件。",
        guideTitle: "目录如何识别技能",
        guideBody:
          "只有索引器发现运行时支持的 SKILL.md 结构和有效 frontmatter 时才会计入技能。详情页会保留技能名称、描述和仓库相对路径，便于检查原始指令。",
        checklistTitle: "评估一个技能",
        checklist: [
          "阅读完整 SKILL.md，不要只依赖简短描述。",
          "检查它预期访问的工具、文件和外部系统。",
          "查看所属插件，因为技能可能依赖同目录的其他文件。",
        ],
        collectionTitle: "包含 Agent 技能的插件",
        browseLabel: "浏览全部包含技能的插件",
        sourceLabel: "阅读 Agent Skills 规范",
      },
    },
  },
  "mcp-servers": {
    path: "/mcp-servers",
    filters: { type: "mcp" },
    sourceUrl: "https://modelcontextprotocol.io/specification",
    copy: {
      en: {
        eyebrow: "Declared MCP server configuration",
        title: "MCP servers in agent plugins",
        description:
          "Compare MCP servers bundled or referenced by open-source agent plugins. See transport type, commands, URLs, environment requirements, and the plugin source before connecting.",
        guideTitle: "What this MCP directory covers",
        guideBody:
          "This page covers MCP server entries declared by indexed plugins, not every standalone MCP server on the web. Detail pages show the stored configuration as source data and distinguish stdio, Streamable HTTP, and legacy SSE transports.",
        checklistTitle: "Review before connecting",
        checklist: [
          "Check whether the server runs a local command or connects to a remote URL.",
          "Treat environment variables as potential credential requirements.",
          "Verify tool permissions and the repository's security guidance.",
        ],
        collectionTitle: "Plugins with MCP servers",
        browseLabel: "Browse every plugin with MCP",
        sourceLabel: "Read the Model Context Protocol specification",
      },
      "zh-CN": {
        eyebrow: "插件声明的 MCP 服务器配置",
        title: "Agent 插件中的 MCP 服务器",
        description:
          "比较开源 Agent 插件捆绑或引用的 MCP 服务器。连接前查看传输方式、命令、URL、环境变量要求和插件源码。",
        guideTitle: "这个 MCP 目录包含什么",
        guideBody:
          "本页覆盖索引插件所声明的 MCP 服务器，而不是互联网上所有独立 MCP 服务。详情页会按源码数据展示配置，并区分 stdio、Streamable HTTP 和旧版 SSE。",
        checklistTitle: "连接前检查",
        checklist: [
          "确认服务器是在本地执行命令，还是连接远程 URL。",
          "把环境变量视为潜在的凭据要求。",
          "核对工具权限和源码仓库中的安全说明。",
        ],
        collectionTitle: "包含 MCP 服务器的插件",
        browseLabel: "浏览全部包含 MCP 的插件",
        sourceLabel: "阅读 Model Context Protocol 规范",
      },
    },
  },
};

export function meaningfulDescription(value: string | null | undefined): string | null {
  const description = value?.trim();
  if (!description || !/[\p{L}\p{N}]/u.test(description)) return null;
  return description;
}

export function compactDescription(value: string, maxLength = 220): string {
  if (value.length <= maxLength) return value;
  const candidate = value.slice(0, maxLength - 1);
  const lastSpace = candidate.lastIndexOf(" ");
  const cut = lastSpace >= Math.floor(maxLength * 0.65) ? candidate.slice(0, lastSpace) : candidate;
  return `${cut.trimEnd()}…`;
}

function formatList(items: string[], locale: Locale): string {
  if (items.length === 0) return locale === "zh-CN" ? "Agent Plugin" : "agent plugin";
  return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(items);
}

export function pluginRuntimeLabel(protocols: PluginProtocol[], locale: Locale): string {
  return formatList(protocols.map((protocol) => PROTOCOL_LABELS[protocol]), locale);
}

export function pluginDescription(plugin: PluginSummary, locale: Locale): string {
  const source = meaningfulDescription(plugin.description);
  if (source) return source;

  const runtime = pluginRuntimeLabel(plugin.protocols, locale);
  const components: string[] = [];
  if (plugin.skillCount > 0) {
    components.push(locale === "zh-CN" ? `${plugin.skillCount} 个技能` : `${plugin.skillCount} skill${plugin.skillCount === 1 ? "" : "s"}`);
  }
  if (plugin.mcpCount > 0) {
    components.push(locale === "zh-CN" ? `${plugin.mcpCount} 个 MCP 服务器` : `${plugin.mcpCount} MCP server${plugin.mcpCount === 1 ? "" : "s"}`);
  }
  const componentText = components.length > 0 ? formatList(components, locale) : null;

  return locale === "zh-CN"
    ? `${plugin.name} 是从公开 GitHub 仓库索引的 ${runtime} 插件${componentText ? `，包含${componentText}` : ""}。安装前请检查其清单和源码。`
    : `${plugin.name} is an open-source ${runtime} plugin indexed from GitHub${componentText ? ` with ${componentText}` : ""}. Review its manifest and source before installing.`;
}

function installableProtocols(plugin: PluginSummary): PluginProtocol[] {
  return plugin.protocols.filter(
    (protocol) => protocol === "codex" || protocol === "claude-code",
  );
}

export function pluginPageTitle(plugin: PluginSummary, locale: Locale): string {
  const runtime = pluginRuntimeLabel(plugin.protocols.slice(0, 2), locale);
  const installable = installableProtocols(plugin).length > 0;
  if (locale === "zh-CN") {
    return installable
      ? `${plugin.name} ${runtime} 插件 — 安装`
      : `${plugin.name} — ${runtime} 插件`;
  }
  return installable
    ? `${plugin.name} ${runtime} plugin — install`
    : `${plugin.name} — ${runtime} plugin`;
}

export function pluginMetaDescription(plugin: PluginSummary, locale: Locale): string {
  const protocols = installableProtocols(plugin);
  const description = pluginDescription(plugin, locale);
  if (protocols.length === 0) return compactDescription(description);

  const runtime = pluginRuntimeLabel(protocols, locale);
  const prefix = locale === "zh-CN"
    ? `从已索引的源码为 ${runtime} 安装 ${plugin.name}。`
    : `Install ${plugin.name} for ${runtime} from its indexed source. `;
  const separator = locale === "zh-CN" && /^[\u0000-\u007f]/.test(description)
    ? " "
    : "";
  return compactDescription(`${prefix}${separator}${description}`);
}

export function pluginInstallHeading(plugin: PluginSummary, locale: Locale): string {
  const runtime = pluginRuntimeLabel(installableProtocols(plugin), locale);
  return locale === "zh-CN"
    ? `为 ${runtime} 安装 ${plugin.name}`
    : `Install ${plugin.name} for ${runtime}`;
}

export function intentBrowseHref(definition: IntentLandingDefinition): string {
  const params = new URLSearchParams();
  if (definition.filters.type) params.set("type", definition.filters.type);
  for (const protocol of definition.filters.protocols ?? []) params.append("protocol", protocol);
  return `/plugins?${params.toString()}`;
}

export function intentCanonicalForFilters(filters: PluginFilters): string | null {
  const hasExtraFilters = Boolean(
    filters.q ||
      filters.category ||
      filters.transport ||
      (filters.sort && filters.sort !== "stars") ||
      (filters.page && filters.page > 1),
  );
  if (hasExtraFilters) return null;
  if (filters.type === "skills" && !filters.protocols?.length) return INTENT_LANDINGS["agent-skills"].path;
  if (filters.type === "mcp" && !filters.protocols?.length) return INTENT_LANDINGS["mcp-servers"].path;
  if (!filters.type && filters.protocols?.length === 1) {
    const protocol = filters.protocols[0];
    if (protocol === "codex") return INTENT_LANDINGS.codex.path;
    if (protocol === "claude-code") return INTENT_LANDINGS["claude-code"].path;
  }
  return null;
}
