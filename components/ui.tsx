import type { ReactNode } from "react";

// Shared primitives per DESIGN.md. Server-safe (no hooks).

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

/**
 * The signature "manifest card": a surface panel with an optional folder-style
 * tab riding its top edge (mono text, e.g. the plugin name).
 */
export function Card({
  tab,
  children,
  className = "",
}: {
  tab?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={tab ? "pt-3" : ""}>
      <div
        className={`relative rounded-lg border border-gray-200 bg-surface ${tab ? "rounded-tl-none" : ""} ${className}`}
      >
        {tab ? (
          <span className="absolute -top-[27px] left-[-1px] inline-block max-w-[85%] truncate rounded-t-md border border-b-0 border-gray-200 bg-surface px-3 py-1 font-mono text-xs text-gray-600">
            {tab}
          </span>
        ) : null}
        {children}
      </div>
    </div>
  );
}

const badgeVariants = {
  skill: "bg-iris-soft text-iris-deep",
  mcp: "bg-teal-50 text-teal-700",
  stdio: "bg-gray-100 text-gray-600",
  http: "bg-teal-50 text-teal-700",
  sse: "bg-amber-50 text-amber-700",
  neutral: "bg-gray-100 text-gray-600",
} as const;

export type BadgeVariant = keyof typeof badgeVariants;

export function transportBadgeVariant(transport: string): BadgeVariant {
  if (transport === "stdio") return "stdio";
  if (transport === "streamable-http") return "http";
  if (transport === "sse") return "sse";
  return "neutral";
}

export function Badge({
  variant = "neutral",
  mono = false,
  children,
}: {
  variant?: BadgeVariant;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${mono ? "font-mono" : ""} ${badgeVariants[variant]}`}
    >
      {children}
    </span>
  );
}

export function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{label}</p>
    </div>
  );
}

/**
 * GET-form search input. Submits to `action` with the query in `?q=`.
 * Extra hidden params can be passed to preserve active filters.
 */
export function SearchInput({
  action = "/plugins",
  defaultValue = "",
  placeholder = "Search plugins, skills, MCP servers…",
  submitLabel = "Search",
  hidden = {},
  autoFocus = false,
}: {
  action?: string;
  defaultValue?: string;
  placeholder?: string;
  submitLabel?: string;
  hidden?: Record<string, string | string[]>;
  autoFocus?: boolean;
}) {
  return (
    <form action={action} role="search" className="relative flex w-full">
      {Object.entries(hidden).flatMap(([name, value]) =>
        (Array.isArray(value) ? value : [value]).map((item) => (
          <input key={`${name}-${item}`} type="hidden" name={name} value={item} />
        )),
      )}
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        fill="none"
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 stroke-gray-400"
      >
        <circle cx="9" cy="9" r="6" strokeWidth="1.6" />
        <path d="m13.5 13.5 3 3" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full rounded-lg border border-gray-200 bg-surface py-2.5 pl-10 pr-24 text-sm shadow-sm placeholder:text-gray-400"
      />
      <button
        type="submit"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md bg-action px-3.5 py-1.5 text-xs font-semibold text-on-action hover:bg-iris"
      >
        {submitLabel}
      </button>
    </form>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-surface px-6 py-16 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">{hint}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
