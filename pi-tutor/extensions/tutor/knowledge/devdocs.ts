import { htmlToText } from "./text.js";
import { Cancelled } from "../progress.js";

// DevDocs bundles → a tutor-<lang>-ref skill (spec 2026-10-13 §5.2). Pure apart from yielding.
export interface CatalogEntry { name: string; slug: string; type: string; version: string; release: string; mtime: number; db_size: number; attribution: string }
export interface IndexEntry { name: string; path: string; type: string }
export interface DevdocsIndex { entries: IndexEntry[]; types: { name: string; count: number; slug: string }[] }
export interface Choice { entry: CatalogEntry; exact: boolean; note: string }
export interface Built { files: { path: string; text: string }[]; index: string; entries: number }

export const CHUNK_CHARS = 60_000;
const ANCHOR = /\b(?:id|name)="([^"]+)"/g;

function majorMinor(v: string): [number, number] | null {
  const m = /^(\d+)\.(\d+)/.exec(v);
  return m ? [Number(m[1]), Number(m[2])] : null;
}
function compare(a: [number, number], b: [number, number]): number {
  return a[0] - b[0] || a[1] - b[1];
}
function newest(list: CatalogEntry[]): CatalogEntry {
  return [...list].sort((x, y) => compare(majorMinor(y.release) ?? [0, 0], majorMinor(x.release) ?? [0, 0]))[0];
}

export function chooseBundle(catalog: CatalogEntry[], devdocsType: string, installed: string | null, override?: string): Choice | null {
  if (override) {
    const pinned = catalog.find((c) => c.slug === override);
    return pinned ? { entry: pinned, exact: false, note: `docs pinned to ${override} by sources.json` } : null;
  }
  const candidates = catalog.filter((c) => c.type === devdocsType);
  if (candidates.length === 0) return null;
  const want = installed ? majorMinor(installed) : null;
  if (!want) {
    const n = newest(candidates);
    return { entry: n, exact: false, note: `${devdocsType} not detected; using the newest docs (${n.release})` };
  }
  const exact = candidates.find((c) => { const v = majorMinor(c.release); return !!v && compare(v, want) === 0; });
  if (exact) return { entry: exact, exact: true, note: "" };
  const lower = candidates.filter((c) => { const v = majorMinor(c.release); return !!v && compare(v, want) < 0; });
  if (lower.length) {
    const l = newest(lower);
    return { entry: l, exact: false, note: `docs ${l.release} for installed ${installed} (nearest lower; newer features may be missing)` };
  }
  const n = newest(candidates);
  return { entry: n, exact: false, note: `docs ${n.release} are newer than installed ${installed}: check that an item exists in ${installed} before teaching it` };
}

/** Split before <h1>-<h3> and pack sections into chunks of at most `max` HTML characters. */
export function splitHtml(html: string, max = CHUNK_CHARS): string[] {
  const out: string[] = [];
  let cur = "";
  for (const part of html.split(/(?=<h[1-3][\s>])/i)) {
    if (cur && cur.length + part.length > max) { out.push(cur); cur = ""; }
    cur += part;
  }
  if (cur || out.length === 0) out.push(cur);
  return out;
}

function safeName(page: string): string {
  return page.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "page";
}

export async function buildReference(index: DevdocsIndex, db: Record<string, string>, opts: { signal?: AbortSignal; yieldEvery?: number } = {}): Promise<Built> {
  const files: Built["files"] = [];
  const anchorFile = new Map<string, string>();
  const firstFile = new Map<string, string>();
  const used = new Set<string>();
  let n = 0;
  for (const [page, html] of Object.entries(db)) {
    if (++n % (opts.yieldEvery ?? 25) === 0) {
      await new Promise((r) => setImmediate(r)); // keep Pi's UI responsive on 70 MB bundles
      if (opts.signal?.aborted) throw new Cancelled();
    }
    const chunks = splitHtml(html);
    let base = safeName(page);
    while (used.has(base)) base += "_";
    used.add(base);
    chunks.forEach((chunk, i) => {
      const path = `references/${base}${chunks.length > 1 ? `.${i + 1}` : ""}.md`;
      files.push({ path, text: `${htmlToText(chunk)}\n` });
      if (i === 0) firstFile.set(page, path);
      for (const m of chunk.matchAll(ANCHOR)) {
        const key = `${page}#${m[1]}`;
        if (!anchorFile.has(key)) anchorFile.set(key, path);
      }
    });
  }
  if (opts.signal?.aborted) throw new Cancelled();
  const byType = new Map<string, string[]>();
  for (const entry of index.entries) {
    const file = anchorFile.get(entry.path) ?? firstFile.get(entry.path.split("#")[0]);
    if (!file) continue;
    const list = byType.get(entry.type) ?? [];
    list.push(`- ${entry.name} → ${file}`);
    byType.set(entry.type, list);
  }
  const lines = ["# Index", "", "grep this file for a name, then read the file it points to.", ""];
  for (const [type, list] of [...byType].sort((a, b) => a[0].localeCompare(b[0]))) lines.push(`## ${type}`, ...list, "");
  return { files, index: lines.join("\n"), entries: [...byType.values()].reduce((s, l) => s + l.length, 0) };
}

export function referenceSkill(language: string, c: Choice, installed: string | null, index: DevdocsIndex): string {
  const name = `tutor-${language}-ref`;
  const topics = index.types.slice(0, 8).map((t) => t.name).join(", ") + (index.types.length > 8 ? ", …" : "");
  const description = `${c.entry.name} ${c.entry.release} reference from DevDocs (${topics}). Use when you need exact API or language details for ${language}, or to cite documentation in a hint.`.slice(0, 1024);
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n# ${c.entry.name} ${c.entry.release} reference\n\n` +
    `Installed ${language}: ${installed ?? "not detected"}.${c.note ? ` Note: ${c.note}.` : ""}\n\n` +
    "How to look something up:\n" +
    "1. `grep` INDEX.md in this folder for the name (a function, type, module or keyword).\n" +
    "2. `read` the file it points to.\n" +
    `3. In your hint, cite this skill (\`${name}\`) and the entry name.\n\n` +
    `Source: DevDocs \`${c.entry.slug}\`. ${htmlToText(c.entry.attribution).replace(/\s+/g, " ")}\n`;
}
