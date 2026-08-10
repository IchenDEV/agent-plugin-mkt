import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { Card, Container, EmptyState } from "@/components/ui";
import { getCategories } from "@/lib/queries";
import { getLocale } from "@/lib/i18n-server";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const zh = locale === "zh-CN";
  const title = zh ? "插件标签" : "Plugin tags";
  const socialTitle = zh ? "插件标签" : "Plugin tags";
  const description = zh
    ? "按插件清单中的关键词浏览插件，并查看每个标签下的插件数量。"
    : "Browse plugins by manifest keyword and see how many plugins use each tag.";
  return {
    title,
    description,
    alternates: { canonical: "/categories" },
    openGraph: { type: "website", title: socialTitle, description, url: "/categories", siteName: SITE_NAME },
    twitter: { card: "summary_large_image", title: socialTitle, description },
  };
}

export default async function CategoriesPage() {
  const [locale, categories] = await Promise.all([getLocale(), getCategories(100)]);
  const zh = locale === "zh-CN";
  const categoriesJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${absoluteUrl("/categories")}#collection`,
    url: absoluteUrl("/categories"),
    name: zh ? "插件标签" : "Plugin tags",
    description: zh ? "用于整理插件目录的清单关键词。" : "Manifest keywords used to organize the plugin directory.",
    inLanguage: locale,
    isPartOf: { "@id": `${absoluteUrl("/")}#website` },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: categories.length,
      itemListElement: categories.map((category, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: category.name,
        url: absoluteUrl(`/plugins?category=${encodeURIComponent(category.name)}`),
      })),
    },
  };

  return (
    <Container className="py-10">
      <JsonLd data={categoriesJsonLd} />
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{zh ? "标签" : "Tags"}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          {zh
            ? "标签来自插件清单中的关键词，并按使用该标签的插件数量排序。选择标签即可查看相关插件。"
            : "Tags come from plugin manifest keywords and are ranked by the number of plugins that use them. Select a tag to see matching plugins."}
        </p>
      </div>

      {categories.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={zh ? "暂无标签" : "No tags yet"}
            hint={zh ? "带有清单关键词的插件添加后，标签会显示在这里。你可以先浏览全部插件。" : "Tags appear after plugins with manifest keywords are added. You can browse all plugins in the meantime."}
            action={
              <Link
                href="/plugins"
                className="inline-flex rounded-md bg-action px-4 py-2 text-sm font-semibold text-on-action hover:bg-iris"
              >
                {zh ? "浏览全部插件" : "Browse all plugins"}
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <li key={category.name}>
              <Card className="h-full transition-colors hover:border-iris">
                <Link
                  href={`/plugins?category=${encodeURIComponent(category.name)}`}
                  className="flex items-baseline justify-between gap-3 rounded-lg px-4 py-3"
                >
                  <span className="truncate font-mono text-sm font-medium">{category.name}</span>
                  <span className="shrink-0 text-xs text-gray-500">
                    {zh ? `${category.count} 个插件` : `${category.count} plugin${category.count === 1 ? "" : "s"}`}
                  </span>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
