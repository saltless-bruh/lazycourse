import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { completeJson, type Complete } from "../llm.js";
import { systemText } from "../prompts.js";
import { Cancelled } from "../progress.js";
import { cap, toText } from "./text.js";
import type { Topic } from "./sources.js";

// knowledge/fetch.ts (spec §7, §9): source lists → one skill per topic with references/*.md.
export interface FetchDeps { fetch: typeof fetch; complete: Complete; root: string; signal?: AbortSignal; timeoutMs?: number }
export interface FetchResult { written: string[]; failed: string[] }

interface Ref { file: string; url: string; text: string }

export function skillsRoot(): string {
  return join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), "skills");
}

export function skillName(language: string, slug: string): string {
  return `tutor-${language}-${slug}`;
}

export function cachedSkills(root: string, language: string): string[] {
  if (!existsSync(root)) return [];
  const prefix = `tutor-${language}-`;
  return readdirSync(root)
    .filter((n) => n.startsWith(prefix) && !n.startsWith(`${prefix}learned-`) && existsSync(join(root, n, "SKILL.md")))
    .sort();
}

function refFile(i: number, url: string): string {
  const base = decodeURIComponent(new URL(url).pathname.split("/").pop() || "doc").replace(/\.(rst|html?|md|txt)$/i, "");
  return `${i + 1}-${base.replace(/[^A-Za-z0-9._-]+/g, "-").toLowerCase() || "doc"}.md`;
}

async function download(url: string, d: FetchDeps): Promise<string> {
  const timeout = AbortSignal.timeout(d.timeoutMs ?? 30_000);
  const signal = d.signal ? AbortSignal.any([d.signal, timeout]) : timeout;
  const res = await d.fetch(url, { signal, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return cap(toText(await res.text(), url, res.headers.get("content-type") ?? ""));
}

function describePrompt(language: string, topics: { topic: Topic; refs: Ref[] }[]): string {
  return [`language: ${language}`, ...topics.map(({ topic, refs }) => `\n## ${topic.slug}: ${topic.title}\n${refs[0].text.slice(0, 1500)}`)].join("\n");
}

function checkDescriptions(slugs: string[]) {
  return (v: unknown): Record<string, string> => {
    const list = (v as { skills?: unknown } | null)?.skills;
    if (!Array.isArray(list)) throw new Error('reply must be {"skills":[…]}');
    const out: Record<string, string> = {};
    for (const e of list) {
      const o = (e ?? {}) as { slug?: unknown; description?: unknown };
      if (typeof o.slug === "string" && typeof o.description === "string" && o.description.trim()) {
        out[o.slug] = o.description.replace(/\s+/g, " ").trim().slice(0, 1024);
      }
    }
    const missing = slugs.filter((s) => !(s in out));
    if (missing.length) throw new Error(`missing descriptions for ${missing.join(", ")}`);
    return out;
  };
}

function skillText(name: string, description: string, title: string, refs: Ref[]): string {
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n# ${title}\n\n` +
    `Fetched reference text for the tutor. Read the files below for the full text, and name this skill (\`${name}\`) when you point the learner at it.\n\n` +
    refs.map((r) => `- \`references/${r.file}\` — from ${r.url}\n`).join("");
}

/** Build each skill in a temp sibling, then swap it in, so a failure never leaves half a skill. */
function writeSkill(root: string, name: string, text: string, refs: Ref[]): void {
  const dir = join(root, name);
  const tmp = `${dir}.tmp-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, "references"), { recursive: true });
  for (const r of refs) writeFileSync(join(tmp, "references", r.file), r.text + "\n");
  writeFileSync(join(tmp, "SKILL.md"), text);
  rmSync(dir, { recursive: true, force: true });
  renameSync(tmp, dir);
}

export async function fetchKnowledge(language: string, topics: Topic[], d: FetchDeps): Promise<FetchResult> {
  const failed: string[] = [];
  const fetched: { topic: Topic; refs: Ref[] }[] = [];
  for (const topic of topics) {
    const refs: Ref[] = [];
    for (const [i, url] of topic.urls.entries()) {
      try {
        refs.push({ file: refFile(i, url), url, text: await download(url, d) });
      } catch (e) {
        if (d.signal?.aborted) throw new Cancelled();
        const reason = e instanceof Error && e.name === "TimeoutError" ? "timed out" : e instanceof Error ? e.message : String(e);
        failed.push(`${url}: ${reason}`);
      }
    }
    if (refs.length) fetched.push({ topic, refs });
  }
  if (fetched.length === 0) return { written: [], failed };
  const descriptions = await completeJson(d.complete, systemText("skill-describe"), describePrompt(language, fetched), checkDescriptions(fetched.map((f) => f.topic.slug)));
  if (d.signal?.aborted) throw new Cancelled();
  mkdirSync(d.root, { recursive: true });
  const written: string[] = [];
  for (const { topic, refs } of fetched) {
    const name = skillName(language, topic.slug);
    writeSkill(d.root, name, skillText(name, descriptions[topic.slug], topic.title, refs), refs);
    written.push(name);
  }
  return { written, failed };
}
