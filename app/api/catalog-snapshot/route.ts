import { CATALOG_SNAPSHOT } from "@/lib/catalog-snapshot";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** Build-pinned identity; deliberately independent of database availability. */
export function GET(): Response {
  return Response.json(CATALOG_SNAPSHOT, {
    headers: { ...corsHeaders, "Cache-Control": "no-store" },
  });
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: { ...corsHeaders, Allow: "GET, OPTIONS" },
  });
}
