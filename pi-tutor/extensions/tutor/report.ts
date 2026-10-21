import { bandFor } from "./policy.js";
import type { EpisodeRecord, ExamRecord } from "./profile.js";
import { remapConcepts, type Vocab } from "./packs.js";

// /tutor-progress (spec 2026-10-13 §6, gap #8): exam trend, hint use over time, concept map. Lines ≤ 40 columns.
const SPARK = ["▁", "▃", "▅", "▇", "█"];
const W = 40;
const avg = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;

/** "label: a, b, c" wrapped at W with a two-space hanging indent. */
function wrapList(label: string, items: string[]): string[] {
  const out: string[] = [];
  let line = `${label}:`;
  for (const it of items) {
    const next = `${line}${line.endsWith(":") ? " " : ", "}${it}`;
    if (Array.from(next).length > W && !line.endsWith(":")) { out.push(`${line},`); line = `  ${it}`; } else line = next;
  }
  out.push(line);
  return out;
}

export function progressReport(i: { language: string; level: number | null; episodes: EpisodeRecord[]; exams: ExamRecord[]; concepts: { language: string; tag: string; ease: number; episodes: number }[]; vocab: Vocab | null }): string {
  const lines = [`**${i.language}**${i.level === null ? "" : ` · level ${i.level} (${bandFor(i.level)})`}`, ""];
  if (!i.episodes.length && !i.exams.length) return [...lines, "no episodes or exams yet"].join("\n");
  const recent = i.episodes.slice(-20).map((e) => e.rungs_used);
  if (recent.length) {
    lines.push("Tries per episode, oldest → newest:", `\`${recent.map((r) => SPARK[Math.min(Math.max(r, 1), 5) - 1]).join("")}\``);
    const half = Math.floor(recent.length / 2);
    lines.push(recent.length >= 4 ? `tries used: ${avg(recent.slice(0, half))} → ${avg(recent.slice(half))}` : `tries used: ${avg(recent)}`, "");
  }
  if (i.exams.length) {
    lines.push("Exams:", ...i.exams.slice(-5).map((e) => `- ${e.exam.slice(0, 18)} ${e.score} · ${e.minutes} min${e.late ? " · late" : ""}`));
    if (i.exams.length >= 2) lines.push(`trend: ${i.exams.slice(-5).map((e) => e.score).join(" → ")}`);
    lines.push("");
  }
  const cs = remapConcepts(i.concepts, i.vocab);
  const by = (lo: number, hi: number) => cs.filter((c) => c.ease >= lo && c.ease < hi).sort((a, b) => b.ease - a.ease).map((c) => c.tag);
  if (cs.length) lines.push("Concepts:", ...wrapList("strong", by(0.7, 1.01)), ...wrapList("shaky", by(0.4, 0.7)), ...wrapList("weak", by(0, 0.4)));
  return lines.join("\n").trimEnd();
}
