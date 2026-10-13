import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Cancelled } from "../progress.js";
import { buildReference, chooseBundle, referenceSkill, type CatalogEntry, type DevdocsIndex } from "./devdocs.js";

// Download a DevDocs bundle into ~/.pi/agent/skills/tutor-<lang>-ref (spec 2026-10-13 §5.2).
/**
 * Version of the SKILL.md wording. Bump it when referenceSkill's text changes: existing skills on
 * disk then get their SKILL.md rewritten from the small index, without re-downloading the bundle.
 */
export const SKILL_FORMAT = 2;

export interface RefMeta { slug: string; release: string; mtime: number; installed: string | null; note: string; format?: number }
export interface RefDeps { fetch: typeof fetch; root: string; installed: string | null; devdocsType: string; override?: string; force?: boolean; signal?: AbortSignal; timeoutMs?: number }
/** `refreshed`: same bundle, but the installed version changed, so only SKILL.md and the meta were rewritten. */
export interface RefResult {
  status: "fetched" | "cached" | "refreshed"; name: string; meta: RefMeta; entries: number;
  /** DevDocs could not be reached: the docs on disk are used unchecked (M6c M4). */
  offline?: boolean;
}

export function skillsRoot(): string {
  return join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), "skills");
}

/** PI_TUTOR_DEVDOCS: one base URL serving docs.json and <slug>/{index,db}.json (offline mirror; tests). */
export function devdocsUrls(): { catalog: string; documents: string } {
  const b = process.env.PI_TUTOR_DEVDOCS?.replace(/\/+$/, "");
  return b ? { catalog: `${b}/docs.json`, documents: b } : { catalog: "https://devdocs.io/docs.json", documents: "https://documents.devdocs.io" };
}

export function referenceInfo(root: string, language: string): RefMeta | null {
  try { return JSON.parse(readFileSync(join(root, `tutor-${language}-ref`, ".devdocs.json"), "utf8")) as RefMeta; } catch { return null; }
}

async function getJson<T>(url: string, d: RefDeps): Promise<T> {
  const timeout = AbortSignal.timeout(d.timeoutMs ?? 300_000);
  const signal = d.signal ? AbortSignal.any([d.signal, timeout]) : timeout;
  try {
    const res = await d.fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return (await res.json()) as T;
  } catch (e) {
    if (d.signal?.aborted) throw new Cancelled();
    if (e instanceof Error && e.name === "TimeoutError") throw new Error(`timed out fetching ${url}`);
    throw e;
  }
}

export async function fetchReference(language: string, d: RefDeps): Promise<RefResult> {
  const urls = devdocsUrls();
  let catalog: CatalogEntry[];
  try { catalog = await getJson<CatalogEntry[]>(urls.catalog, d); } catch (e) {
    // M5-finish #43: offline with docs on disk keeps using them; a forced refresh still fails loudly.
    const prev = referenceInfo(d.root, language);
    if (e instanceof Cancelled || d.force || !prev) throw e;
    return { status: "cached", name: `tutor-${language}-ref`, meta: prev, entries: 0, offline: true };
  }
  const choice = chooseBundle(catalog, d.devdocsType, d.installed, d.override);
  if (!choice) throw new Error(`DevDocs has no ${language} documentation`);
  const name = `tutor-${language}-ref`;
  const meta: RefMeta = { slug: choice.entry.slug, release: choice.entry.release, mtime: choice.entry.mtime, installed: d.installed, note: choice.note, format: SKILL_FORMAT };
  const prev = referenceInfo(d.root, language);
  if (!d.force && prev && prev.slug === meta.slug && prev.mtime === meta.mtime) {
    if (prev.installed === meta.installed && prev.note === meta.note && prev.format === SKILL_FORMAT) return { status: "cached", name, meta: prev, entries: 0 };
    // Same docs, different installed version: rewrite the note from the small index, keep references/.
    const small = await getJson<DevdocsIndex>(`${urls.documents}/${choice.entry.slug}/index.json?${choice.entry.mtime}`, d);
    const dir = join(d.root, name);
    writeFileSync(join(dir, "SKILL.md"), referenceSkill(language, choice, d.installed, small));
    writeFileSync(join(dir, ".devdocs.json"), `${JSON.stringify(meta, null, 2)}\n`);
    return { status: "refreshed", name, meta, entries: 0 };
  }

  const docs = `${urls.documents}/${choice.entry.slug}`;
  const index = await getJson<DevdocsIndex>(`${docs}/index.json?${choice.entry.mtime}`, d);
  const db = await getJson<Record<string, string>>(`${docs}/db.json?${choice.entry.mtime}`, d);
  const built = await buildReference(index, db, { signal: d.signal });
  if (d.signal?.aborted) throw new Cancelled();

  installSkillDir(d.root, name, (tmp) => {
    for (const f of built.files) {
      mkdirSync(dirname(join(tmp, f.path)), { recursive: true });
      writeFileSync(join(tmp, f.path), f.text);
    }
    writeFileSync(join(tmp, "INDEX.md"), built.index);
    writeFileSync(join(tmp, "SKILL.md"), referenceSkill(language, choice, d.installed, index));
    writeFileSync(join(tmp, ".devdocs.json"), `${JSON.stringify(meta, null, 2)}\n`);
  });
  return { status: "fetched", name, meta, entries: built.entries };
}

/**
 * Atomic install of a skill folder (M5-finish #44): write into a dot temp sibling (Pi skips dot
 * entries), move the old folder aside, swap the new one in, then drop the old. A failed write
 * removes the temp folder and leaves the old skill untouched.
 */
export function installSkillDir(root: string, name: string, write: (dir: string) => void): void {
  const dir = join(root, name);
  const tmp = join(root, `.${name}.tmp-${process.pid}`);
  const old = join(root, `.${name}.old-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  try { write(tmp); } catch (e) { rmSync(tmp, { recursive: true, force: true }); throw e; }
  rmSync(old, { recursive: true, force: true });
  if (existsSync(dir)) renameSync(dir, old);
  try { renameSync(tmp, dir); } catch (e) {
    // M6c M5: a failed swap puts the old skill back rather than leaving it in a dot folder Pi skips.
    if (existsSync(old)) renameSync(old, dir);
    rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
  rmSync(old, { recursive: true, force: true });
}
