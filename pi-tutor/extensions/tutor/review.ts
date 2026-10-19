// Spaced repetition per concept (spec 2026-10-19 §7b): ts-fsrs schedules when a concept is due for a
// short review, so the code, not the model, decides what to revisit. Cards are stored as JSON with
// dates as epoch milliseconds.
import { createEmptyCard, fsrs, Rating, type Card, type Grade } from "ts-fsrs";

export type CardState = Omit<Card, "due" | "last_review"> & { due: number; last_review: number | null };

const scheduler = fsrs();

/** A 0..1 score as an FSRS grade: < 0.4 Again, < 0.7 Hard, < 0.9 Good, else Easy. */
export function ratingFor(score: number): Grade {
  if (score < 0.4) return Rating.Again;
  if (score < 0.7) return Rating.Hard;
  if (score < 0.9) return Rating.Good;
  return Rating.Easy;
}

const toState = (c: Card): CardState => ({ ...c, due: c.due.getTime(), last_review: c.last_review ? c.last_review.getTime() : null });
const toCard = (s: CardState): Card => ({ ...s, due: new Date(s.due), last_review: s.last_review === null ? undefined : new Date(s.last_review) });

export function nextCard(card: CardState, rating: Grade, now: number): CardState {
  return toState(scheduler.next(toCard(card), new Date(now), rating).card);
}

/** A card for a concept with a known ease (an old v4 row): one review at that ease, at `now`. */
export function seedCard(ease: number, now: number): CardState {
  return nextCard(toState(createEmptyCard(new Date(now))), ratingFor(ease), now);
}

/** A card with no history yet: due at `now`. */
export function emptyCard(now: number): CardState {
  return toState(createEmptyCard(new Date(now)));
}
