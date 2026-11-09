import { relative } from "node:path";
import type { Trigger } from "./ladder.js";

// Ask-first stuck help (spec 2026-11-09): an editor signal never starts a reply; it offers help in a corner notice.
// An ignored offer comes back once after twice the wait, then that spot stays quiet until it is new again.

export type OfferKind = "pause" | "churn" | "run";
export interface Offer { kind: OfferKind; spot: string; trigger: Trigger; text: string; first: number; count: 1 | 2 }

const KIND: Partial<Record<Trigger["kind"], OfferKind>> = { idle: "pause", churn: "churn", run: "run" };

/** Which spot an offer is about: pause by 20-line region, churn by region start, run by its attempt spot. */
export function offerSpot(t: Trigger, runSpot?: string): string {
  switch (t.kind) {
    case "idle": return `pause:${t.path}:${Math.floor((t.line - 1) / 20)}`;
    case "churn": return `churn:${t.path}:${t.region[0]}`;
    case "run": return `run:${runSpot ?? t.cmd.join(" ")}`;
    case "error": return `error:${t.path}:${t.msg}`;
    default: return t.kind;
  }
}

/** The notice's words: where, and that <leader>ts asks for help. Never teaches. */
export function offerText(t: Trigger, root: string): string {
  const rel = (p: string) => relative(root, p) || p;
  switch (t.kind) {
    case "idle": return `Still on line ${t.line} of ${rel(t.path)}? <leader>ts if you're stuck`;
    case "churn": return `Lines ${t.region[0]}-${t.region[1]} of ${rel(t.path)} still have an error after a few rewrites. <leader>ts for help`;
    case "run": return t.timedOut ? `${t.cmd.join(" ")} was stopped at its time limit (an endless loop?); <leader>ts for help`
      : `${t.cmd.join(" ")} failed: read the output; <leader>ts for help`;
    case "error": return `Line ${t.line} of ${rel(t.path)} has an error. <leader>ts for help`;
    default: return "<leader>ts for help";
  }
}

export class OfferBook {
  private spots = new Map<string, Offer>();
  private last: Offer | null = null;
  constructor(private readonly waitMs: () => number) {}

  /** A signal on `spot`: an offer to show now, or null when this spot already had its first offer. Runs always offer. */
  signal(t: Trigger, spot: string, now: number): Offer | null {
    const kind = KIND[t.kind] ?? "pause";
    if (kind !== "run" && this.spots.has(spot)) return null;
    const o: Offer = { kind, spot, trigger: t, text: "", first: now, count: 1 };
    if (kind !== "run") this.spots.set(spot, o);
    return (this.last = o);
  }

  /** The second offer of a spot whose first was ignored for twice the wait and is still `current`, if any. */
  due(now: number, current: (o: Offer) => boolean): Offer | null {
    for (const o of this.spots.values()) {
      if (o.count === 1 && now - o.first >= 2 * this.waitMs() && current(o)) {
        const again: Offer = { ...o, count: 2 };
        this.spots.set(o.spot, again);
        return (this.last = again);
      }
    }
    return null;
  }

  pending(): Offer | null { return this.last; }

  reset(spot: string): void {
    this.spots.delete(spot);
    if (this.last?.spot === spot) this.last = null;
  }
}
