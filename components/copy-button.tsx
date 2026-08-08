"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (permissions / insecure context); leave label as-is.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-live="polite"
      className="shrink-0 rounded-md border border-gray-200 bg-surface px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-iris hover:text-iris"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
