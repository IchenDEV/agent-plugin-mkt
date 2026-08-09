import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { Card, Container, EmptyState } from "@/components/ui";
import { getCategories } from "@/lib/queries";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Categories",
  description:
    "Browse Agent Plugins by category — keyword-derived groupings ranked by how many plugins declare them.",
  alternates: { canonical: "/categories" },
  openGraph: {
    type: "website",
    title: "Agent Plugin categories",
    description:
      "Browse Agent Plugins by category — keyword-derived groupings ranked by how many plugins declare them.",
    url: "/categories",
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Plugin categories",
    description:
      "Browse Agent Plugins by category — keyword-derived groupings ranked by how many plugins declare them.",
  },
};

export default async function CategoriesPage() {
  const categories = await getCategories(100);
  const categoriesJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${absoluteUrl("/categories")}#collection`,
    url: absoluteUrl("/categories"),
    name: "Agent Plugin categories",
    description: "Manifest keyword categories used to organize the Agent Plugin index.",
    inLanguage: "en",
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
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Categories</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          Categories are derived from each plugin&apos;s manifest keywords and ranked by how many
          indexed plugins declare them — pick one to filter the browse view.
        </p>
      </div>

      {categories.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No categories yet"
            hint="Categories appear once plugins with manifest keywords are indexed — browse the full list in the meantime."
            action={
              <Link
                href="/plugins"
                className="inline-flex rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-iris"
              >
                Browse plugins
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
                    {category.count} plugin{category.count === 1 ? "" : "s"}
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
