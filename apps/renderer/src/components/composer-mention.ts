function posixPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

/** Exclude paths under system-prompt, src, output, node_modules (and nested node_modules). */
export function isHiddenFromMentionPicker(relPath: string): boolean {
  const n = posixPath(relPath);
  if (n.startsWith("node_modules/") || n === "node_modules") return true;
  if (n.includes("/node_modules/")) return true;
  const top = n.split("/")[0];
  if (!top) return false;
  if (
    top === "system-prompt" ||
    top === "src" ||
    top === "output" ||
    top === "node_modules"
  ) {
    return true;
  }
  return false;
}

/** Compositions first; other allowed files after (excluding hidden paths). */
export function pathPriorityForMention(relPath: string): number {
  const n = posixPath(relPath);
  if (n.startsWith("compositions/")) return 0;
  return 1;
}

export function prepareMentionFileList(paths: string[]): string[] {
  const out = paths.filter((p) => !isHiddenFromMentionPicker(p));
  out.sort((a, b) => {
    const pa = pathPriorityForMention(a);
    const pb = pathPriorityForMention(b);
    if (pa !== pb) return pa - pb;
    return posixPath(a).localeCompare(posixPath(b));
  });
  return out;
}

/**
 * UI label: immediate parent + file name (`parent/filename`).
 * Single-segment paths stay as-is.
 */
export function formatMentionDisplayPath(relPath: string): string {
  const n = posixPath(relPath);
  const parts = n.split("/").filter(Boolean);
  if (parts.length <= 1) return n;
  const parent = parts[parts.length - 2]!;
  const file = parts[parts.length - 1]!;
  return `${parent}/${file}`;
}

/** @-mention of a project file; `start` is the index of `@`. */
export function getAtMentionState(
  value: string,
  cursor: number
): { start: number; query: string } | null {
  if (cursor < 1) return null;
  const before = value.slice(0, cursor);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0) {
    const prev = before[at - 1]!;
    if (!/[\s\n/(]/.test(prev)) return null;
  }
  const segment = before.slice(at, cursor);
  if (segment.length < 1) return null;
  if (/\s/.test(segment.slice(1))) return null;
  return { start: at, query: segment.slice(1) };
}

export function filterProjectFilesForMention(
  paths: string[],
  query: string,
  limit = 50
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return paths.slice(0, limit);
  const scored = paths
    .map((p) => {
      const pl = posixPath(p).toLowerCase();
      const label = formatMentionDisplayPath(p).toLowerCase();
      const basename = p.includes("/") ? pl.slice(pl.lastIndexOf("/") + 1) : pl;
      let score = 0;
      if (pl.startsWith(q)) score = 100;
      else if (label.startsWith(q)) score = 88;
      else if (basename.startsWith(q)) score = 86;
      else if (pl.includes(`/${q}`) || pl.endsWith(q)) score = 60;
      else if (label.includes(q)) score = 55;
      else if (pl.includes(q)) score = 40;
      else return null;
      if (basename.startsWith(q)) score += 20;
      score += (1 - pathPriorityForMention(p)) * 10;
      return { p, score };
    })
    .filter((x): x is { p: string; score: number } => x !== null);
  scored.sort((a, b) => b.score - a.score || posixPath(a.p).localeCompare(posixPath(b.p)));
  return scored.map((s) => s.p).slice(0, limit);
}

export function insertAtMentionReplacement(
  value: string,
  cursor: number,
  mentionStart: number,
  relativePath: string
): { value: string; cursor: number } {
  const before = value.slice(0, mentionStart);
  const after = value.slice(cursor);
  const insertion = `@${relativePath} `;
  const next = before + insertion + after;
  const nextCursor = before.length + insertion.length;
  return { value: next, cursor: nextCursor };
}
