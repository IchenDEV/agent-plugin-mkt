import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { formatNumber, relativeTime } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { PluginSummary } from "@/lib/queries";
import { PROTOCOL_LABELS } from "@/lib/protocols";

/**
 * The manifest card used on the home featured grid and the browse grid.
 * The folder tab carries the plugin's mono name — the signature element.
 */
export function PluginCard({ plugin, locale = "en" }: { plugin: PluginSummary; locale?: Locale }) {
  const zh = locale === "zh-CN";
  return (
    <Card tab={plugin.name} className="h-full transition-colors hover:border-iris">
      <Link
        href={`/plugins/${plugin.slug}`}
        className="flex h-full flex-col gap-3 p-4 focus-visible:outline-none"
      >
        <p className="line-clamp-2 text-sm leading-relaxed text-gray-600">
          {plugin.description ?? (zh ? "清单中没有描述。" : "No description in manifest.")}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          {plugin.protocols.map((protocol) => (
            <Badge key={protocol} variant="neutral">
              {PROTOCOL_LABELS[protocol]}
            </Badge>
          ))}
          {plugin.skillCount > 0 ? (
            <Badge variant="skill">
              {zh ? `${plugin.skillCount} 个技能` : `${plugin.skillCount} skill${plugin.skillCount > 1 ? "s" : ""}`}
            </Badge>
          ) : null}
          {plugin.mcpCount > 0 ? (
            <Badge variant="mcp">
              {zh ? `${plugin.mcpCount} 个 MCP 服务器` : `${plugin.mcpCount} MCP server${plugin.mcpCount > 1 ? "s" : ""}`}
            </Badge>
          ) : null}
          {plugin.transports.map((t) => (
            <Badge key={t} mono variant={t === "stdio" ? "stdio" : t === "sse" ? "sse" : "http"}>
              {t}
            </Badge>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1 text-amber-700">
            <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 fill-current">
              <path d="M8 1.5l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.3l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.5z" />
            </svg>
            {formatNumber(plugin.repoStars, locale)}
          </span>
          <span title={plugin.indexedAt.toISOString()}>
            {zh ? `收录于${relativeTime(plugin.indexedAt, locale)}` : `indexed ${relativeTime(plugin.indexedAt, locale)}`}
          </span>
        </div>
      </Link>
    </Card>
  );
}
