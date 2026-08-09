# plugins marketplace

A registry for open-source skills and MCP servers packaged as self-contained plugins for [Codex](https://developers.openai.com/plugins/build/plugins), [Claude Code](https://code.claude.com/docs/en/plugins-reference), or the [Agent Plugins v1](https://agent-plugins.org/specification) format. Indexed from canonical GitHub manifests and built with Next.js 16, Prisma, and SQLite.

Every surface reads from the same index:

- **Web UI** — browse, search, categories, timeline, and plugin detail pages
- **REST API** — `/api/v1/*`, documented at `/docs` with an OpenAPI 3.1 spec at `/api/openapi.json`
- **MCP endpoint** — `POST /api/mcp` (Streamable HTTP, stateless), so agents can query the registry natively
- **llms.txt** — a plain-text guide for LLM agents at `/llms.txt`
- **llms-full.txt** — a complete text catalog for retrieval and citation at `/llms-full.txt`

The marketplace dogfoods all three formats. This repository contains `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, and the legacy root `plugin.json`; both official runtimes share the root `.mcp.json` connection.

## Runtime compatibility

| Runtime | Canonical manifest | Marketplace catalog |
|---|---|---|
| Codex | `.codex-plugin/plugin.json` | `.agents/plugins/marketplace.json` |
| Claude Code | `.claude-plugin/plugin.json` | `.claude-plugin/marketplace.json` |
| Agent Plugins v1 | `plugin.json` | — |

When a repository carries multiple manifests under the same plugin root, the index stores one plugin with multiple `protocols` instead of creating duplicates. Shared skills remain under `skills/<name>/SKILL.md`; Codex and Claude Code MCP configuration is read from `.mcp.json`, including inline or custom `mcpServers` paths.

## Quick start

```bash
npm install
npx prisma db push        # create SQLite DB (prisma/dev.db) + generate client
npm run db:seed           # load 15 fixture plugins
npm run dev               # http://localhost:3000
```

> Fonts are self-hosted via `@fontsource` — no network dependency at build or runtime.

Vercel preview deployments bundle `prisma/marketplace.db` as a read-only index
snapshot and copy it into the function's ephemeral `/tmp` directory at startup.
Refresh that snapshot locally before deploying with
`DATABASE_URL=file:./marketplace.db npm run db:push && DATABASE_URL=file:./marketplace.db npm run db:seed`.
For production, use a managed Postgres database rather than local SQLite.

## Indexing real plugins from GitHub

```bash
GITHUB_TOKEN="$(gh auth token)" npm run index:github -- --max 40
```

Use `--priority-only` to refresh the first-party Anthropic repositories without
running broad GitHub Code Search.

The indexer directly scans first-party Anthropic repositories and runs bounded GitHub code searches for all three canonical manifest families. It validates each manifest with its runtime rules, merges sibling manifests at one plugin root, and upserts one logical plugin. It only talks to `api.github.com`, respects rate limits, caps file sizes, and is idempotent. The direct priority scan covers `anthropics/claude-code`, `anthropics/claude-plugins-official`, and `anthropics/knowledge-work-plugins` even when GitHub Code Search omits their files.

The `Sync GitHub plugins` GitHub Actions workflow runs at 00:17 and 12:17 UTC
(08:17 and 20:17 Singapore time) and can also be started manually. Each run
refreshes changed repositories and star counts, validates the SQLite snapshot,
and commits a changed `prisma/marketplace.db` back to `main`. Vercel then
deploys the new production snapshot from `main`. Existing repositories whose
`pushed_at` value has not changed reuse their indexed components to save API
quota.

A dedicated `MARKETPLACE_GITHUB_TOKEN` repository secret enables broad
cross-repository code search; use a fine-grained PAT for public-resource search
rather than reusing a broad personal token. Without that secret, the workflow
still refreshes the three priority repositories with the built-in Actions token,
but skips broad discovery. With the secret configured, each run also scans both
the newest- and oldest-indexed 1,000-result windows for all three manifest
families. If the token reaches its hourly quota, transactions that already
completed are still validated and committed, and the next run continues
refreshing the same windows. GitHub code search exposes at most 1,000 results per
individual search, so the two ordering windows maximize the discoverable set but
cannot guarantee every match when a family exceeds 2,000 distinct results.

The sync is deliberately upsert-only: it does not delete an existing entry just
because a bounded GitHub search temporarily stops returning it.

`--reset` on `db:seed` wipes the index first: `npx tsx scripts/seed.mts --reset`.

## Validation and trust model

All indexed content is treated as untrusted:

- Codex manifests require a kebab-case name and type-check the common metadata and component fields used by `.codex-plugin/plugin.json`.
- Claude Code manifests follow its name-only minimum, optional metadata rules, root `SKILL.md` form, and `.claude-plugin/plugin.json` location.
- Agent Plugins v1 keeps its exact `$schema`, closed author object, non-fatal unknown-field warnings, and component failure boundaries.
- MCP entries are normalized to `stdio`, `streamable-http`, or `sse` for querying. Invalid individual servers are skipped without rejecting the rest of the plugin.
- Skills use the Agent Skills rules for Codex/Agent Plugins; Claude Code skills may derive a missing frontmatter name from their directory, as its runtime does.
- The UI renders indexed data as plain text only; URLs are linkified only for `http(s)`, and text destined for the clipboard is stripped of control characters.

## REST API

| Endpoint | Description |
|---|---|
| `GET /api/v1/plugins` | List/search. Repeat `protocol` to match any selected runtime, e.g. `?protocol=codex&protocol=claude-code`; other params include `q`, `category`, `type`, `transport`, `sort`, `page`, `per_page` (≤50) |
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

## Test this repository as a plugin

Start the web app first so the local MCP endpoint is available. Then validate the package:

```bash
python3 /path/to/plugin-creator/scripts/validate_plugin.py .
claude plugin validate . --strict
```

For local marketplace testing, add this repository as a marketplace in the relevant runtime, install `agent-plugin-marketplace@agent-plugin-marketplace`, and start a new session. The checked-in marketplace catalogs point back to the repository root.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js lifecycle |
| `npm run db:push` | Apply Prisma schema to SQLite |
| `npm run db:seed` | Seed fixtures (add `--reset` via tsx to wipe first) |
| `npm run db:validate` | Check SQLite integrity and report index totals |
| `npm run index:github` | Crawl GitHub for real plugins (`GITHUB_TOKEN` recommended) |
| `npm run test:mcp` | 11-check MCP protocol test suite |
| `npm run lint` | ESLint |

## Environment

See `.env.example`. `DATABASE_URL` defaults to SQLite (`file:./dev.db`); the Prisma schema is Postgres-compatible for production. `NEXT_PUBLIC_BASE_URL` sets the absolute base for `sitemap.xml`/`robots.txt`.

## Design

The visual system is documented in [DESIGN.md](DESIGN.md): folder-tab "manifest cards" as the signature element, component-type color coding (skills = iris, MCP = teal), Bricolage Grotesque / Instrument Sans / JetBrains Mono.

## Scope notes

v1 is read-only: no accounts, submissions, or ratings. Fixture repos under `fixtures/` are fictional examples; crawled plugins link to their real repositories.

## License

Licensed under the [MIT License](LICENSE).
