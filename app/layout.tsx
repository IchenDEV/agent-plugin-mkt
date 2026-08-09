import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/site";
// Self-hosted variable fonts (no network dependency at build or runtime).
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: {
    default: `${SITE_NAME} — Agent skills & MCP servers`,
    template: "%s · plugins marketplace",
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
    title: `${SITE_NAME} — Agent skills & MCP servers`,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Agent skills & MCP servers`,
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

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${absoluteUrl("/")}#website`,
  url: absoluteUrl("/"),
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  inLanguage: "en",
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

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-porcelain/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-display text-[15px] tracking-tight">
          <span aria-hidden className="grid size-7 place-items-center rounded-md bg-ink font-mono text-[13px] font-semibold text-white">
            /
          </span>
          <span>
            plugins <span className="font-bold text-iris">marketplace</span>
          </span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-sm font-medium text-gray-600">
          <Link href="/plugins" className="rounded-md px-3 py-1.5 hover:bg-white hover:text-ink">
            Browse
          </Link>
          <Link href="/categories" className="hidden rounded-md px-3 py-1.5 hover:bg-white hover:text-ink sm:block">
            Categories
          </Link>
          <Link href="/timeline" className="hidden rounded-md px-3 py-1.5 hover:bg-white hover:text-ink sm:block">
            Timeline
          </Link>
          <Link href="/docs" className="rounded-md px-3 py-1.5 hover:bg-white hover:text-ink">
            API
          </Link>
          <a
            href="https://developers.openai.com/plugins/build/plugins"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden rounded-md px-3 py-1.5 hover:bg-white hover:text-ink sm:block"
          >
            Spec
          </a>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-gray-200 bg-ink text-gray-400">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3 sm:px-6">
        <div>
          <p className="font-display text-[15px] text-white">
            plugins <span className="font-bold text-iris-soft">marketplace</span>
          </p>
          <p className="mt-2 max-w-xs leading-relaxed">
            A community index of open-source Codex and Claude Code plugins. Not affiliated with
            OpenAI or Anthropic.
          </p>
        </div>
        <nav aria-label="Footer" className="grid gap-2">
          <p className="font-mono text-xs uppercase tracking-wider text-gray-500">Explore</p>
          <Link href="/plugins" className="hover:text-white">Browse plugins</Link>
          <Link href="/categories" className="hover:text-white">Categories</Link>
          <Link href="/timeline" className="hover:text-white">Timeline</Link>
          <Link href="/docs" className="hover:text-white">REST API</Link>
          <Link href="/docs#mcp" className="hover:text-white">MCP endpoint</Link>
        </nav>
        <nav aria-label="Specification" className="grid gap-2">
          <p className="font-mono text-xs uppercase tracking-wider text-gray-500">Specifications</p>
          <a href="https://developers.openai.com/plugins/build/plugins" target="_blank" rel="noopener noreferrer" className="hover:text-white">
            Codex plugin packaging
          </a>
          <a href="https://code.claude.com/docs/en/plugins-reference" target="_blank" rel="noopener noreferrer" className="hover:text-white">
            Claude Code plugins
          </a>
          <a href="https://agent-plugins.org/specification" target="_blank" rel="noopener noreferrer" className="hover:text-white">
            Agent Plugins v1
          </a>
        </nav>
      </div>
    </footer>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="alternate" type="text/plain" href="/llms.txt" title="LLM site guide" />
        <link rel="alternate" type="text/plain" href="/llms-full.txt" title="Full LLM catalog" />
      </head>
      <body className="flex min-h-full flex-col">
        <JsonLd data={websiteJsonLd} />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
