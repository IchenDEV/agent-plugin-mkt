export const SITE_NAME = "plugins marketplace";
export const SITE_DESCRIPTION =
  "Discover and compare open-source Agent Plugins, skills, and MCP servers indexed from GitHub, with manifests, install details, APIs, and MCP metadata.";
export const SITE_DESCRIPTION_ZH =
  "发现并比较从 GitHub 收录的开源 Agent 插件、技能和 MCP 服务器，包括清单、安装说明、API 与 MCP 元数据。";

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
