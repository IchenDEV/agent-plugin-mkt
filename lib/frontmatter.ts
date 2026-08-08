import { parse as parseYaml } from "yaml";

/**
 * Extract YAML frontmatter from a SKILL.md body. Returns null when there is
 * no well-formed frontmatter block — callers treat that as an invalid skill
 * and skip it (non-fatal, per the Agent Plugins spec).
 */
export function parseFrontmatter(
  content: string
): { data: Record<string, unknown>; body: string } | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!match) return null;
  try {
    const data = parseYaml(match[1]);
    if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
    return { data: data as Record<string, unknown>, body: content.slice(match[0].length) };
  } catch {
    return null;
  }
}
