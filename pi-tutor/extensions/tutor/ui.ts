import { visibleWidth } from "@earendil-works/pi-tui";
import { bandFor } from "./policy.js";

export interface TutorState {
  /** Exam timer label (M8): first on line 1 so clipping never hides it. */
  exam?: string;
  /** Lesson or milestone label (spec 2026-10-19 Q15): first after the exam timer, so clipping never hides it. */
  lesson?: string;
  /** Active role when it is not the default coding tutor (spec 2026-10-13 §3). */
  role?: string;
  language?: string; level?: number; task?: string;
  /** Failed graded tries on the current spot (spec 2026-10-21 §5); shown only when > 0. */
  attempt?: number;
  state: string; connected: boolean;
  /** Was linked to Neovim and the link ended (the editor exited). */
  lost?: boolean;
  /** Latest judgment word from the model, or "missing" when a reply had no block. */
  last?: string;
}

const MAX = 44;

/** Whitespace collapsed, clipped to `max` terminal columns (wide CJK/emoji count 2; M3 #22). */
function clip(s: string, max = MAX): string {
  const flat = s.replace(/[ \t]*[\r\n]+[ \t]*|\t/g, " "); // line breaks and tabs only: line 1 keeps "tutor  "
  if (visibleWidth(flat) <= max) return flat;
  let out = "", w = 0;
  for (const ch of flat) {
    const cw = visibleWidth(ch);
    if (w + cw > max - 1) break;
    out += ch; w += cw;
  }
  return `${out}…`;
}

export function renderWidget(s: TutorState): string[] {
  const parts: string[] = [];
  if (s.exam) parts.push(s.exam);
  if (s.lesson) parts.push(s.lesson);
  // The try count leads what is left: a long lesson label clipped it in the phase 2 live check.
  if (s.attempt) parts.push(`try ${s.attempt}`);
  if (s.task) parts.push(s.task);
  if (s.role) parts.push(s.role);
  if (s.language) parts.push(s.language);
  if (s.level !== undefined) parts.push(`lvl ${s.level}`);
  const line1 = parts.length ? `tutor  ${parts.join(" · ")}` : "tutor";
  // Off Neovim the state and judgment still show; the prefix says why (M1b #2, M2 #10, M3 #23).
  // The state is clipped to the room the prefix and the judgment leave, so "· judged X" always shows (M6c I2).
  const prefix = s.connected ? "" : `${s.lost ? "nvim closed" : "outside nvim"} · `;
  const suffix = s.last ? ` · judged ${s.last}` : "";
  const room = Math.max(1, MAX - visibleWidth(prefix) - visibleWidth(suffix));
  return [clip(line1), clip(`${prefix}${clip(s.state, room)}${suffix}`)];
}

export function renderStatus(s: TutorState): string {
  return s.level !== undefined ? `tutor lvl ${s.level} · ${bandFor(s.level)}` : "tutor";
}
