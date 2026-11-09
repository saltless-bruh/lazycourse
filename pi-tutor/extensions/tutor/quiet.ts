// Ask-first spec 2026-11-09: the learner turns stuck offers off for a while, or until they turn them on again.
// Saved as profile setting QUIET_KEY: {"until": epoch ms} or {"always": true}; no setting = offers on.

export const QUIET_KEY = "quiet";
export const QUIET_CHOICES = ["1m", "5m", "10m", "1h", "off", "on"] as const;
const MS: Record<string, number> = { "1m": 60_000, "5m": 300_000, "10m": 600_000, "1h": 3_600_000 };

export function parseQuiet(arg: string, now: number): { until: number } | { always: true } | "on" | null {
  const a = arg.trim().toLowerCase();
  if (a === "on") return "on";
  if (a === "off") return { always: true };
  return MS[a] ? { until: now + MS[a] } : null;
}

/** Milliseconds of quiet left, "always", or null when offers are on (no setting, expired, unreadable). */
export function quietLeft(raw: string | undefined, now: number): number | "always" | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { until?: unknown; always?: unknown };
    if (v.always === true) return "always";
    return typeof v.until === "number" && v.until > now ? v.until - now : null;
  } catch { return null; }
}

export function quietLabel(left: number | "always"): string {
  return left === "always" ? "notices off" : `notices off ${Math.ceil(left / 60_000)}m`;
}
