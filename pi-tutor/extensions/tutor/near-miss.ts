// The near-miss guard (spec 2026-10-22 §5.5): checks a weak model wrote can let a close wrong answer through
// (48 / 3 only, so `floor` ticks). Two probes find the tasks whose trusted checks are that weak.
import type { Check } from "./checks.js";

const number = (s: string | undefined) => {
  const t = (s ?? "").trim();
  return /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t) ? Number(t) : null;
};

/**
 * Tasks whose trusted numeric value checks all expect whole numbers: an answer that rounds or truncates
 * passes them, since floor(f(x)) = f(x) exactly when f(x) is whole. Text and boolean checks do not count.
 */
export function roundingWeakTasks(checks: Check[], types?: Map<string, "int" | "float" | "other">): string[] {
  const byTask = new Map<string, { n: number; expr: string }[]>();
  for (const c of checks) {
    const n = c.kind === "value" && c.status === "trusted" ? number(c.expected) : null;
    if (n !== null) byTask.set(c.task, [...(byTask.get(c.task) ?? []), { n, expr: c.expr ?? "" }]);
  }
  // Spec 2026-10-26 §5.3: a function the reference shows returning integers cannot be "rounded"; skip it.
  const ints = (xs: { expr: string }[]) => types !== undefined && xs.every((x) => types.get(x.expr) === "int");
  return [...byTask].filter(([, xs]) => xs.every((x) => Number.isInteger(x.n)) && !ints(xs)).map(([t]) => t);
}

const SWAP: Record<string, string> = { "/": "*", "*": "/", "+": "-", "-": "+", "<": "<=", "<=": "<", ">": ">=", ">=": ">" };

/** Copies of `source`, each with one spaced binary operator swapped, outside strings and comments; at most `max`. */
export function slipMutants(source: string, max = 8): string[] {
  const out: string[] = [];
  let quote: string | null = null;
  for (let i = 0; i < source.length && out.length < max; i++) {
    const ch = source[i];
    if (quote) { if (ch === "\\") i++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "#" || (ch === "/" && source[i + 1] === "/") || (ch === "-" && source[i + 1] === "-")) { const nl = source.indexOf("\n", i); if (nl < 0) break; i = nl; continue; }
    if (source[i - 1] !== " ") continue;
    const op = [">=", "<=", "/", "*", "+", "-", "<", ">"].find((o) => source.startsWith(o, i) && source[i + o.length] === " ");
    if (!op) continue;
    out.push(source.slice(0, i) + SWAP[op] + source.slice(i + op.length));
    i += op.length - 1;
  }
  return out;
}
