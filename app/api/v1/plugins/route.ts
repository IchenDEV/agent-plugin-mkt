import { searchPlugins } from "@/lib/queries";
import {
  COMPONENT_TYPES,
  PROTOCOLS,
  SORT_ORDERS,
  TRANSPORTS,
  json,
  parseEnum,
  parseEnums,
  parsePage,
  parsePerPage,
} from "@/lib/api-helpers";

export { OPTIONS } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/plugins — list and search plugins.
 * Params: q, repeatable protocol, category, owner, type, transport, sort, page, per_page.
 * Invalid enum values are rejected with 400 bad_request.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;

  const type = parseEnum(params.get("type"), "type", COMPONENT_TYPES);
  if (!type.ok) return type.response;
  const transport = parseEnum(params.get("transport"), "transport", TRANSPORTS);
  if (!transport.ok) return transport.response;
  const protocols = parseEnums(params.getAll("protocol"), "protocol", PROTOCOLS);
  if (!protocols.ok) return protocols.response;
  const sort = parseEnum(params.get("sort"), "sort", SORT_ORDERS);
  if (!sort.ok) return sort.response;

  const result = await searchPlugins({
    q: params.get("q") ?? undefined,
    category: params.get("category") ?? undefined,
    owner: params.get("owner") ?? undefined,
    type: type.value,
    transport: transport.value,
    protocols: protocols.value,
    sort: sort.value,
    page: parsePage(params.get("page")),
    perPage: parsePerPage(params.get("per_page")),
  });

  return json({
    data: result.items,
    meta: {
      page: result.page,
      per_page: result.perPage,
      total: result.total,
      total_pages: result.totalPages,
    },
  });
}
