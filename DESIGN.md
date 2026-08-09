# Agent Plugin Marketplace — Design System

Single source of truth for visual decisions. All UI work follows this; deviations need a stated reason.

## Concept

The subject is cross-runtime agent plugins: a plugin is a **self-contained directory** with a Codex and/or Claude Code manifest, `skills/`, and optional MCP configuration. The visual language borrows from that world — manifests, directory trees, component types — without cosplaying as a terminal. Light, technical, precise. The signature element is the **manifest card**: plugin cards render like tabbed file folders with a monospace name chip, and detail pages show the plugin's real directory tree.

## Palette

Defined as Tailwind v4 tokens in `app/globals.css` (`@theme`). Use utility classes, not raw hex.

| Token | Hex | Use |
|---|---|---|
| `porcelain` | `#F6F7F9` | Page background |
| `surface` | `#FFFFFF` | Cards, panels |
| `ink` | `#161A25` | Primary text, footer background |
| `iris` | `#5147E5` | Primary actions, links, **Skills** |
| `iris-soft` | `#EEEDFC` | Iris tint backgrounds (badges, hovers) |
| Tailwind `gray-500/600` | — | Muted text |
| Tailwind `gray-200` | — | Borders (`border-gray-200`) |
| Tailwind `teal-700` / `teal-50` | — | **MCP servers** |
| Tailwind `amber-700` / `amber-50` | — | Stars, `sse` transport |

**Component color system (structure is information):** Skills are always iris. MCP servers are always teal. Transports: `stdio` = gray, `streamable-http` = teal, `sse` = amber. Never use these hues decoratively elsewhere.

## Typography

Loaded via `next/font` in `app/layout.tsx`, exposed as CSS vars and Tailwind font tokens:

- **Display** — Bricolage Grotesque (`font-display`): headlines, stats numbers, section titles. Tight tracking, weights 600–800.
- **Body** — Instrument Sans (`font-sans`): everything else. Weights 400–600.
- **Mono** — JetBrains Mono (`font-mono`): plugin names, manifests, install commands, directory trees, transport badges.

Plugin names are always mono — they are identifiers, not prose.

## Layout

- Max width `max-w-6xl`, generous whitespace, `Container` component from `components/ui.tsx`.
- Home: left-aligned hero (display headline + search), stats row, featured grid, "anatomy of a plugin" directory-tree strip, API/MCP callout.
- Browse: filter rail (left, collapses on mobile) + card grid, pagination.
- Detail: header (mono name, version chip, badges), install block with copy button, sections for Skills / MCP servers / raw manifest, meta sidebar (repo, stars, license, updated).

## Components (`components/ui.tsx`)

Use these primitives; don't reinvent: `Container`, `Card` (folder-tab variant via `tab` prop), `Badge` (variants: `skill`, `mcp`, `stdio`, `http`, `sse`, `neutral`), `StatBlock`, `SearchInput`, `EmptyState`. `CopyButton` is in `components/copy-button.tsx` (client component).

## Voice

Sentence case everywhere. Plain verbs ("Browse plugins", "Copy install command"). Errors say what happened and what to do next. Empty states invite action ("No plugins match — clear filters or try a broader term."). Never marketing-speak ("supercharge", "unleash"). The audience is developers; be specific, cite the spec.

## Quality floor

Responsive to 360px. Visible keyboard focus (`focus-visible` rings, iris). `prefers-reduced-motion` respected — motion is subtle or absent; no scroll-jacking. Light theme only in v1 (deliberate). All data rendered as text — never `dangerouslySetInnerHTML` on indexed content.
