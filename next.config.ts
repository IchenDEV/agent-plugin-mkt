import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship gzip only; Vercel expands the verified pin into writable /tmp storage.
  outputFileTracingIncludes: {
    "/*": ["./prisma/marketplace.db.gz"],
  },
  outputFileTracingExcludes: {
    "/*": ["./prisma/marketplace.db", "./prisma/index-state.json"],
  },
};

export default nextConfig;
