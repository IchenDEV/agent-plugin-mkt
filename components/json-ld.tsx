type JsonLdValue = Record<string, unknown> | Record<string, unknown>[];

/** Serialize JSON-LD without allowing indexed text to terminate the script element. */
function serializeJsonLd(data: JsonLdValue): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function JsonLd({ data }: { data: JsonLdValue }) {
  return <script type="application/ld+json">{serializeJsonLd(data)}</script>;
}
