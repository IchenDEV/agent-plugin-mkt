import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

// Sitemaps require absolute URLs. Set NEXT_PUBLIC_BASE_URL to the deployed
// origin (e.g. https://plugin.market); the localhost fallback keeps the file
// valid in development. app/robots.ts uses the same fallback.
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = ["/", "/plugins", "/categories", "/timeline", "/docs"].map(
    (path) => ({ url: `${BASE_URL}${path === "/" ? "" : path}` }),
  );

  const plugins = await prisma.plugin.findMany({
    select: { slug: true, indexedAt: true },
    orderBy: { repoStars: "desc" },
    take: 500,
  });

  return [
    ...staticRoutes,
    ...plugins.map((plugin) => ({
      url: `${BASE_URL}/plugins/${encodeURIComponent(plugin.slug)}`,
      lastModified: plugin.indexedAt,
    })),
  ];
}
