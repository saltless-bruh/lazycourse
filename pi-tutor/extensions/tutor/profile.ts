import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// Learner profile (spec §6): node:sqlite, one migration per schema version.
export interface LanguageRow { name: string; level: number; interview: Record<string, string>; created: number }
export interface ConceptRow { language: string; tag: string; ease: number; episodes: number }
export interface ProjectRow { id: number; language: string; path: string; title: string; status: string; created: number }
export interface EpisodeRecord { language: string; project: string | null; concept_tags: string[]; rungs_used: number; turns: number; opened: number; closed: number }

const MIGRATIONS: string[] = [
  `CREATE TABLE languages (name TEXT PRIMARY KEY, level INTEGER NOT NULL, interview_json TEXT NOT NULL, created INTEGER NOT NULL);
   CREATE TABLE concepts (language TEXT NOT NULL, tag TEXT NOT NULL, ease REAL NOT NULL, episodes INTEGER NOT NULL, PRIMARY KEY (language, tag));
   CREATE TABLE episodes (id INTEGER PRIMARY KEY AUTOINCREMENT, language TEXT NOT NULL, project TEXT, concept_tags TEXT NOT NULL,
     rungs_used INTEGER NOT NULL, turns INTEGER NOT NULL, opened INTEGER NOT NULL, closed INTEGER NOT NULL);
   CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, language TEXT NOT NULL, path TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
     status TEXT NOT NULL, created INTEGER NOT NULL);`,
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

export class Profile {
  private constructor(private readonly db: DatabaseSync) {}

  static open(path = defaultProfilePath()): Profile {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    const db = new DatabaseSync(path);
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

  concepts(language: string): ConceptRow[] {
    return (this.db.prepare("SELECT * FROM concepts WHERE language = ? ORDER BY ease, tag").all(language) as Row[])
      .map((r) => ({ language: String(r.language), tag: String(r.tag), ease: Number(r.ease), episodes: Number(r.episodes) }));
  }

  /** Stores the episode; a non-null score folds into each tag's ease as a running mean. */
  recordEpisode(e: EpisodeRecord, score: number | null): void {
    this.db.prepare(`INSERT INTO episodes (language, project, concept_tags, rungs_used, turns, opened, closed) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(e.language, e.project, JSON.stringify(e.concept_tags), e.rungs_used, e.turns, e.opened, e.closed);
    if (score === null) return;
    const up = this.db.prepare(`INSERT INTO concepts (language, tag, ease, episodes) VALUES (?, ?, ?, 1)
      ON CONFLICT(language, tag) DO UPDATE SET ease = (ease * episodes + excluded.ease) / (episodes + 1), episodes = episodes + 1`);
    for (const tag of e.concept_tags) up.run(e.language, tag, score);
  }

  episodes(language: string): EpisodeRecord[] {
    return (this.db.prepare("SELECT * FROM episodes WHERE language = ? ORDER BY id").all(language) as Row[]).map((r) => ({
      language: String(r.language), project: r.project === null ? null : String(r.project), concept_tags: JSON.parse(String(r.concept_tags)),
      rungs_used: Number(r.rungs_used), turns: Number(r.turns), opened: Number(r.opened), closed: Number(r.closed),
    }));
  }

  addProject(language: string, path: string, title: string, now: number): ProjectRow {
    const r = this.db.prepare("INSERT INTO projects (language, path, title, status, created) VALUES (?, ?, ?, 'active', ?)")
      .run(language, path, title, now);
    return { id: Number(r.lastInsertRowid), language, path, title, status: "active", created: now };
  }

  projectAt(path: string): ProjectRow | undefined {
    const r = this.db.prepare("SELECT * FROM projects WHERE path = ?").get(path) as Row | undefined;
    return r && project(r);
  }

  projects(language: string): ProjectRow[] {
    return (this.db.prepare("SELECT * FROM projects WHERE language = ? ORDER BY id").all(language) as Row[]).map(project);
  }
}
