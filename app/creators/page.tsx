import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { Card, Container } from "@/components/ui";
import { relativeTime } from "@/lib/format";
import { getCreators } from "@/lib/queries";
import { absoluteUrl } from "@/lib/site";
import { getLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

const COPY = {
  en: {
    title: "Creators",
    intro:
      "Browse the GitHub creators behind the indexed plugins, ranked by total stars across their published plugin repositories. Every listing links back to the exact source repositories.",
    plugins: "plugins",
    stars: "stars",
    updated: "Updated",
    browse: "Browse all plugins",
    empty: "No creators indexed yet.",
  },
  "zh-CN": {
    title: "创作者",
    intro:
      "浏览被收录插件背后的 GitHub 创作者，按其发布的插件仓库总 Star 数排序。每个条目都链接回准确的源码仓库。",
    plugins: "个插件",
    stars: "Stars",
    updated: "最近更新",
    browse: "浏览全部插件",
    empty: "还没有被收录的创作者。",
  },
} as const;

type CreatorsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function positiveInt(value: string | undefined): number | undefined {
  if (!value || !/^[0-9]+$/.test(value)) return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 ? n : undefined;
}

export async function generateMetadata({ searchParams }: CreatorsPageProps): Promise<Metadata> {
  const [sp, locale] = await Promise.all([searchParams, getLocale()]);
  const zh = locale === "zh-CN";
  const page = positiveInt(Array.isArray(sp.page) ? sp.page[0] : sp.page) ?? 1;
  const title = zh ? `插件创作者${page > 1 ? ` — 第 ${page} 页` : ""}` : `Plugin creators${page > 1 ? ` — Page ${page}` : ""}`;
  return {
    title,
    description: zh
      ? "浏览被收录开源插件背后的 GitHub 创作者，比较每个作者的插件数量、Star 数和维护状态。"
      : "Browse the GitHub creators behind indexed open-source plugins and compare plugin counts, stars, and maintenance activity.",
    alternates: { canonical: page > 1 ? `/creators?page=${page}` : "/creators" },
    robots: page > 1 ? { index: false, follow: true } : undefined,
  };
}

const PER_PAGE = 60;

export default async function CreatorsPage({ searchParams }: CreatorsPageProps) {
  const [sp, locale] = await Promise.all([searchParams, getLocale()]);
  const c = COPY[locale];
  const zh = locale === "zh-CN";
  const page = positiveInt(Array.isArray(sp.page) ? sp.page[0] : sp.page) ?? 1;
  const creators = await getCreators(1_000);
  const total = creators.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const visible = creators.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${absoluteUrl("/creators")}#collection`,
    url: absoluteUrl("/creators"),
    name: c.title,
    description: c.intro,
    inLanguage: locale,
    isPartOf: { "@id": `${absoluteUrl("/")}#website` },
  };

  return (
    <Container className="py-10">
      <JsonLd data={jsonLd} />
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{c.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">{c.intro}</p>
      </div>

      {visible.length === 0 ? (
        <p className="mt-10 text-sm text-gray-500">{c.empty}</p>
      ) : (
        <>
          <ul className="mt-8 grid gap-x-4 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((creator) => (
              <li key={creator.owner}>
                <Card tab={creator.owner} className="h-full transition-colors hover:border-iris">
                  <Link
                    href={`/creators/${encodeURIComponent(creator.owner)}`}
                    className="flex h-full flex-col gap-3 p-4 focus-visible:outline-none"
                  >
                    <p className="font-mono text-sm font-semibold">{creator.displayName ?? creator.owner}</p>
                    <p className="text-sm leading-relaxed text-gray-600">
                      {zh
                        ? `维护 ${creator.pluginCount} 个被收录插件，合计 ${creator.totalStars} Stars。`
                        : `Maintains ${creator.pluginCount} indexed plugin${creator.pluginCount === 1 ? "" : "s"} with ${creator.totalStars} total stars.`}
                    </p>
                    <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500">
                      <span>
                        {creator.pluginCount} {c.plugins} · {creator.totalStars} {c.stars}
                      </span>
                      {creator.lastPushedAt ? (
                        <span>
                          {c.updated} {relativeTime(creator.lastPushedAt, locale)}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
          {totalPages > 1 ? (
            <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-4 text-sm font-medium">
              {page > 1 ? (
                <Link
                  href={`/creators?page=${page - 1}`}
                  className="rounded-md border border-gray-200 bg-surface px-3 py-1.5 text-gray-600 hover:border-iris hover:text-iris"
                >
                  {zh ? "← 上一页" : "← Prev"}
                </Link>
              ) : (
                <span aria-hidden className="rounded-md border border-gray-100 px-3 py-1.5 text-gray-300">
                  {zh ? "← 上一页" : "← Prev"}
                </span>
              )}
              <span className="text-gray-500">
                {zh ? `第 ${page} / ${totalPages} 页` : `Page ${page} of ${totalPages}`}
              </span>
              {page < totalPages ? (
                <Link
                  href={`/creators?page=${page + 1}`}
                  className="rounded-md border border-gray-200 bg-surface px-3 py-1.5 text-gray-600 hover:border-iris hover:text-iris"
                >
                  {zh ? "下一页 →" : "Next →"}
                </Link>
              ) : (
                <span aria-hidden className="rounded-md border border-gray-100 px-3 py-1.5 text-gray-300">
                  {zh ? "下一页 →" : "Next →"}
                </span>
              )}
            </nav>
          ) : null}
        </>
      )}

      <p className="mt-10 text-sm">
        <Link href="/plugins" className="font-medium text-iris hover:text-iris-deep">
          {c.browse} →
        </Link>
      </p>
    </Container>
  );
}
