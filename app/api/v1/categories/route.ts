import { getCategories } from "@/lib/queries";
import { json } from "@/lib/api-helpers";

export { OPTIONS } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/** GET /api/v1/categories — keyword-derived categories ranked by frequency. */
export async function GET() {
  const categories = await getCategories();
  return json({ data: categories });
}
