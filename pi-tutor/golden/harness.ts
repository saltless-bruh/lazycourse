import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Profile } from "../extensions/tutor/profile.js";

// Golden transcripts (spec 2026-10-13 §7 #2): the real `pi -p --mode json` with this checkout's
// extension and skills, against the configured model. Needs network; never part of `npm test`.
const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXT = join(PKG, "extensions", "tutor", "index.ts");
const SKILLS = join(PKG, "skills");

export interface GoldenRun { replies: string[]; dir: string; stderr: string; code: number | null }

type JsonEvent = { type?: string; message?: { role?: string; content?: { type: string; text?: string }[] } };

/** One reply per agent run: the last non-empty assistant text before each `agent_end`. */
export function repliesOf(stdout: string): string[] {
  const replies: string[] = [];
  let last = "";
  for (const line of stdout.split("\n")) {
    let ev: JsonEvent;
    try { ev = JSON.parse(line) as JsonEvent; } catch { continue; }
    if (ev.type === "message_end" && ev.message?.role === "assistant") {
      const text = (ev.message.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
      if (text.trim()) last = text;
    } else if (ev.type === "agent_end") { replies.push(last); last = ""; }
  }
  return replies;
}

export async function runTutor(o: { level: number; language: string; files: Record<string, string>; messages: string[]; timeoutMs?: number }): Promise<GoldenRun> {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "golden-proj-")));
  for (const [path, text] of Object.entries(o.files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  // The level comes through the real path: a recorded project whose language has that level.
  const profilePath = join(mkdtempSync(join(tmpdir(), "golden-profile-")), "profile.sqlite");
  const p = Profile.open(profilePath);
  p.saveLanguage(o.language, o.level, {}, Date.now());
  p.addProject(o.language, dir, "golden", Date.now());
  p.close();

  // -ne keeps the installed pi-tutor package out, so only this checkout's extension loads.
  const args = ["-p", "--no-session", "--mode", "json", "-ne", "-e", EXT, "--skill", SKILLS, "--tools", "read,grep,find,ls",
    ...(process.env.GOLDEN_MODEL ? ["--model", process.env.GOLDEN_MODEL] : []), ...o.messages];
  const env: NodeJS.ProcessEnv = { ...process.env, PI_TUTOR: "1", PI_TUTOR_PROFILE: profilePath };
  delete env.NVIM; // detached: no editor link, even when run from a Neovim terminal

  return new Promise((resolve, reject) => {
    const child = spawn("pi", args, { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    const timer = setTimeout(() => child.kill("SIGTERM"), o.timeoutMs ?? 280_000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ replies: repliesOf(out), dir, stderr: err, code });
    });
  });
}
