import { describe, it, expect } from "vitest";
import { Rating } from "ts-fsrs";
import { ratingFor, seedCard, nextCard } from "../extensions/tutor/review.js";

describe("FSRS per concept (spec 2026-10-19 §7b)", () => {
  it("maps a 0..1 score to a rating at the plan's thresholds", () => {
    expect([0.39, 0.4, 0.69, 0.7, 0.89, 0.9].map(ratingFor)).toEqual([Rating.Again, Rating.Hard, Rating.Hard, Rating.Good, Rating.Good, Rating.Easy]);
  });
  it("a forgotten concept comes back sooner than an easy one", () => {
    const t = Date.UTC(2026, 9, 19);
    expect(nextCard(seedCard(0.5, t), Rating.Again, t).due).toBeLessThan(nextCard(seedCard(0.5, t), Rating.Easy, t).due);
  });
  it("cards are plain JSON with epoch-millisecond dates", () => {
    const c = nextCard(seedCard(0.8, 1_000_000), Rating.Good, 2_000_000);
    expect(typeof c.due).toBe("number");
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });
});
