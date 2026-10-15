import type { Pack } from "./packs.js";
import type { Toolchain } from "./knowledge/versions.js";
import type { RefMeta } from "./knowledge/reference.js";

// The always-on language card (spec 2026-10-13 §5): live header (version, constraint, reference,
// skills, other languages the learner knows) + the pack body + its concept tags. ≤ 600 tokens (gap #2).
export interface CardInfo { tc: Toolchain; ref: RefMeta | null; knows: string[]; skills: string[] }

const NAMES: Record<string, string> = { python: "Python", rust: "Rust", go: "Go", typescript: "TypeScript", lua: "Lua" };
const SKILL_ROLE: Record<string, string> = { cookbook: "plain step → idiom", expert: "patterns, pitfalls, review" };
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
  const skills = info.skills.map((s) => `\`${s}\` (${SKILL_ROLE[s.split("-").at(-1) ?? ""] ?? "see its description"})`);
  if (skills.length) lines.push(`Skills: ${skills.join(", ")}`);
  const knows = info.knows.filter((l) => l !== lang);
  if (knows.length) lines.push(`Learner also knows: ${knows.join(", ")}. Use the cookbook's Bridge lines.`);
  if (pack.tags.length) lines.push("Concept tags: use only the tags listed below in the judgment block.");
  return [...lines, pack.body, tagLine(pack)].filter(Boolean).join("\n");
}

export function renderEditorCard(pack: Pack): string {
  return ["[editor card: LazyVim]", pack.body, tagLine(pack)].filter(Boolean).join("\n");
}
