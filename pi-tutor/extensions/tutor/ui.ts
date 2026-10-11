export interface TutorState {
  language?: string; level?: number; rung?: number; task?: string;
  state: string; connected: boolean; last?: string;
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
  const line2 = s.connected ? s.state : "detached: pi started outside Neovim";
  return [clip(line1), clip(line2)];
}

export function renderStatus(s: TutorState): string {
  return s.level !== undefined ? `tutor lvl ${s.level}` : "tutor";
}
