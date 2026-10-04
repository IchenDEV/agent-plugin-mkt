import manifest from "@/prisma/snapshot.json";

// Bundled at build time with the database. Never fetch upstream state from a
// request handler: every public surface must describe this deployment's data.
// Explicitly select public fields so future internal manifest fields cannot leak.
export const CATALOG_SNAPSHOT = Object.freeze({
  formatVersion: manifest.formatVersion,
  snapshotId: manifest.snapshotId,
  schemaId: manifest.schemaId,
  createdAt: manifest.createdAt,
  coverage: Object.freeze({ status: manifest.coverage.status }),
  source: Object.freeze({ kind: manifest.source.kind }),
});

export const CATALOG_SNAPSHOT_RESOURCE_URI = "catalog://snapshot";
