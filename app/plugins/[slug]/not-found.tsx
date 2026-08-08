import Link from "next/link";
import { Container, EmptyState } from "@/components/ui";

export default function PluginNotFound() {
  return (
    <Container className="py-16">
      <EmptyState
        title="Plugin not found"
        hint="This plugin isn’t in the index — it may not be crawled yet, or its slug changed. Browse the full list instead."
        action={
          <Link
            href="/plugins"
            className="inline-flex rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-iris"
          >
            Browse plugins
          </Link>
        }
      />
    </Container>
  );
}
