import type { MetadataRoute } from "next";

// Same env fallback as app/sitemap.ts: NEXT_PUBLIC_BASE_URL is the deployed
// origin; localhost keeps the sitemap reference valid in development.
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
