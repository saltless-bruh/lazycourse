// Level policy (spec §4): one integer 0-100 → band and stuck thresholds.
export type Band = "beginner" | "intermediate" | "pro";

export const DEFAULT_LEVEL = 50;

const MIN = 60_000;

/** Band table values, anchored at each band's midpoint for interpolation. */
const ANCHORS: { level: number; band: Band; errorMs: number; idleMs: number }[] = [
  { level: 17, band: "beginner", errorMs: 0, idleMs: 2 * MIN },
  { level: 50, band: "intermediate", errorMs: 1 * MIN, idleMs: 5 * MIN },
  { level: 83, band: "pro", errorMs: 3 * MIN, idleMs: 10 * MIN },
];

function clamp(level: number): number {
  return Math.min(100, Math.max(0, level));
}

export function bandFor(level: number): Band {
  const l = clamp(level);
  return l <= 33 ? "beginner" : l <= 66 ? "intermediate" : "pro";
}


export function thresholds(level: number): { errorMs: number; idleMs: number } {
  const l = clamp(level);
  const first = ANCHORS[0], last = ANCHORS[ANCHORS.length - 1];
  if (l <= first.level) return { errorMs: first.errorMs, idleMs: first.idleMs };
  if (l >= last.level) return { errorMs: last.errorMs, idleMs: last.idleMs };
  for (let i = 1; i < ANCHORS.length; i++) {
    const a = ANCHORS[i - 1], b = ANCHORS[i];
    if (l <= b.level) {
      const t = (l - a.level) / (b.level - a.level);
      return { errorMs: a.errorMs + t * (b.errorMs - a.errorMs), idleMs: a.idleMs + t * (b.idleMs - a.idleMs) };
    }
  }
  return { errorMs: last.errorMs, idleMs: last.idleMs };
}
