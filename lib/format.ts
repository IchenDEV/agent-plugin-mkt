import type { Locale } from "@/lib/i18n";

/**
 * Remove ASCII control characters (C0 range + DEL) from untrusted text that
 * is destined for a terminal, log line, or the clipboard — newlines and ANSI
 * escape sequences in indexed repo paths must never reach those sinks.
 */
export function stripControlChars(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && code !== 0x7f) out += ch;
  }
  return out;
}

export function formatNumber(n: number, locale: Locale = "en"): string {
  if (locale === "zh-CN" && n >= 10_000) {
    return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);
  }
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

export function formatDate(date: Date | string | null, locale: Locale = "en"): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale === "zh-CN" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function relativeTime(date: Date | string | null, locale: Locale = "en"): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (Number.isNaN(seconds) || seconds < 0) return formatDate(d, locale);
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [31536000, "year"],
    [2592000, "month"],
    [604800, "week"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [size, unit] of units) {
    const value = Math.floor(seconds / size);
    if (value >= 1) return formatter.format(-value, unit);
  }
  return formatter.format(0, "second");
}
