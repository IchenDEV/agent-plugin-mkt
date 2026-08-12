import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/json-ld";
import { Preferences } from "@/components/preferences";
import type { Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { SITE_DESCRIPTION, SITE_DESCRIPTION_ZH, SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/site";
// Self-hosted variable fonts (no network dependency at build or runtime).
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: {
    default: `${SITE_NAME} — Plugins, skills, and MCP servers`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "Agent Plugins",
    "agent skills",
    "MCP servers",
    "Model Context Protocol",
    "AI agents",
    "open-source plugins",
  ],
  category: "technology",
  referrer: "origin-when-cross-origin",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Plugins, skills, and MCP servers`,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Plugins, skills, and MCP servers`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

const THEME_INIT_SCRIPT = `try{const r=document.documentElement,s=localStorage.getItem("pluginsmp-theme"),t=s==="light"||s==="dark"?s:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";r.dataset.theme=t;r.style.colorScheme=t}catch{}`;

function websiteJsonLd(locale: Locale) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${absoluteUrl("/")}#website`,
    url: absoluteUrl("/"),
    name: SITE_NAME,
    description: locale === "zh-CN" ? SITE_DESCRIPTION_ZH : SITE_DESCRIPTION,
    inLanguage: locale,
    isAccessibleForFree: true,
    sameAs: "https://github.com/IchenDEV/agent-plugin-mkt",
    about: {
      "@type": "DefinedTerm",
      name: "Agent Plugins",
      url: "https://agent-plugins.org/specification",
    },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${absoluteUrl("/plugins")}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

function Header({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN";
  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-porcelain/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 font-display text-[15px] tracking-tight">
          <span aria-hidden className="grid size-7 place-items-center rounded-md bg-action font-mono text-[13px] font-semibold text-on-action">
            /
          </span>
          <span aria-hidden className="hidden sm:inline">
            Agent Plugins <span className="font-bold text-iris">Marketplace</span>
          </span>
          <span className="sr-only">Agent Plugins Marketplace</span>
        </Link>
        <div className="flex min-w-0 items-center">
        <nav aria-label={zh ? "主导航" : "Main"} className="flex items-center gap-0.5 text-sm font-medium text-gray-600 sm:gap-1">
          <Link href="/plugins" className="whitespace-nowrap rounded-md px-2 py-1.5 hover:bg-surface hover:text-ink sm:px-3">
            {zh ? "插件" : "Plugins"}
          </Link>
          <Link href="/categories" className="hidden rounded-md px-3 py-1.5 hover:bg-surface hover:text-ink sm:block">
            {zh ? "标签" : "Tags"}
          </Link>
          <Link href="/timeline" className="hidden rounded-md px-3 py-1.5 hover:bg-surface hover:text-ink sm:block">
            {zh ? "新增" : "New"}
          </Link>
          <Link href="/insights" className="hidden rounded-md px-3 py-1.5 hover:bg-surface hover:text-ink md:block">
            {zh ? "数据" : "Data"}
          </Link>
          <Link href="/docs" className="whitespace-nowrap rounded-md px-2 py-1.5 hover:bg-surface hover:text-ink sm:px-3">
            API
          </Link>
        </nav>
        <Preferences locale={locale} />
        </div>
      </div>
    </header>
  );
}

function Footer({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN";
  return (
    <footer className="mt-auto border-t border-gray-200 bg-footer text-gray-400">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3 sm:px-6">
        <div>
          <p className="font-display text-[15px] text-white">
            Agent Plugins <span className="font-bold text-iris-soft">Marketplace</span>
          </p>
          <p className="mt-2 max-w-xs leading-relaxed">
            {zh
              ? "查找开源插件，查看其兼容格式、技能、MCP 服务器、源码和安装说明。与 OpenAI 或 Anthropic 无隶属关系。"
              : "Find open-source plugins and review their supported formats, skills, MCP servers, source, and setup details. Not affiliated with OpenAI or Anthropic."}
          </p>
        </div>
        <nav aria-label="Footer" className="grid gap-2">
          <p className="font-mono text-xs uppercase tracking-wider text-gray-500">{zh ? "查找插件" : "Find plugins"}</p>
          <Link href="/plugins" className="hover:text-white">{zh ? "浏览全部" : "Browse all"}</Link>
          <Link href="/codex-plugins" className="hover:text-white">{zh ? "Codex 插件" : "Codex plugins"}</Link>
          <Link href="/claude-code-plugins" className="hover:text-white">{zh ? "Claude Code 插件" : "Claude Code plugins"}</Link>
          <Link href="/agent-skills" className="hover:text-white">{zh ? "Agent 技能" : "Agent skills"}</Link>
          <Link href="/mcp-servers" className="hover:text-white">{zh ? "MCP 服务器" : "MCP servers"}</Link>
          <Link href="/categories" className="hover:text-white">{zh ? "按标签浏览" : "Browse by tag"}</Link>
          <Link href="/timeline" className="hover:text-white">{zh ? "最近新增" : "Recently added"}</Link>
          <Link href="/insights" className="hover:text-white">{zh ? "生态数据" : "Ecosystem data"}</Link>
          <Link href="/docs" className="hover:text-white">{zh ? "开发者 API" : "Developer API"}</Link>
          <Link href="/docs#mcp" className="hover:text-white">{zh ? "连接 MCP" : "Connect with MCP"}</Link>
        </nav>
        <nav aria-label={zh ? "插件格式" : "Plugin formats"} className="grid gap-2">
          <p className="font-mono text-xs uppercase tracking-wider text-gray-500">{zh ? "插件格式" : "Plugin formats"}</p>
          <a href="https://developers.openai.com/plugins/build/plugins" target="_blank" rel="noopener noreferrer" className="hover:text-white">
            {zh ? "Codex 插件文档" : "Codex plugin documentation"}
          </a>
          <a href="https://code.claude.com/docs/en/plugins-reference" target="_blank" rel="noopener noreferrer" className="hover:text-white">
            {zh ? "Claude Code 插件文档" : "Claude Code plugin documentation"}
          </a>
          <a href="https://agent-plugins.org/specification" target="_blank" rel="noopener noreferrer" className="hover:text-white">
            {zh ? "Agent Plugins 规范" : "Agent Plugins specification"}
          </a>
        </nav>
      </div>
    </footer>
  );
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="alternate" type="text/plain" href="/llms.txt" title="LLM site guide" />
        <link rel="alternate" type="text/plain" href="/llms-full.txt" title="Full LLM catalog" />
      </head>
      <body className="flex min-h-full flex-col">
        <JsonLd data={websiteJsonLd(locale)} />
        <Header locale={locale} />
        <main className="w-full min-w-0 flex-1">{children}</main>
        <Footer locale={locale} />
      </body>
    </html>
  );
}
