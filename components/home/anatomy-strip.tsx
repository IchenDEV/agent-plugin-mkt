import { Card, Container } from "@/components/ui";

const SPEC_URL = "https://developers.openai.com/plugins/build/plugins";

// Component color system per DESIGN.md: skills are always iris, MCP always teal.
type Tone = "root" | "skill" | "mcp";

const toneClass: Record<Tone, string> = {
  root: "font-medium text-ink",
  skill: "text-iris",
  mcp: "text-teal-700",
};

interface TreeLine {
  /** Box-drawing prefix, rendered muted. Preserved by whitespace-pre. */
  glyph?: string;
  name: string;
  tone: Tone;
  /** Trailing comment, includes its own alignment padding; hidden on small screens. */
  note?: string;
}

const TREE: TreeLine[] = [
  { name: ".codex-plugin/plugin.json", tone: "root", note: " # Codex manifest" },
  { name: ".claude-plugin/plugin.json", tone: "root", note: " # Claude Code manifest" },
  { name: "skills/", tone: "skill" },
  { glyph: "├── ", name: "code-review/", tone: "skill" },
  { glyph: "│   └── ", name: "SKILL.md", tone: "skill", note: "   # instructions for one skill" },
  { glyph: "└── ", name: "write-tests/", tone: "skill" },
  { glyph: "    └── ", name: "SKILL.md", tone: "skill" },
  { name: ".mcp.json", tone: "mcp", note: "          # MCP server configuration" },
];

/**
 * Static two-column band: what the spec says a plugin is, next to a rendered
 * example directory tree in the signature folder-tab card.
 */
export function AnatomyStrip() {
  return (
    <section className="border-y border-gray-200 bg-surface">
      <Container className="grid items-center gap-10 py-14 sm:py-16 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
            Know what’s inside a plugin
          </h2>
          <p className="mt-4 max-w-prose text-sm leading-relaxed text-gray-600 sm:text-[15px]">
            A plugin is a folder with a Codex and/or Claude Code manifest, skills under{" "}
            <code className="rounded bg-porcelain px-1 py-0.5 font-mono text-[0.85em]">
              skills/&lt;name&gt;/SKILL.md
            </code>
            , and optional MCP server configuration in{" "}
            <code className="rounded bg-porcelain px-1 py-0.5 font-mono text-[0.85em]">.mcp.json</code>.
          </p>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-gray-600 sm:text-[15px]">
            Review these files and the repository instructions before installing the plugin.
          </p>
          <a
            href={SPEC_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-iris transition-colors hover:text-iris-deep"
          >
            Read the Codex plugin documentation <span aria-hidden>→</span>
          </a>
        </div>
        <Card tab="hello-plugin/" className="shadow-sm">
          <div className="overflow-x-auto p-5">
            <p className="sr-only">Example plugin directory layout</p>
            <div aria-hidden className="whitespace-pre font-mono text-[13px] leading-6">
              {TREE.map((line, i) => (
                <div key={i}>
                  {line.glyph ? <span className="text-gray-300">{line.glyph}</span> : null}
                  <span className={toneClass[line.tone]}>{line.name}</span>
                  {line.note ? (
                    <span className="hidden text-gray-400 md:inline">{line.note}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </Card>
      </Container>
    </section>
  );
}
