import { visibleWidth } from "@earendil-works/pi-tui";
import { bandFor } from "./policy.js";

export interface TutorState {
  /** Active role when it is not the default coding tutor (spec 2026-10-13 §3). */
  role?: string;
  language?: string; level?: number; rung?: number; task?: string;
  state: string; connected: boolean;
  /** Was linked to Neovim and the link ended (the editor exited). */
  lost?: boolean;
  /** Latest judgment word from the model, or "missing" when a reply had no block. */
  last?: string;
}

const MAX = 44;

/** Whitespace collapsed, clipped to MAX terminal columns (wide CJK/emoji count 2; M3 #22). */
function clip(s: string): string {
  const flat = s.replace(/[ \t]*[\r\n]+[ \t]*|\t/g, " "); // line breaks and tabs only: line 1 keeps "tutor  "
  if (visibleWidth(flat) <= MAX) return flat;
  let out = "", w = 0;
  for (const ch of flat) {
    const cw = visibleWidth(ch);
    if (w + cw > MAX - 1) break;
    out += ch; w += cw;
  }
  return `${out}…`;
}

export function renderWidget(s: TutorState): string[] {
  const parts: string[] = [];
  if (s.role) parts.push(s.role);
  if (s.language) parts.push(s.language);
  if (s.level !== undefined) parts.push(`lvl ${s.level}`);
  if (s.rung !== undefined) parts.push(`rung ${s.rung}`);
  if (s.task) parts.push(s.task);
  const line1 = parts.length ? `tutor  ${parts.join(" · ")}` : "tutor";
  // Off Neovim the state and judgment still show; the prefix says why (M1b #2, M2 #10, M3 #23).
  const detail = s.last ? `${s.state} · judged ${s.last}` : s.state;
  const line2 = s.connected ? detail : `${s.lost ? "nvim closed" : "outside nvim"} · ${detail}`;
  return [clip(line1), clip(line2)];
}

export function renderStatus(s: TutorState): string {
  return s.level !== undefined ? `tutor lvl ${s.level} · ${bandFor(s.level)}` : "tutor";
}
