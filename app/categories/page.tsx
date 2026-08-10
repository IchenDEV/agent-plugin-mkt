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
  const title = zh ? "插件分类" : "Categories";
  const socialTitle = zh ? "Agent 插件分类" : "Agent Plugin categories";
  const description = zh
    ? "按分类浏览 Agent 插件；分类来自清单关键词，并按声明该关键词的插件数量排序。"
    : "Browse Agent Plugins by category — keyword-derived groupings ranked by how many plugins declare them.";
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
    name: zh ? "Agent 插件分类" : "Agent Plugin categories",
    description: zh ? "用于整理 Agent 插件索引的清单关键词分类。" : "Manifest keyword categories used to organize the Agent Plugin index.",
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
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{zh ? "分类" : "Categories"}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          {zh
            ? "分类来自每个插件的清单关键词，并按声明该关键词的已收录插件数量排序。选择一个分类即可筛选插件。"
            : "Categories are derived from each plugin's manifest keywords and ranked by how many indexed plugins declare them — pick one to filter the browse view."}
        </p>
      </div>

      {categories.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={zh ? "暂无分类" : "No categories yet"}
            hint={zh ? "收录带有清单关键词的插件后，分类会显示在这里；你可以先浏览完整插件列表。" : "Categories appear once plugins with manifest keywords are indexed — browse the full list in the meantime."}
            action={
              <Link
                href="/plugins"
                className="inline-flex rounded-md bg-action px-4 py-2 text-sm font-semibold text-on-action hover:bg-iris"
              >
                {zh ? "浏览插件" : "Browse plugins"}
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
