# Agent Plugin Marketplace

A registry and marketplace for [Agent Plugins](https://agent-plugins.org/specification) — open-source skills and MCP servers packaged as self-contained plugins, indexed from GitHub. Modeled on skillsmp.com; built with Next.js 16, Prisma, and SQLite.

Every surface reads from the same index:

- **Web UI** — browse, search, categories, timeline, and plugin detail pages
- **REST API** — `/api/v1/*`, documented at `/docs` with an OpenAPI 3.1 spec at `/api/openapi.json`
- **MCP endpoint** — `POST /api/mcp` (Streamable HTTP, stateless), so agents can query the registry natively
- **llms.txt** — a plain-text guide for LLM agents at `/llms.txt`

The marketplace dogfoods the spec: this repo is itself a valid Agent Plugin (see `plugin.json` and `mcp.json` at the root, pointing at the MCP endpoint).

## Quick start

```bash
npm install
npx prisma db push        # create SQLite DB (prisma/dev.db) + generate client
npm run db:seed           # load 15 fixture plugins
npm run dev               # http://localhost:3000
```

> Fonts are self-hosted via `@fontsource` — no network dependency at build or runtime.

## Indexing real plugins from GitHub

```bash
GITHUB_TOKEN="$(gh auth token)" npm run index:github -- --max 40
```

The indexer code-searches GitHub for `plugin.json` manifests referencing the agent-plugins.org schema, validates them against the spec (invalid components are skipped non-fatally, invalid manifests reject the plugin), and upserts into the DB. It only ever talks to `api.github.com`, respects rate limits, caps file sizes, and is idempotent — re-runs update in place.

`--reset` on `db:seed` wipes the index first: `npx tsx scripts/seed.mts --reset`.

## Validation and trust model

All indexed content is treated as untrusted:

- Manifests are validated against the official `plugin.schema.json` semantics (exact `$schema`, name pattern, closed author object, string repository). Spec-fatal violations reject the plugin; unknown top-level fields are warned and ignored, per the spec.
- `mcp.json` follows the spec's failure boundaries: a top-level violation disables MCP for the plugin; invalid individual servers are skipped. Server entries enforce spec 7.2.1 (bare/`./`-relative commands, `cwd` patterns, HTTPS-only for non-loopback URLs, no `PLUGIN_ROOT`/`PLUGIN_DATA` env keys).
- Skills must conform to the Agent Skills spec (`name` matching the directory, non-empty `description`) or they are skipped.
- The UI renders indexed data as plain text only; URLs are linkified only for `http(s)`, and text destined for the clipboard is stripped of control characters.

## REST API

| Endpoint | Description |
|---|---|
| `GET /api/v1/plugins` | List/search. Params: `q`, `category`, `type` (skills\|mcp), `transport` (stdio\|streamable-http\|sse), `sort` (stars\|updated\|recent), `page`, `per_page` (≤50) |
| `GET /api/v1/plugins/:slug` | Full plugin detail: manifest, skills, MCP servers |
| `GET /api/v1/stats` | Registry totals |
| `GET /api/v1/categories` | Categories (derived from manifest keywords) with counts |

Read-only, no auth, CORS `*`. Errors are `{ "error": { "code", "message" } }`. Full docs at `/docs`, OpenAPI at `/api/openapi.json`.

## MCP endpoint

`POST /api/mcp` — stateless Streamable HTTP, JSON-RPC 2.0, protocol `2025-06-18`. Tools: `search_plugins`, `get_plugin`, `get_stats`. Connect from any MCP client:

```json
{
  "mcpServers": {
    "agent-plugin-marketplace": { "type": "streamable-http", "url": "http://localhost:3000/api/mcp" }
  }
}
```

End-to-end protocol tests: `npm run test:mcp` (start the server first; `BASE_URL` overrides the target).

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js lifecycle |
| `npm run db:push` | Apply Prisma schema to SQLite |
| `npm run db:seed` | Seed fixtures (add `--reset` via tsx to wipe first) |
| `npm run index:github` | Crawl GitHub for real plugins (`GITHUB_TOKEN` recommended) |
| `npm run test:mcp` | 10-check MCP protocol test suite |
| `npm run lint` | ESLint |

## Environment

See `.env.example`. `DATABASE_URL` defaults to SQLite (`file:./dev.db`); the Prisma schema is Postgres-compatible for production. `NEXT_PUBLIC_BASE_URL` sets the absolute base for `sitemap.xml`/`robots.txt`.

## Design

The visual system is documented in [DESIGN.md](DESIGN.md): folder-tab "manifest cards" as the signature element, component-type color coding (skills = iris, MCP = teal), Bricolage Grotesque / Instrument Sans / JetBrains Mono.

## Scope notes

v1 is read-only: no accounts, submissions, or ratings. Fixture repos under `fixtures/` are fictional examples; crawled plugins link to their real repositories.
