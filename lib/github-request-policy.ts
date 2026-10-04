/** Request accounting is independent of search-result limits. Retries count too. */
export type GitHubResource = "core" | "search" | "code_search";
export interface RequestMetrics {
  requests: number;
  byResource: Record<GitHubResource, number>;
  rateLimitResponses: number;
  waitedMs: number;
  buckets: Record<string, { remaining: number; resetAt: number | null }>;
}
export function emptyRequestMetrics(): RequestMetrics {
  return { requests: 0, byResource: { core: 0, search: 0, code_search: 0 }, rateLimitResponses: 0, waitedMs: 0, buckets: {} };
}
export function requestResource(path: string): GitHubResource {
  return path === "/search/code" ? "code_search" : path.startsWith("/search/") ? "search" : "core";
}
export interface RateLimitDecision { kind: "primary" | "secondary"; waitMs: number }
/** Never treat an ordinary permission-denied 403 as a rate limit. */
export function rateLimitDecision(status: number, headers: Headers, message: string, now: number, attempt: number): RateLimitDecision | null {
  if (status !== 403 && status !== 429) return null;
  const primary = headers.get("x-ratelimit-remaining") === "0";
  const retry = headers.get("retry-after");
  if (!primary && retry === null && status !== 429 && !/secondary rate limit|abuse detection|rate limit exceeded/i.test(message)) return null;
  const resetHeader = headers.get("x-ratelimit-reset");
  const reset = resetHeader === null ? NaN : Number(resetHeader);
  let waitMs = primary && Number.isFinite(reset) && reset > 0 ? Math.max(0, reset * 1000 - now) + 1000 : 60_000 * 2 ** attempt;
  if (retry !== null) {
    const seconds = Number(retry);
    const parsed = retry.trim() !== "" && Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : Date.parse(retry) - now;
    if (Number.isFinite(parsed)) {
      const retryMs = Math.max(0, parsed) + 1000;
      waitMs = primary ? Math.max(waitMs, retryMs) : retryMs * 2 ** attempt;
    }
  }
  return { kind: primary ? "primary" : "secondary", waitMs };
}
