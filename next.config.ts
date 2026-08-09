import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The deployable preview uses a bundled, read-only marketplace snapshot.
  // Ensure every dynamic route that imports Prisma receives the database file.
  outputFileTracingIncludes: {
    "/*": ["./prisma/marketplace.db"],
  },
};

export default nextConfig;
