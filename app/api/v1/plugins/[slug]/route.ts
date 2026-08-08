import { getPluginBySlug } from "@/lib/queries";
import { error, json } from "@/lib/api-helpers";

export { OPTIONS } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/** GET /api/v1/plugins/[slug] — full detail for one plugin. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const plugin = await getPluginBySlug(slug);
  if (!plugin) {
    return error(404, "not_found", `No plugin with slug "${slug.slice(0, 100)}".`);
  }
  return json({ data: plugin });
}
