"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  errorLabel = "Copy failed",
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  errorLabel?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
    setTimeout(() => setStatus("idle"), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-live="polite"
      className="shrink-0 rounded-md border border-gray-200 bg-surface px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-iris hover:text-iris"
    >
      {status === "copied" ? copiedLabel : status === "error" ? errorLabel : label}
    </button>
  );
}
