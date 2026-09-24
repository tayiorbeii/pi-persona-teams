// Relative markdown link extraction shared by the vendored-skills importer
// and its offline integrity gate. Fenced and inline code are ignored;
// external schemes and pure anchors are skipped; anchors/queries stripped.

export function relativeMarkdownLinks(content: string): string[] {
  const stripped = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "");
  const links: string[] = [];
  for (const match of stripped.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue;
    const clean = target.split("#")[0].split("?")[0];
    if (clean.length > 0) links.push(clean);
  }
  return links;
}
