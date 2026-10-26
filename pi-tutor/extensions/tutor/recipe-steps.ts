// Recipe steps recognised by code (spec 2026-10-26 §5.1): a step advances when the learner's own message has the
// step's artifact, not on the model's word. Build is never recognised from text: the task's checks decide it.
import { VALUE_LANGUAGES, type Check } from "./checks.js";

const ARROW = /\s(?:→|->)\s/;
const lines = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);
const CALL_ROW = /^(?:edge(?: case)?:\s*)?([A-Za-z_][\w.:]*\s*\(.*\))\s*(?:→|->)\s*(.+)$/i;

const SHAPE: Record<string, RegExp> = {
  rust: /\bfn\s+\w+\s*\([^)]*:[^)]*\)\s*->\s*\S/,
  go: /\bfunc\s+\w+\s*\([^)]*\w\s+\w[^)]*\)\s*\S/,
};
// A type: `float`, `list[str]`, `dict[str, int]`, `int | None` (final review I2: the arrow must end in one).
const TYPE = String.raw`[A-Za-z_][\w.]*(?:\[[^\]]*\])?(?:\s*\|\s*[A-Za-z_][\w.]*(?:\[[^\]]*\])?)*`;
const PARAMS = String.raw`\w+\s*:\s*${TYPE}(?:\s*,\s*\w+\s*:\s*${TYPE})*`;
const ARROW_TO_TYPE = String.raw`\s*(?:→|->)\s*${TYPE}\s*:?\s*$`;
// Any language: `name: type, … → type`, `f(name: type, …) → type`, Python's `def f(name: type) -> type:`.
const TYPED_SHAPES = [
  new RegExp(`^${PARAMS}${ARROW_TO_TYPE}`),
  new RegExp(String.raw`^(?:def\s+)?\w+\s*\(\s*${PARAMS}\s*\)${ARROW_TO_TYPE}`),
];

export function recognize(step: number, learnerText: string, o: { language: string; task: string }): boolean {
  const ls = lines(learnerText);
  switch (step) {
    case 1: return new RegExp(`(^|[^\\w.])${o.task.replace(/\./g, "\\.")}(?![\\w.]*\\d)`).test(learnerText);
    case 2: return (SHAPE[o.language]?.test(learnerText) ?? false) || ls.some((l) => TYPED_SHAPES.some((re) => re.test(l)));
    case 3: {
      const rows = ls.filter((l) => CALL_ROW.test(l) || (ARROW.test(` ${l} `) && /\d|["']/.test(l)));
      return rows.length >= 2 && rows.some((l) => /\bedge\b/i.test(l));
    }
    case 4: {
      if (learnerText.includes("```")) return false;
      const numbered = ls.filter((l) => /^\d+[.)]\s+\S/.test(l));
      return numbered.length >= 2 && !numbered.some((l) => /[A-Za-z_]\w*\s*\(|[=*/+]|\breturn\b/.test(l.replace(/^\d+[.)]\s+/, "")));
    }
    case 5: return ls.filter((l) => /^[A-Za-z][\w ,'-]*[A-Za-z]\s+(?:→|->)\s+\S/.test(l) && l.split(/\s+/).length >= 3).length >= 2;
    default: return false;
  }
}

/** The learner's Examples rows `f(args) → value` as value checks (unverified until the reference agrees). */
export function examplesToChecks(text: string, task: string, language: string, milestone: number): Check[] {
  if (!VALUE_LANGUAGES.has(language)) return [];
  return lines(text).flatMap((l) => {
    const m = CALL_ROW.exec(l);
    return m ? [{ task, kind: "value" as const, expr: m[1].trim(), expected: m[2].trim(), milestone, status: "unverified" as const }] : [];
  });
}
