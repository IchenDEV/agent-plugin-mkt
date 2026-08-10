import {
  DEFAULT_PER_PAGE,
  MAX_PER_PAGE,
  type ComponentType,
  type SortOrder,
  type Transport,
} from "@/lib/queries";
import { PLUGIN_PROTOCOLS, type PluginProtocol } from "@/lib/protocols";

// Shared plumbing for the public REST API (app/api/v1/*) and the OpenAPI
// document. Every response goes through json()/error() so CORS and caching
// behavior stay identical across endpoints.

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** JSON response with CORS headers and a short public cache. */
export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "public, max-age=60");
  return new Response(JSON.stringify(data), { ...init, headers });
}

/** Error response: { error: { code, message } } with the given HTTP status. */
export function error(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, { status });
}

/** CORS preflight. Re-export this from each API route: `export { OPTIONS } from "@/lib/api-helpers"`. */
export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: { ...CORS_HEADERS, Allow: "GET, OPTIONS" },
  });
}

// Enum values accepted by the list endpoint. Typed against lib/queries so a
// drift in the query layer surfaces as a type error here.
export const COMPONENT_TYPES: readonly ComponentType[] = ["skills", "mcp"];
export const TRANSPORTS: readonly Transport[] = ["stdio", "streamable-http", "sse"];
export const SORT_ORDERS: readonly SortOrder[] = ["stars", "updated", "recent"];
export const PROTOCOLS: readonly PluginProtocol[] = PLUGIN_PROTOCOLS;

/** `page` query param: safe integer, clamped to >= 1; anything unparsable (or beyond Number.MAX_SAFE_INTEGER) is 1. */
export function parsePage(raw: string | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isSafeInteger(n)) return 1;
  return Math.max(1, n);
}

/** `per_page` query param: safe integer clamped to 1..MAX_PER_PAGE; unparsable falls back to the default. */
export function parsePerPage(raw: string | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isSafeInteger(n)) return DEFAULT_PER_PAGE;
  return Math.min(MAX_PER_PAGE, Math.max(1, n));
}

export type EnumParseResult<T extends string> =
  | { ok: true; value: T | undefined }
  | { ok: false; response: Response };

export type EnumsParseResult<T extends string> =
  | { ok: true; value: T[] }
  | { ok: false; response: Response };

/**
 * Parse an enum-valued query param. Missing/empty means "not filtered".
 * An unknown value is a 400 naming the valid values — stricter than the web
 * UI, which silently ignores invalid filters.
 */
export function parseEnum<T extends string>(
  raw: string | null,
  param: string,
  allowed: readonly T[],
): EnumParseResult<T> {
  if (raw === null || raw === "") return { ok: true, value: undefined };
  if ((allowed as readonly string[]).includes(raw)) return { ok: true, value: raw as T };
  return {
    ok: false,
    response: error(
      400,
      "bad_request",
      `Invalid ${param} "${raw.slice(0, 50)}". Accepted values: ${allowed.join(", ")}.`,
    ),
  };
}

/**
 * Parse a repeatable enum query param. Comma-separated values are accepted as
 * a convenience; duplicates are removed while preserving request order.
 */
export function parseEnums<T extends string>(
  raw: string[],
  param: string,
  allowed: readonly T[],
): EnumsParseResult<T> {
  const values = [...new Set(raw.flatMap((value) => value.split(",")).filter(Boolean))];
  const invalid = values.find((value) => !(allowed as readonly string[]).includes(value));
  if (invalid !== undefined) {
    return {
      ok: false,
      response: error(
        400,
        "bad_request",
        `Invalid ${param} "${invalid.slice(0, 50)}". Valid values: ${allowed.join(", ")}.`,
      ),
    };
  }
  return { ok: true, value: values as T[] };
}
