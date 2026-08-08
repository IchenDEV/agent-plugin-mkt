import Link from "next/link";
import { relativeTime } from "@/lib/format";
import type { PluginSummary } from "@/lib/queries";

/**
 * Compact list rows for "Recently indexed" on the home page — deliberately
 * quieter than the featured folder-tab grid: mono name, one-line description,
 * relative index time.
 */
export function RecentList({ plugins }: { plugins: PluginSummary[] }) {
  return (
    <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-surface">
      {plugins.map((plugin) => (
        <Link
          key={plugin.slug}
          href={`/plugins/${plugin.slug}`}
          className="group flex items-baseline gap-3 px-4 py-3 transition-colors hover:bg-gray-50 sm:gap-4 sm:px-5"
        >
          <span className="min-w-0 truncate font-mono text-sm font-medium text-ink transition-colors group-hover:text-iris">
            {plugin.name}
          </span>
          <span className="hidden min-w-0 flex-1 truncate text-sm text-gray-500 sm:block">
            {plugin.description ?? "No description in manifest."}
          </span>
          <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-gray-400">
            {relativeTime(plugin.indexedAt)}
          </span>
        </Link>
      ))}
    </div>
  );
}
