import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Language packs (spec 2026-10-13 §5, §5.4): pi-tutor/packs/<lang>/card.md holds the always-on card
// and the controlled concept-tag vocabulary the judgment block may use (gap #5).
const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "packs");

export interface Tag { tag: string; meaning: string; aliases: string[] }
export interface Pack { language: string; body: string; tags: Tag[] }
export type Vocab = Map<string, string>;

const TAGS_HEADING = /^## Concept tags[ \t]*$/m;
const TAG_LINE = /^- `([^`]+)`:\s*(.*?)(?:\s*\(aliases:\s*([^)]*)\))?\s*$/;

export function normalizeTag(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

export function parsePack(language: string, text: string): Pack {
  const m = TAGS_HEADING.exec(text);
  const body = (m ? text.slice(0, m.index) : text).trim();
  const tags: Tag[] = [];
  if (m) for (const line of text.slice(m.index + m[0].length).split(/\r?\n/)) {
    const t = TAG_LINE.exec(line.trim());
    if (t) tags.push({ tag: normalizeTag(t[1]), meaning: t[2].trim(), aliases: t[3] ? t[3].split(",").map(normalizeTag).filter(Boolean) : [] });
  }
  return { language, body, tags };
}

const cache = new Map<string, Pack | null>();

export function loadPack(language: string): Pack | null {
  if (!cache.has(language)) {
    const f = join(DIR, language, "card.md");
    cache.set(language, /^[a-z0-9-]+$/.test(language) && existsSync(f) ? parsePack(language, readFileSync(f, "utf8")) : null);
  }
  return cache.get(language)!;
}

export interface IndexEntry { step: string; idiom: string }

/** Each cookbook recipe's step id and its one-line `index:` idiom (the card's always-on index). */
export function cookbookIndex(text: string): IndexEntry[] {
  const out: IndexEntry[] = [];
  for (const sec of text.split(/^## /m).slice(1)) {
    const step = /^([\w-]+):/.exec(sec)?.[1];
    const idiom = /^index: (.+)$/m.exec(sec)?.[1].trim();
    if (step && idiom) out.push({ step, idiom });
  }
  return out;
}

/** Real tags first, then aliases: an alias in one pack never shadows a real tag in another. */
export function vocabOf(...packs: (Pack | null)[]): Vocab | null {
  const v: Vocab = new Map();
  for (const p of packs) for (const t of p?.tags ?? []) if (!v.has(t.tag)) v.set(t.tag, t.tag);
  for (const p of packs) for (const t of p?.tags ?? []) for (const a of t.aliases) if (!v.has(a)) v.set(a, t.tag);
  return v.size ? v : null;
}

/** Judgment tags in the pack's vocabulary: aliases mapped, unknown dropped; no vocabulary → only normalized. */
export function normalizeTags(tags: string[], vocab: Vocab | null): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const n = normalizeTag(raw);
    const t = vocab ? vocab.get(n) : n || undefined;
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}
