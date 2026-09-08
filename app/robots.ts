import type { MetadataRoute } from "next";
import { SITE_URL, absoluteUrl } from "@/lib/site";
import { BROWSE_CRAWL_DISALLOW } from "@/lib/crawl-policy";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: BROWSE_CRAWL_DISALLOW }],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE_URL.origin,
  };
}
