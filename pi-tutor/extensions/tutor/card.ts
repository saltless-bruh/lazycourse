import type { IndexEntry, Pack } from "./packs.js";
import type { Toolchain } from "./knowledge/versions.js";
import type { RefMeta } from "./knowledge/reference.js";

// The always-on language card (spec 2026-10-13 §5): live header (version, constraint, reference,
// skills, other languages the learner knows) + the pack body + its concept tags. ≤ 600 tokens (gap #2).
/** `skillsDir`: where the bundled skills live, so the model reads the real file instead of guessing a path. */
export interface CardInfo { tc: Toolchain; ref: RefMeta | null; knows: string[]; skills: string[]; skillsDir?: string }

const NAMES: Record<string, string> = { python: "Python", rust: "Rust", go: "Go", typescript: "TypeScript", lua: "Lua" };
// When to open each skill, in the learner's words (skill-eval iteration 1: opened 2/14 times).
const SKILL_ROLE: Record<string, (name: string) => string> = {
  cookbook: (name) => `for "how do I … in ${name}?" (find the plain step, show its example)`,
  expert: () => `for review, "is this idiomatic?" or a concept beyond one idiom`,
};
const majorMinor = (v: string) => /^(\d+\.\d+)/.exec(v)?.[1] ?? v;
const tagLine = (p: Pack) => (p.tags.length ? `Tags: ${p.tags.map((t) => `\`${t.tag}\` ${t.meaning}`).join(" · ")}` : "");

export function renderCard(pack: Pack, info: CardInfo): string {
  const lang = pack.language, name = NAMES[lang] ?? lang;
  const { installed, runtime, constraint } = info.tc;
  const have = installed ? `${name} ${installed}`
    : runtime ? `${lang === "typescript" ? "tsc" : name} not installed · runtime ${runtime}`
    : "not installed (from the language's version command)";
  const lines = [`[language card: ${lang}]`, `Installed: ${have}${constraint ? ` · project: ${constraint}` : ""}`];
  if (info.ref) {
    const refVer = /~(\d+\.\d+)/.exec(info.ref.slug)?.[1] ?? info.ref.release;
    let r = `Reference: \`tutor-${lang}-ref\` for ${info.ref.slug}; cite it.`;
    if (installed && refVer && majorMinor(refVer) !== majorMinor(installed)) {
      r += ` The reference is for ${majorMinor(refVer)} but ${majorMinor(installed)} is installed: say so when it matters.`;
    }
    lines.push(r);
  } else lines.push(`Reference: none yet; suggest \`:TutorDocs ${lang}\`.`);
  const skills = info.skills.map((s) => `\`${s}\` ${SKILL_ROLE[s.split("-").at(-1) ?? ""]?.(name) ?? "(see its description)"}`);
  if (skills.length) {
    const where = info.skillsDir ? ` in ${info.skillsDir}` : "";
    lines.push(`Skills${where} (read <name>/SKILL.md before you answer when one fits): ${skills.join("; ")}`);
  }
  const knows = info.knows.filter((l) => l !== lang);
  if (knows.length) lines.push(`Learner also knows: ${knows.join(", ")}. Use the cookbook's Bridge lines.`);
  if (pack.tags.length) lines.push("Concept tags: use only the tags listed below in the judgment block.");
  return [...lines, pack.body, tagLine(pack)].filter(Boolean).join("\n");
}

/**
 * The always-on index (skill-eval iterations 1-2: the model opened a pack skill 3/28 times; Vercel's
 * evals: a compressed index in always-on context beat on-demand skills). One line of recipes pointing
 * at the cookbook, one line pointing at the expert. Own allowance: ≤ 250 tokens.
 * `expertRefs`: the expert's references/ file names, or null when there is no expert skill.
 */
export function renderIndex(o: { language: string; dir: string; entries: IndexEntry[]; expertRefs: string[] | null }): string {
  const lines: string[] = [];
  if (o.entries.length) {
    // Side-agent note: an answer list on every turn invites leaks, so it says what the names are for.
    lines.push(`[index: ${o.language}] Prefer it over memory. Names to point at, not lines to write: below rung 5 never put one into the learner's code. Full examples: ${o.dir}/tutor-${o.language}-cookbook/SKILL.md, "## <step>".`);
    // First code span only, and no read-trace (it only points at tutor-stack-traces): fits 250 tokens.
    lines.push(o.entries.filter((e) => e.step !== "read-trace").map((e) => `${e.step} ${/`[^`]+`/.exec(e.idiom)?.[0] ?? e.idiom}`).join(" | "));
  }
  if (o.expertRefs) {
    const refs = o.expertRefs.map((f) => f.replace(/\.md$/, "")).sort();
    const where = o.entries.length ? `tutor-${o.language}-expert/SKILL.md in the same folder` : `${o.dir}/tutor-${o.language}-expert/SKILL.md`;
    lines.push(`Review or a concept: ${where} (checklist${refs.length ? `; references/: ${refs.join(", ")}` : ""}).`);
  }
  return lines.join("\n");
}

export function renderEditorCard(pack: Pack): string {
  return ["[editor card: LazyVim]", pack.body, tagLine(pack)].filter(Boolean).join("\n");
}
