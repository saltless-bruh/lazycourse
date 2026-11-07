// Recipe steps recognised by code (spec 2026-10-26 §5.1): a step advances when the learner's own message has the
// step's artifact, not on the model's word. Build is never recognised from text: the task's checks decide it.
import { VALUE_LANGUAGES, type Check } from "./checks.js";

const ARROW = /\s(?:→|->)\s/;
const lines = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);
// Phase 8 A15: `f(x) = y` and `f(x) == y` are rows too.
const CALL_ROW = /^(?:edge(?: case)?:\s*)?([A-Za-z_][\w.:]*\s*\(.*\))\s*(?:→|->|==?)\s*(.+)$/i;

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

// Learner-session fixes §6: beginners write plain sentences, not types and arrows (tested on real phrasings).
// Shape: "it takes the total and the people and gives back each share" — two or more inputs, and what comes back.
const PLAIN_SHAPE = /\b(?:takes?|gets?|needs?|receives?|is given|uses?)\s+(.+?)\s+(?:and\s+)?(?:gives?(?:\s+back)?|returns?|hands?\s+back|outputs?|comes?\s+out\s+with|makes?)\s+\S/i;
// Examples: two outcomes ("it should give 16", "should say error") with a number, one of them an edge case.
const OUTCOME = /\b(?:should|will|must|would)\s+(?:give|return|say|print|be|get|show|output)\b|\b(?:gives?|returns?)\s+(?:back\s+)?\S/gi;
const EDGE = /\b(?:edge|zero|0|empty|nothing|none|error|negative|wrong|invalid|blank)\b/i;
// Steps: ordered sentences ("first …, then …, then …"), no code.
const ORDER = /\b(?:first|then|next|after that|afterwards|finally|lastly|last)\b/gi;
// Map: "<step> is <construct>" pairs, the construct a symbol, a call or a construct's plain name.
const CONSTRUCT = /[()`/*+%<>=[\]]|\b(?:slash|star|plus|minus|times|percent|modulo|loop|for|while|if|else|function|def|list|dict|dictionary|variable|input|print|round|int|float|str|string|len|range|split|join|return|comparison|import|random|f-string|format|append)\b/i;
// The left side names an action of the learner's steps (1-4 words), never "this", "that", "it", "there".
const MAP_PAIR = /^\s*(?!(?:this|that|it|there|these|those)\b)[A-Za-z][\w'-]*(?:\s+[\w'-]+){0,3}?\s+(?:is|are|uses?|means?|becomes?|with|by)\s+(.+)$/i;

export function recognize(step: number, learnerText: string, o: { language: string; task: string }): boolean {
  const ls = lines(learnerText);
  const plain = !learnerText.includes("```") && !learnerText.includes("?");
  switch (step) {
    case 1: return new RegExp(`(^|[^\\w.])${o.task.replace(/\./g, "\\.")}(?![\\w.]*\\d)`).test(learnerText);
    case 2: {
      if ((SHAPE[o.language]?.test(learnerText) ?? false) || ls.some((l) => TYPED_SHAPES.some((re) => re.test(l)))) return true;
      const m = plain ? PLAIN_SHAPE.exec(learnerText) : null;
      return m !== null && /\s(?:and|,)\s|,/.test(` ${m[1]} `);
    }
    case 3: {
      const rows = ls.filter((l) => CALL_ROW.test(l) || (ARROW.test(` ${l} `) && /\d|["']/.test(l)));
      if (rows.length >= 2 && rows.some((l) => /\bedge\b/i.test(l))) return true;
      return plain && (learnerText.match(OUTCOME) ?? []).length >= 2 && /\d/.test(learnerText) && EDGE.test(learnerText);
    }
    case 4: {
      if (learnerText.includes("```")) return false;
      const numbered = ls.filter((l) => /^\d+[.)]\s+\S/.test(l));
      // Phase 8 A15: a numbered question ("1. what do I take first?") asks, it is no step.
      if (numbered.length >= 2) return !numbered.some((l) => /[A-Za-z_]\w*\s*\(|[=*/+]|\breturn\b|\?$/.test(l.replace(/^\d+[.)]\s+/, "")));
      // Side-agent note: three ordered parts of two words or more, so "it comes first and then …" is no plan.
      const parts = learnerText.split(ORDER).map((x) => x.replace(/[,.;]/g, " ").trim()).filter((x) => x.split(/\s+/).length >= 2);
      return plain && (learnerText.match(ORDER) ?? []).length >= 3 && parts.length >= 3 && !/[A-Za-z_]\w*\s*\(|[=*/+`]/.test(learnerText);
    }
    case 5: {
      if (ls.filter((l) => /^[A-Za-z][\w ,'-]*[A-Za-z]\s+(?:→|->)\s+\S/.test(l) && l.split(/\s+/).length >= 3).length >= 2) return true;
      if (!plain) return false;
      const pairs = learnerText.split(/[,;\n]|\s+and\s+/).map((part) => MAP_PAIR.exec(part)).filter((m) => m && CONSTRUCT.test(m[1]));
      return pairs.length >= 2;
    }
    default: return false;
  }
}

// Plain words about the recipe itself (spec §6): "skip" / "just let me code" skips the step; "I don't understand" /
// "what is a step?" asks for the step's one-sentence explanation. Anything else is no intent.
const SKIP = [
  /^\W*(?:please\s+)?(?:skip|next|pass)(?:\s+(?:this|it|that|the step|this step|this one|ahead))?\W*$/i,
  /\b(?:can|could|may)\s+i\s+(?:just\s+)?(?:try\s+)?(?:writ|cod|start|go straight|jump)/i,
  /\blet\s+me\s+(?:just\s+)?(?:try\s+)?(?:writ|cod|start|jump)/i,
  /\bskip\s+(?:this|the|that|it|ahead|to)\b/i,
  /\bi\s+(?:just\s+)?want\s+to\s+(?:just\s+)?(?:write|code|start coding|skip)/i,
];
const CONFUSED = /\b(?:don'?t|do not|didn'?t)\s+(?:know|understand|get)\b|\bnot\s+sure\b|\bconfus|\bwhat\s+(?:do you mean|is|are|does|do)\b|\bwhat'?s\b|\bexplain\b/i;
const STEP_WORDS = /\b(?:step|steps|shape|examples?|map|diagram|find|build|recipe|artifact|blueprint|what to (?:do|write|say))\b/i;

export function recipeIntent(text: string): "skip" | "explain" | null {
  const t = text.trim();
  if (SKIP.some((re) => re.test(t))) return "skip";
  if (CONFUSED.test(t) && (STEP_WORDS.test(t) || t.split(/\s+/).length <= 4)) return "explain";
  return null;
}

/** A real attempt at the step: not a question, not a recipe intent, at least 4 words. */
export function isAttempt(text: string): boolean {
  const t = text.trim();
  return !t.includes("?") && recipeIntent(t) === null && t.split(/\s+/).filter(Boolean).length >= 4;
}

/** The learner's Examples rows `f(args) → value` as value checks (unverified until the reference agrees). */
export function examplesToChecks(text: string, task: string, language: string, milestone: number): Check[] {
  if (!VALUE_LANGUAGES.has(language)) return [];
  return lines(text).flatMap((l) => {
    const m = CALL_ROW.exec(l);
    return m ? [{ task, kind: "value" as const, expr: m[1].trim(), expected: m[2].trim(), milestone, status: "unverified" as const }] : [];
  });
}
