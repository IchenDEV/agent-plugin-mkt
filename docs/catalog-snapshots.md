# Catalog snapshots and recovery

## Invariants

- Prisma still queries SQLite at `prisma/marketplace.db`. The Vercel copy remains `/tmp/agent-plugin-marketplace.db`; its identity marker prevents reuse across different snapshots.
- Git tracks `prisma/snapshot.json` and both install catalogs, not the raw database or index checkpoint. No history rewrite is needed.
- A pin contains the snapshot ID, Prisma schema SHA-256, SQLite schema fingerprint, byte lengths, SHA-256 hashes, counts, coverage, and exact immutable-version asset URLs. There is no `latest` lookup.
- Production builds/runtimes always select the bundled pin, even if `DATABASE_URL` is set; Vercel always uses its writable copy. Custom `DATABASE_URL` remains supported in non-production development/indexer CLI runs.
- A build restores the exact pin before Prisma generation. Missing assets, wrong hashes, incompatible schemas, corrupt SQLite, foreign-key errors, empty catalogs, and catalog-file mismatches fail the build. A warm file cache is checked too.
- Node.js 24 is required for the built-in SQLite validator/compactor. Production bundles still include the uncompressed database. Release compression solves Git's file-size limit; it does **not** remove hosting bundle/storage limits.

## Bootstrap without a nonexistent Release

The first manifest uses `legacy-git` and pins the existing database at commit `1675520b3683ed60465894f41896116edf5b22d9`. Its exact bytes are downloaded from the public raw-file URL and checked. Removing the database from current Git tracking does not remove that historical commit. Do not delete or rewrite that history while this pin is in use.

This compatibility pin is deliberate: implementation does not need to publish a Release, invent an asset URL, or change tokens. After code review and explicit rollout approval, the first authorized sync creates a real release and replaces this legacy source with `github-release`. No bootstrap database upload is required before that first sync. Production deployment/publishing is a separate approval from preparing these changes.

Before rollout: configure the hosting build to use Node 24; verify its outbound access to the historical raw URL and GitHub Release download redirects; verify its uncompressed function bundle size limit. `MARKETPLACE_GITHUB_TOKEN` remains unchanged and may have its existing permissions. The workflow's repository `GITHUB_TOKEN` publishes Releases and commits; branch protection or token permissions may require the repository owner's intervention.

## Publication order

1. Restore the pinned database and its matching checkpoint.
2. Resume a discovery cycle under measured request/time budgets. Only finished plugin transactions persist. No record is removed because search did not see it.
3. Generate both marketplace JSON files from that database, check their content, and validate SQLite.
4. Close writers; use `VACUUM INTO` for a separate compact database; gzip it. Package the matching checkpoint and both catalogs. Produce a candidate manifest in `.snapshot/<snapshot-id>/`.
5. Build/test the candidate locally with verified asset bytes. `SNAPSHOT_ASSET_DIRECTORY` is a local test override only; it does not skip hashes or schema checks.
6. Save the candidate as a recoverable Actions artifact, then create a new uniquely tagged Release. Do not overwrite assets or delete old releases.
7. Download and verify public assets independently, without the local override.
8. Commit the manifest plus both catalogs in one Git commit and push normally. A changed `main` rejects the push; never force-push generated data. That leaves an unused but recoverable release, not a pin to missing data.

The schedule remains 00:17 and 12:17 UTC. A failed validation/publication leaves the old deployed pin untouched. Failure artifacts preserve available database/checkpoint state for 14 days. A runner hard kill or job timeout can prevent the final artifact upload; checkpointing is durable on disk, not a promise of recovery from loss of the entire runner. The time budget leaves workflow headroom for packaging and publication.

## Coverage and request budgets

`--max` bounds code-search hits only. `--repository-max` bounds repository candidates. `--request-budget` counts every API attempt, including retries, across core, repository-search, and code-search resources. `--time-budget-seconds` bounds the invocation. Response headers supply remaining quota/reset information; core requests keep a reserve. Primary exhaustion and secondary throttling use different handling; `Retry-After` is honored with bounded waiting. A permission-denied 403 is not treated as a quota reset.

`prisma/index-state.json` (or `INDEX_STATE_PATH`) stores the cycle, discovery configuration, queues/pages, post-commit roots, and a rotating cursor. Pending work survives successful partial publications; subsequent runs restore the matching state and continue. A completed cycle starts a new cycle next run. Search windows stay bounded, rankings can change between fetched pages, and completed coverage means only the configured cycle. It never claims all repositories or full freshness. API, HTML metadata, and MCP `catalog://snapshot` expose the same coverage label.

Do not change discovery options while resuming an unfinished cycle. That fails closed instead of silently dropping pending work. Request/time budgets can change. If adding/removing the dedicated token changes discovery mode, finish with the original mode or intentionally start a separate checkpoint (`INDEX_STATE_PATH`) and document that the previous cycle was abandoned. Retain the old database/checkpoint pair for recovery.

## Local validation

```sh
npm ci
npm run snapshot:restore
npx prisma generate
npm test
npm run lint
npm run db:validate
npm run marketplace:check
npm run build
```

Do not run a production index or publisher just to test this migration. Mocked request/checkpoint tests cover interruption and quota paths. Normal `npm run build` restores the pin, replacing locally indexed unpinned database changes. To test a deliberate local candidate, run the generation/validation/prepare stages, copy its candidate manifest to the working tree, and set `SNAPSHOT_ASSET_DIRECTORY=.snapshot/<id>` for the build. Do not commit that candidate pin until the corresponding assets are published and independently verified.

## Recovery and rollback

- Failed before publication: download the `snapshot-<id>` artifact, or the `recovery-<id>` artifact for interrupted work. Keep its database and checkpoint together. Validate before using it; an emergency artifact is not a validated release.
- Failed push after publication: inspect the new `main` first. If schema/code are compatible, re-verify the release and catalogs, then create a fresh atomic pin/catalog commit on the new base. Never overwrite the release or force-push the rejected commit.
- Rollback: revert the specific publication commit, which restores the previous manifest and both catalogs together. Build verifies and restores that previous snapshot. Do not roll back only one of these three files. Older Releases must remain available.
- Schema change: this pipeline intentionally rejects a changed Prisma schema or SQLite fingerprint. Prepare an explicit migration, a matching verified snapshot, and schema pin together; do not bypass validation.

Identity inspection: HTML `catalog-snapshot-*` metadata, `GET /api/catalog-snapshot`, and MCP resource `catalog://snapshot`. These report publication/discovery scope, not a claim that every source repository was refreshed at the manifest creation time.
