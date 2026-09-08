// These browse variants are already noindex. Categories and pagination remain
// crawlable because they are useful entry points to the plugin detail pages.
const FILTER_PARAMS = ["q", "type", "transport", "protocol", "sort"] as const;

export const BROWSE_CRAWL_DISALLOW = FILTER_PARAMS.flatMap((param) => [
  `/plugins?${param}=`,
  `/plugins?*&${param}=`,
]);

export function isBrowseFilterUrl(href: string): boolean {
  const url = new URL(href, "https://pluginsmp.com");
  return url.pathname === "/plugins" && FILTER_PARAMS.some((param) => url.searchParams.has(param));
}
