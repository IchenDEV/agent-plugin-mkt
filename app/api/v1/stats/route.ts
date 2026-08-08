import { getStats } from "@/lib/queries";
import { json } from "@/lib/api-helpers";

export { OPTIONS } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/** GET /api/v1/stats — registry totals. */
export async function GET() {
  const stats = await getStats();
  return json({ data: stats });
}
