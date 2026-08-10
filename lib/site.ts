export const SITE_NAME = "Agent Plugins Marketplace";
export const SITE_DESCRIPTION =
  "Find open-source plugins for Codex, Claude Code, and Agent Plugins. Compare included skills and MCP servers, review setup details, and visit the source before installing.";
export const SITE_DESCRIPTION_ZH =
  "查找适用于 Codex、Claude Code 和 Agent Plugins 的开源插件。比较插件包含的技能与 MCP 服务器，查看安装说明，并在安装前访问源码仓库。";

const DEFAULT_SITE_URL = "https://pluginsmp.com";

function resolveSiteUrl(): URL {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim() || DEFAULT_SITE_URL;

  try {
    const url = new URL(configured);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return new URL(DEFAULT_SITE_URL);
  }
}

export const SITE_URL = resolveSiteUrl();

export function absoluteUrl(path = "/"): string {
  return new URL(path, SITE_URL).toString();
}
