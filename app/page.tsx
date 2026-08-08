import Link from "next/link";
import { Card, Container, EmptyState, SearchInput, StatBlock } from "@/components/ui";
import { PluginCard } from "@/components/plugin-card";
import { formatNumber, relativeTime } from "@/lib/format";
import { getStats, searchPlugins } from "@/lib/queries";

export const dynamic = "force-dynamic";

const SPEC_URL = "https://agent-plugins.org/specification";

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

function AnatomyStrip() {
  return (
    <section className="border-y border-gray-200 bg-surface">
      <Container className="grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Anatomy of a plugin
          </h2>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-gray-600">
            An Agent Plugin is a self-contained directory: a{" "}
            <code className="font-mono text-[13px]">plugin.json</code> manifest at the root, with
            skills and MCP servers discovered from fixed locations inside it. Failure boundaries are
            non-fatal by design — a component that fails to load is skipped, and the rest of the
            plugin keeps working.
          </p>
          <a
            href={SPEC_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-block text-sm font-medium text-iris hover:text-iris-deep"
          >
            Read the Agent Plugins spec &rarr;
          </a>
        </div>
        <Card className="shadow-sm">
          <div
            className="overflow-x-auto p-4 font-mono text-[13px] leading-6 sm:p-5"
            aria-label="Example plugin directory layout"
          >
            <TreeLine name="my-plugin/" nameClass="font-semibold text-ink" />
            <TreeLine
              prefix="├── "
              name="plugin.json"
              nameClass="font-medium text-ink"
              comment="manifest — identity + metadata"
            />
            <TreeLine prefix="├── " name="skills/" nameClass="text-iris" />
            <TreeLine prefix="│   ├── " name="code-review/" nameClass="text-iris" />
            <TreeLine
              prefix="│   │   └── "
              name="SKILL.md"
              nameClass="text-iris"
              comment="one directory per skill"
            />
            <TreeLine prefix="│   └── " name="changelog/" nameClass="text-iris" />
            <TreeLine prefix="│       └── " name="SKILL.md" nameClass="text-iris" />
            <TreeLine
              prefix="├── "
              name="mcp.json"
              nameClass="text-teal-700"
              comment="MCP server definitions"
            />
            <TreeLine prefix="└── " name="README.md" />
          </div>
        </Card>
      </Container>
    </section>
  );
}

function AgentsCallout() {
  return (
    <section>
      <Container className="py-16 sm:py-20">
        <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Built for agents
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">
          Every surface reads from the same index — humans get this site, agents get structured
          endpoints.
        </p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <Card className="p-5">
            <p className="font-mono text-sm">
              <span className="text-gray-400">GET</span>{" "}
              <span className="font-medium">/api/v1/plugins</span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              Search, filter, and page through the full index as plain JSON.
            </p>
            <Link
              href="/docs"
              className="mt-4 inline-block text-sm font-medium text-iris hover:text-iris-deep"
            >
              API reference &rarr;
            </Link>
          </Card>
          <Card className="p-5">
            <p className="font-mono text-sm">
              <span className="text-gray-400">POST</span>{" "}
              <span className="font-medium">/api/mcp</span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              An MCP endpoint agents can call natively to query the registry from inside a session.
            </p>
            <Link
              href="/docs#mcp"
              className="mt-4 inline-block text-sm font-medium text-iris hover:text-iris-deep"
            >
              MCP endpoint &rarr;
            </Link>
          </Card>
        </div>
      </Container>
    </section>
  );
}

export default async function HomePage() {
  const [stats, featured, recent] = await Promise.all([
    getStats(),
    searchPlugins({ sort: "stars", perPage: 6 }),
    searchPlugins({ sort: "recent", perPage: 5 }),
  ]);
  const indexIsEmpty = stats.plugins === 0;

  return (
    <div>
      {/* Hero */}
      <section>
        <Container className="pb-14 pt-16 sm:pb-16 sm:pt-24">
          <a
            href={SPEC_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 font-mono text-xs text-gray-500 hover:text-iris"
          >
            <span aria-hidden className="inline-block size-1.5 rounded-full bg-iris" />
            Agent Plugins specification · v1
          </a>
          <h1 className="mt-4 max-w-2xl font-display text-4xl font-bold tracking-tight sm:text-5xl">
            The registry for Agent Plugins
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-gray-600">
            An index of open-source skills and MCP servers, packaged as self-contained plugins per
            the open spec and indexed straight from GitHub.
          </p>
          <div className="mt-7 max-w-xl">
            <SearchInput action="/plugins" />
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
            <Link href="/plugins" className="text-gray-600 hover:text-iris">
              Browse all plugins &rarr;
            </Link>
            <Link href="/docs" className="text-gray-600 hover:text-iris">
              For agents: API &amp; MCP &rarr;
            </Link>
          </div>
        </Container>
      </section>

      {/* Stats */}
      <section aria-labelledby="stats-heading">
        <Container className="pb-16 sm:pb-20">
          <h2 id="stats-heading" className="sr-only">
            Registry stats
          </h2>
          <div className="grid grid-cols-2 gap-8 border-t border-gray-200 pt-8 sm:grid-cols-4">
            <StatBlock value={formatNumber(stats.plugins)} label="Plugins indexed" />
            <StatBlock value={formatNumber(stats.skills)} label="Skills" />
            <StatBlock value={formatNumber(stats.mcpServers)} label="MCP servers" />
            <StatBlock value={formatNumber(stats.categories)} label="Categories" />
          </div>
        </Container>
      </section>

      {indexIsEmpty ? (
        <section>
          <Container className="pb-16 sm:pb-20">
            <EmptyState
              title="The index is empty"
              hint="Nothing has been crawled yet — run npm run db:seed to index the sample registry, then refresh this page."
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
                  Featured plugins
                </h2>
                <Link
                  href="/plugins"
                  className="shrink-0 text-sm font-medium text-iris hover:text-iris-deep"
                >
                  Browse all &rarr;
                </Link>
              </div>
              <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                {featured.items.map((plugin) => (
                  <PluginCard key={plugin.slug} plugin={plugin} />
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
                Recently indexed
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
                          {plugin.description ?? "No description in manifest."}
                        </span>
                        <span
                          className="shrink-0 text-xs text-gray-500"
                          title={plugin.indexedAt.toISOString()}
                        >
                          indexed {relativeTime(plugin.indexedAt)}
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

      <AnatomyStrip />
      <AgentsCallout />
    </div>
  );
}
