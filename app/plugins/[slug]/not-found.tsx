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
        hint={zh ? "这个插件可能尚未添加到目录，或者链接已经变更。你可以浏览全部插件。" : "This plugin may not have been added to the directory yet, or its link may have changed. Browse all plugins instead."}
        action={
          <Link
            href="/plugins"
            className="inline-flex rounded-md bg-action px-4 py-2 text-sm font-semibold text-on-action hover:bg-iris"
          >
            {zh ? "浏览全部插件" : "Browse all plugins"}
          </Link>
        }
      />
    </Container>
  );
}
