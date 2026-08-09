import Link from "next/link";
import { Container, EmptyState } from "@/components/ui";
import { getLocale } from "@/lib/i18n-server";

export default async function PluginNotFound() {
  const locale = await getLocale();
  const zh = locale === "zh-CN";
  return (
    <Container className="py-16">
      <EmptyState
        title={zh ? "未找到插件" : "Plugin not found"}
        hint={zh ? "索引中没有这个插件；它可能尚未被抓取，或 slug 已经变更。你可以浏览完整列表。" : "This plugin isn’t in the index — it may not be crawled yet, or its slug changed. Browse the full list instead."}
        action={
          <Link
            href="/plugins"
            className="inline-flex rounded-md bg-action px-4 py-2 text-sm font-semibold text-on-action hover:bg-iris"
          >
            {zh ? "浏览插件" : "Browse plugins"}
          </Link>
        }
      />
    </Container>
  );
}
