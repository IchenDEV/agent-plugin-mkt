import type { Metadata } from "next";
import Link from "next/link";
// Self-hosted variable fonts (no network dependency at build or runtime).
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Agent Plugin Marketplace",
    template: "%s · Agent Plugin Marketplace",
  },
  description:
    "Discover open-source plugins for Codex and Claude Code, indexed from canonical GitHub manifests.",
};

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-porcelain/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-display text-[15px] font-bold tracking-tight">
          <span aria-hidden className="grid size-7 place-items-center rounded-md bg-ink font-mono text-[13px] font-semibold text-white">
            /
          </span>
          <span>
            plugin<span className="text-iris">.market</span>
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
          <p className="font-display text-[15px] font-bold text-white">
            plugin<span className="text-iris-soft">.market</span>
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
      <body className="flex min-h-full flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
