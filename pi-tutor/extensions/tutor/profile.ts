import type { HabitEvent, HabitId } from "./habits.js";
import { emptyCard, nextCard, ratingFor, seedCard, type CardState } from "./review.js";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// Learner profile (spec §6; v2: spec 2026-10-13 §7.1, §8): node:sqlite, one migration per schema version.
export interface LanguageRow { name: string; level: number; interview: Record<string, string>; created: number }
export interface ConceptRow { language: string; tag: string; ease: number; episodes: number }
export interface ProjectRow { id: number; language: string; path: string; title: string; status: string; created: number }
export interface ExamRecord { exam: string; project: string | null; language: string; topic: string | null; score: number; minutes: number; late: boolean; concepts: string[]; created: number }
export interface EpisodeRecord { language: string; project: string | null; concept_tags: string[]; rungs_used: number; turns: number; opened: number; closed: number }

export const MIGRATIONS: string[] = [
  `CREATE TABLE languages (name TEXT PRIMARY KEY, level INTEGER NOT NULL, interview_json TEXT NOT NULL, created INTEGER NOT NULL);
   CREATE TABLE concepts (language TEXT NOT NULL, tag TEXT NOT NULL, ease REAL NOT NULL, episodes INTEGER NOT NULL, PRIMARY KEY (language, tag));
   CREATE TABLE episodes (id INTEGER PRIMARY KEY AUTOINCREMENT, language TEXT NOT NULL, project TEXT, concept_tags TEXT NOT NULL,
     rungs_used INTEGER NOT NULL, turns INTEGER NOT NULL, opened INTEGER NOT NULL, closed INTEGER NOT NULL);
   CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, language TEXT NOT NULL, path TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
     status TEXT NOT NULL, created INTEGER NOT NULL);`,
  // v2 (spec 2026-10-13 §7.1, §7 #7, §8): tutor memory with a full-text index, and learner feedback.
  `CREATE TABLE memory (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, text TEXT NOT NULL, language TEXT, project TEXT,
     created INTEGER NOT NULL, updated INTEGER NOT NULL);
   CREATE VIRTUAL TABLE memory_fts USING fts5(text, content='memory', content_rowid='id', tokenize='porter unicode61');
   CREATE TRIGGER memory_ai AFTER INSERT ON memory BEGIN INSERT INTO memory_fts(rowid, text) VALUES (new.id, new.text); END;
   CREATE TRIGGER memory_ad AFTER DELETE ON memory BEGIN INSERT INTO memory_fts(memory_fts, rowid, text) VALUES ('delete', old.id, old.text); END;
   CREATE TABLE feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, language TEXT, project TEXT, rung INTEGER,
     created INTEGER NOT NULL);`,
  // v3 (M7): learner settings that outlast sessions (thinking visibility).
  `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  // v4 (M8): exams, each folding score/100 into its concepts' ease (spec 2026-10-13 §6).
  `CREATE TABLE exams (id INTEGER PRIMARY KEY AUTOINCREMENT, exam TEXT NOT NULL, project TEXT, language TEXT NOT NULL, topic TEXT,
     score INTEGER NOT NULL, minutes REAL NOT NULL, late INTEGER NOT NULL, concepts TEXT NOT NULL, created INTEGER NOT NULL);`,
  // v5 (spec 2026-10-19 §7b): one FSRS card per concept; `due` is epoch ms for the "what to review" query.
  `CREATE TABLE cards (language TEXT NOT NULL, tag TEXT NOT NULL, card TEXT NOT NULL, due INTEGER NOT NULL, PRIMARY KEY (language, tag));`,
  // v6 (spec 2026-10-26 §6.1): every habit event, with the evidence that produced it.
  `CREATE TABLE habit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, habit TEXT NOT NULL, ok INTEGER NOT NULL, language TEXT NOT NULL,
     project TEXT NOT NULL, at INTEGER NOT NULL, evidence TEXT NOT NULL);`,
];
export const SCHEMA_VERSION = MIGRATIONS.length;

export function defaultProfilePath(): string {
  if (process.env.PI_TUTOR_PROFILE) return process.env.PI_TUTOR_PROFILE;
  const data = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(data, "nvim-tutor", "profile.sqlite");
}

type Row = Record<string, unknown>;
const project = (r: Row): ProjectRow => ({
  id: Number(r.id), language: String(r.language), path: String(r.path), title: String(r.title), status: String(r.status), created: Number(r.created),
});

export type MemoryType = "learner" | "feedback" | "project" | "reference";
export interface MemoryRow { id: number; type: MemoryType; text: string; language: string | null; project: string | null; created: number; updated: number }
export type FeedbackKind = "too-long" | "too-vague" | "too-much-help" | "good";
export interface FeedbackRow { kind: FeedbackKind; language: string | null; project: string | null; rung: number | null; created: number }

/** A learner's words → FTS5 syntax: each term quoted, OR'd (idea from @pify/memory src/fts.ts, MIT). */
export function toFtsQuery(query: string): string {
  const terms = query.split(/\s+/).map((t) => t.replace(/"/g, "")).filter((t) => t.length > 1);
  return terms.length ? terms.map((t) => `"${t}"`).join(" OR ") : '""';
}

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const memoryRow = (r: Row): MemoryRow => ({
  id: Number(r.id), type: String(r.type) as MemoryType, text: String(r.text), language: str(r.language), project: str(r.project),
  created: Number(r.created), updated: Number(r.updated),
});

export class Profile {
  private constructor(private readonly db: DatabaseSync) {}

  /** `busyTimeoutMs`: how long a write waits on another tutor's lock before throwing (never hangs Pi). */
  static open(path = defaultProfilePath(), opts: { busyTimeoutMs?: number } = {}): Profile {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    const db = new DatabaseSync(path, { timeout: opts.busyTimeoutMs ?? 2000 });
    try {
      db.exec("CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL)");
      const row = db.prepare("SELECT v FROM schema_version").get() as Row | undefined;
      if (!row) db.prepare("INSERT INTO schema_version (v) VALUES (0)").run();
      let v = row ? Number(row.v) : 0;
      if (v > SCHEMA_VERSION) throw new Error(`profile schema v${v} is newer than this pi-tutor (v${SCHEMA_VERSION}); update pi-tutor`);
      for (; v < SCHEMA_VERSION; v++) {
        db.exec("BEGIN");
        try {
          db.exec(MIGRATIONS[v]);
          db.prepare("UPDATE schema_version SET v = ?").run(v + 1);
          db.exec("COMMIT");
        } catch (e) { db.exec("ROLLBACK"); throw e; }
      }
    } catch (e) { db.close(); throw e; }
    return new Profile(db);
  }

  get version(): number {
    return Number((this.db.prepare("SELECT v FROM schema_version").get() as Row).v);
  }

  close(): void { this.db.close(); }

  language(name: string): LanguageRow | undefined {
    const r = this.db.prepare("SELECT * FROM languages WHERE name = ?").get(name) as Row | undefined;
    return r && { name: String(r.name), level: Number(r.level), interview: JSON.parse(String(r.interview_json)), created: Number(r.created) };
  }

  languages(): string[] {
    return (this.db.prepare("SELECT name FROM languages ORDER BY name").all() as Row[]).map((r) => String(r.name));
  }

  saveLanguage(name: string, level: number, interview: Record<string, string>, now: number): void {
    this.db.prepare(`INSERT INTO languages (name, level, interview_json, created) VALUES (?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET level = excluded.level, interview_json = excluded.interview_json`)
      .run(name, level, JSON.stringify(interview), now);
  }

  setLevel(name: string, level: number): boolean {
    return Number(this.db.prepare("UPDATE languages SET level = ? WHERE name = ?").run(level, name).changes) > 0;
  }

  setting(key: string): string | null {
    const r = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as Row | undefined;
    return r ? String(r.value) : null;
  }

  setSetting(key: string, value: string): void {
    this.db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }

  concepts(language: string): ConceptRow[] {
    return (this.db.prepare("SELECT * FROM concepts WHERE language = ? ORDER BY ease, tag").all(language) as Row[])
      .map((r) => ({ language: String(r.language), tag: String(r.tag), ease: Number(r.ease), episodes: Number(r.episodes) }));
  }

  /** Stores the episode; a non-null score folds into each tag's ease as a running mean. */
  recordEpisode(e: EpisodeRecord, score: number | null): void {
    this.db.prepare(`INSERT INTO episodes (language, project, concept_tags, rungs_used, turns, opened, closed) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(e.language, e.project, JSON.stringify(e.concept_tags), e.rungs_used, e.turns, e.opened, e.closed);
    if (score === null) return;
    for (const tag of e.concept_tags) this.rateConcept(e.language, tag, score, e.closed);
    this.foldEase(e.language, e.concept_tags, score);
  }

  /**
   * One FSRS review of a concept. Rate before folding ease: a concept with an ease from before v5 and
   * no card yet gets a card seeded from that ease; a brand-new concept starts from an empty card.
   */
  rateConcept(language: string, tag: string, score: number, now: number): void {
    const row = this.db.prepare("SELECT card FROM cards WHERE language = ? AND tag = ?").get(language, tag) as Row | undefined;
    let card: CardState;
    if (row) card = JSON.parse(String(row.card)) as CardState;
    else {
      const old = this.db.prepare("SELECT ease FROM concepts WHERE language = ? AND tag = ?").get(language, tag) as Row | undefined;
      card = old ? seedCard(Number(old.ease), now) : emptyCard(now);
    }
    const next = nextCard(card, ratingFor(score), now);
    this.db.prepare(`INSERT INTO cards (language, tag, card, due) VALUES (?, ?, ?, ?)
      ON CONFLICT(language, tag) DO UPDATE SET card = excluded.card, due = excluded.due`).run(language, tag, JSON.stringify(next), next.due);
  }

  /** Concepts whose card is not due at `now`: learned recently enough to skip in a lesson plan. */
  knownConcepts(language: string, now: number): string[] {
    // Final review: a concept with an ease from before v5 and no card yet counts as known when its ease is ≥ 0.8.
    return (this.db.prepare(`SELECT tag FROM cards WHERE language = ? AND due > ?
      UNION SELECT c.tag FROM concepts c WHERE c.language = ? AND c.ease >= 0.8 AND NOT EXISTS (SELECT 1 FROM cards k WHERE k.language = c.language AND k.tag = c.tag)
      ORDER BY tag`).all(language, now, language) as Row[]).map((r) => String(r.tag));
  }

  /** Concepts due for review at `now`, longest overdue first. */
  dueConcepts(language: string, now: number, limit = 3): string[] {
    return (this.db.prepare("SELECT tag FROM cards WHERE language = ? AND due <= ? ORDER BY due, tag LIMIT ?").all(language, now, limit) as Row[])
      .map((r) => String(r.tag));
  }

  /** One ease sample per tag, folded as a running mean (episodes and exams). */
  private foldEase(language: string, tags: string[], score: number): void {
    const up = this.db.prepare(`INSERT INTO concepts (language, tag, ease, episodes) VALUES (?, ?, ?, 1)
      ON CONFLICT(language, tag) DO UPDATE SET ease = (ease * episodes + excluded.ease) / (episodes + 1), episodes = episodes + 1`);
    for (const tag of tags) up.run(language, tag, score);
  }

  recordExam(e: ExamRecord): void {
    this.db.prepare(`INSERT INTO exams (exam, project, language, topic, score, minutes, late, concepts, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(e.exam, e.project, e.language, e.topic, e.score, e.minutes, e.late ? 1 : 0, JSON.stringify(e.concepts), e.created);
    for (const tag of e.concepts) this.rateConcept(e.language, tag, e.score / 100, e.created);
    this.foldEase(e.language, e.concepts, e.score / 100);
  }

  exams(language: string): ExamRecord[] {
    return (this.db.prepare("SELECT * FROM exams WHERE language = ? ORDER BY id").all(language) as Row[]).map((r) => ({
      exam: String(r.exam), project: str(r.project), language: String(r.language), topic: str(r.topic), score: Number(r.score),
      minutes: Number(r.minutes), late: Number(r.late) === 1, concepts: JSON.parse(String(r.concepts)), created: Number(r.created),
    }));
  }

  episodes(language: string): EpisodeRecord[] {
    return (this.db.prepare("SELECT * FROM episodes WHERE language = ? ORDER BY id").all(language) as Row[]).map((r) => ({
      language: String(r.language), project: r.project === null ? null : String(r.project), concept_tags: JSON.parse(String(r.concept_tags)),
      rungs_used: Number(r.rungs_used), turns: Number(r.turns), opened: Number(r.opened), closed: Number(r.closed),
    }));
  }

  addProject(language: string, path: string, title: string, now: number): ProjectRow {
    // A folder scaffolded again (after the learner emptied it) replaces its old record.
    const r = this.db.prepare(`INSERT INTO projects (language, path, title, status, created) VALUES (?, ?, ?, 'active', ?)
      ON CONFLICT(path) DO UPDATE SET language = excluded.language, title = excluded.title, status = 'active', created = excluded.created
      RETURNING id`).get(language, path, title, now) as Row;
    return { id: Number(r.id), language, path, title, status: "active", created: now };
  }

  projectAt(path: string): ProjectRow | undefined {
    const r = this.db.prepare("SELECT * FROM projects WHERE path = ?").get(path) as Row | undefined;
    return r && project(r);
  }

  projects(language: string): ProjectRow[] {
    return (this.db.prepare("SELECT * FROM projects WHERE language = ? ORDER BY id").all(language) as Row[]).map(project);
  }

  /** One fact; the same type+text again only bumps `updated` (spec 2026-10-13 §7.1). */
  remember(m: { type: MemoryType; text: string; language: string | null; project: string | null }, now: number): { id: number; created: boolean } {
    // M6b #57: the same words about another language are a different fact (`IS` matches NULL too).
    const old = this.db.prepare("SELECT id FROM memory WHERE type = ? AND text = ? AND language IS ?").get(m.type, m.text, m.language) as Row | undefined;
    if (old) {
      this.db.prepare("UPDATE memory SET updated = ? WHERE id = ?").run(now, Number(old.id));
      return { id: Number(old.id), created: false };
    }
    const r = this.db.prepare("INSERT INTO memory (type, text, language, project, created, updated) VALUES (?, ?, ?, ?, ?, ?) RETURNING id")
      .get(m.type, m.text, m.language, m.project, now, now) as Row;
    return { id: Number(r.id), created: true };
  }

  /** Newest first; a language also gets the language-free memories, `null` gets every language. */
  memories(o: { language: string | null; limit: number }): MemoryRow[] {
    const rows = o.language === null
      ? this.db.prepare("SELECT * FROM memory ORDER BY updated DESC, id DESC LIMIT ?").all(o.limit)
      : this.db.prepare("SELECT * FROM memory WHERE language = ? OR language IS NULL ORDER BY updated DESC, id DESC LIMIT ?").all(o.language, o.limit);
    return (rows as Row[]).map(memoryRow);
  }

  recall(query: string, limit: number): MemoryRow[] {
    const q = toFtsQuery(query);
    if (q === '""') return [];
    return (this.db.prepare(`SELECT m.* FROM memory_fts f JOIN memory m ON m.id = f.rowid
      WHERE memory_fts MATCH ? ORDER BY bm25(memory_fts) LIMIT ?`).all(q, limit) as Row[]).map(memoryRow);
  }

  forget(id: number): boolean {
    return Number(this.db.prepare("DELETE FROM memory WHERE id = ?").run(id).changes) > 0;
  }

  recordFeedback(f: Omit<FeedbackRow, "created">, now: number): void {
    this.db.prepare("INSERT INTO feedback (kind, language, project, rung, created) VALUES (?, ?, ?, ?, ?)")
      .run(f.kind, f.language, f.project, f.rung, now);
  }

  /** Spec 2026-10-26 §6.1: one habit event (evidence names the episode, check or command behind it). */
  addHabitEvent(e: HabitEvent): void {
    this.db.prepare("INSERT INTO habit_events (habit, ok, language, project, at, evidence) VALUES (?, ?, ?, ?, ?, ?)")
      .run(e.habit, e.ok ? 1 : 0, e.language, e.project, e.at, e.evidence);
  }

  /** Habit events, oldest first; all habits, or one. */
  habitEvents(habit?: HabitId): HabitEvent[] {
    const rows = (habit ? this.db.prepare("SELECT * FROM habit_events WHERE habit = ? ORDER BY at, id").all(habit) : this.db.prepare("SELECT * FROM habit_events ORDER BY at, id").all()) as Row[];
    return rows.map((r) => ({ habit: String(r.habit) as HabitId, ok: Number(r.ok) === 1, language: String(r.language), project: String(r.project), at: Number(r.at), evidence: String(r.evidence) }));
  }

  /** The learner's feedback for a language, oldest first (spec 2026-10-13 §7 #7). */
  feedback(language: string): FeedbackRow[] {
    return (this.db.prepare("SELECT * FROM feedback WHERE language = ? ORDER BY id").all(language) as Row[]).map((r) => ({
      kind: String(r.kind) as FeedbackKind, language: str(r.language), project: str(r.project),
      rung: r.rung === null ? null : Number(r.rung), created: Number(r.created),
    }));
  }
}
