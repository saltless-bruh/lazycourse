import { bandFor } from "./policy.js";

export interface TutorState {
  language?: string; level?: number; rung?: number; task?: string;
  state: string; connected: boolean;
  /** Latest judgment word from the model, or "missing" when a reply had no block. */
  last?: string;
}

const MAX = 44;

function clip(s: string): string {
  const chars = Array.from(s);
  return chars.length <= MAX ? s : chars.slice(0, MAX - 1).join("") + "…";
}

export function renderWidget(s: TutorState): string[] {
  const parts: string[] = [];
  if (s.language) parts.push(s.language);
  if (s.level !== undefined) parts.push(`lvl ${s.level}`);
  if (s.rung !== undefined) parts.push(`rung ${s.rung}`);
  if (s.task) parts.push(s.task);
  const line1 = parts.length ? `tutor  ${parts.join(" · ")}` : "tutor";
  const line2 = !s.connected ? "detached: pi started outside Neovim" : s.last ? `${s.state} · judged ${s.last}` : s.state;
  return [clip(line1), clip(line2)];
}

export function renderStatus(s: TutorState): string {
  return s.level !== undefined ? `tutor lvl ${s.level} · ${bandFor(s.level)}` : "tutor";
}
