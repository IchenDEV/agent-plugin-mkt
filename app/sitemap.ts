import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { getCategories } from "@/lib/queries";
import { absoluteUrl } from "@/lib/site";

export const revalidate = 21_600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Keep the feed compact: Google ignores changeFrequency and priority.
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/") },
    { url: absoluteUrl("/plugins") },
    { url: absoluteUrl("/categories") },
    { url: absoluteUrl("/timeline") },
    { url: absoluteUrl("/docs") },
    { url: absoluteUrl("/codex-plugins") },
    { url: absoluteUrl("/claude-code-plugins") },
    { url: absoluteUrl("/agent-skills") },
    { url: absoluteUrl("/mcp-servers") },
    { url: absoluteUrl("/insights") },
  ];

  const [plugins, categories] = await Promise.all([
    prisma.plugin.findMany({
      select: { slug: true },
      orderBy: { repoStars: "desc" },
    }),
    getCategories(100),
  ]);

  return [
    ...staticRoutes,
    ...categories.map((category) => ({
      url: absoluteUrl(`/plugins?category=${encodeURIComponent(category.name)}`),
    })),
    // repoPushedAt is repository-wide. In a monorepo, an unrelated push does
    // not mean every plugin page changed, so it is not a truthful lastModified.
    ...plugins.map((plugin) => ({
      url: absoluteUrl(`/plugins/${encodeURIComponent(plugin.slug)}`),
    })),
  ];
}
