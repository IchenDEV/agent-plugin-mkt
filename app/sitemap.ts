import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { getCategories } from "@/lib/queries";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/plugins"), changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/categories"), changeFrequency: "weekly", priority: 0.7 },
    { url: absoluteUrl("/timeline"), changeFrequency: "daily", priority: 0.7 },
    { url: absoluteUrl("/docs"), changeFrequency: "monthly", priority: 0.6 },
  ];

  const [plugins, categories] = await Promise.all([
    prisma.plugin.findMany({
      select: { slug: true, indexedAt: true, repoPushedAt: true },
      orderBy: { repoStars: "desc" },
    }),
    getCategories(100),
  ]);

  return [
    ...staticRoutes,
    ...categories.map((category) => ({
      url: absoluteUrl(`/plugins?category=${encodeURIComponent(category.name)}`),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...plugins.map((plugin) => ({
      url: absoluteUrl(`/plugins/${encodeURIComponent(plugin.slug)}`),
      lastModified: plugin.repoPushedAt ?? plugin.indexedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
