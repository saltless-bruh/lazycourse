import { it } from "vitest";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkReply } from "../extensions/tutor/compliance.js";
import { loadPack, vocabOf } from "../extensions/tutor/packs.js";
import { parseJudgment, toJudgment, isJudgmentTool } from "../extensions/tutor/judgment.js";

// skill-creator test runs for the M7 pack skills (`npm run skill-evals`): each eval runs through the
// real `pi -p --mode json` with the tutor extension and the configured model, once per setup:
//   with_skill    = this checkout (language cards + pack skills)
//   without_skill = the checkout named by SKILL_EVAL_BASELINE (e.g. main, before the packs)
// Results land in SKILL_EVAL_WORKSPACE/iteration-N in skill-creator's layout (eval_metadata.json,
// <config>/run-K/{outputs/, grading.json, timing.json}) for its aggregate_benchmark and generate_review.
const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const WS = process.env.SKILL_EVAL_WORKSPACE ?? "";
const BASELINE = process.env.SKILL_EVAL_BASELINE ?? "";
const RUNS = Number(process.env.SKILL_EVAL_RUNS) || 2;
const PARALLEL = Number(process.env.SKILL_EVAL_PARALLEL) || 3;
const ONLY = process.env.SKILL_EVAL_ONLY?.split(",");

interface Eval { id: number; name: string; language: string; skill: string; skillsAny?: string[]; prompt: string; expected_output: string; files: Record<string, string>; idioms: { text: string; pattern: string }[] }
interface Run { reply: string; reads: string[]; tools: string[]; tags: string[] | null; transcript: string[] }
interface Expectation { text: string; passed: boolean; evidence: string }

const evals = (JSON.parse(readFileSync(join(PKG, "golden", "skill-evals.json"), "utf8")) as { evals: Eval[] }).evals
  .filter((e) => !ONLY || ONLY.includes(e.name));

type Content = { type: string; text?: string; name?: string; arguments?: Record<string, unknown> };

/** The last run's final reply, every `read` path, tool names, the judgment tags, and a readable transcript. */
function parse(stdout: string): Run {
  const run: Run = { reply: "", reads: [], tools: [], tags: null, transcript: [] };
  for (const line of stdout.split("\n")) {
    let ev: { type?: string; message?: { role?: string; content?: Content[] | string } };
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type !== "message_end" || ev.message?.role !== "assistant" || !Array.isArray(ev.message.content)) continue;
    const content = ev.message.content;
    const text = content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
    for (const c of content) if (c.type === "toolCall" && c.name) {
      run.tools.push(c.name);
      const path = typeof c.arguments?.path === "string" ? c.arguments.path : "";
      if (c.name === "read" && path) run.reads.push(path);
      run.transcript.push(`- tool \`${c.name}\` ${path || JSON.stringify(c.arguments ?? {})}`);
      if (!run.tags && isJudgmentTool(c.name)) run.tags = toJudgment(c.arguments)?.concept_tags ?? null;
    }
    if (text.trim()) { run.reply = text; run.transcript.push(`\n**assistant:**\n\n${text}\n`); }
    if (!run.tags) run.tags = parseJudgment(text)?.concept_tags ?? null;
  }
  return run;
}

async function seedProfile(root: string, file: string, e: Eval, dir: string) {
  // Each setup seeds with its own Profile module: the baseline may use an older schema.
  const { Profile } = (await import(join(root, "pi-tutor", "extensions", "tutor", "profile.ts"))) as typeof import("../extensions/tutor/profile.js");
  const p = Profile.open(file);
  p.saveLanguage(e.language, 50, {}, Date.now());
  p.addProject(e.language, dir, e.name, Date.now());
  p.close();
}

function runPi(root: string, e: Eval): Promise<{ stdout: string; stderr: string; seconds: number }> {
  return new Promise(async (resolve, reject) => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), `skilleval-${e.name}-`)));
    for (const [path, text] of Object.entries(e.files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    const profile = join(mkdtempSync(join(tmpdir(), "skilleval-profile-")), "profile.sqlite");
    await seedProfile(root, profile, e, dir);
    const ext = join(root, "pi-tutor", "extensions", "tutor", "index.ts");
    const skills = join(root, "pi-tutor", "skills");
    const args = ["-p", "--no-session", "--mode", "json", "-ne", "-e", ext, "--skill", skills,
      "--tools", "read,grep,find,ls,tutor_remember,tutor_recall", ...(process.env.SKILL_EVAL_MODEL ? ["--model", process.env.SKILL_EVAL_MODEL] : []), e.prompt];
    const env: NodeJS.ProcessEnv = { ...process.env, PI_TUTOR: "1", PI_TUTOR_PROFILE: profile };
    delete env.NVIM;
    const t0 = Date.now();
    const child = spawn("pi", args, { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    const timer = setTimeout(() => child.kill("SIGTERM"), 400_000);
    child.on("error", reject);
    child.on("close", () => { clearTimeout(timer); resolve({ stdout, stderr, seconds: (Date.now() - t0) / 1000 }); });
  });
}

function grade(e: Eval, r: Run): Expectation[] {
  const wanted = e.skillsAny ?? [e.skill];
  const read = r.reads.find((p) => wanted.some((s) => p.includes(`/${s}/`)));
  const out: Expectation[] = [
    { text: `loads ${wanted.join(" or ")}`, passed: Boolean(read), evidence: read ? `read ${read}` : `reads: ${r.reads.join(", ") || "none"}` },
  ];
  for (const i of e.idioms) {
    const m = new RegExp(i.pattern, "i").exec(r.reply);
    out.push({ text: i.text, passed: Boolean(m), evidence: m ? `reply has "${m[0]}"` : "not in the final reply" });
  }
  const issues = checkReply(r.reply, { band: "intermediate", rung: 2, judged: r.tags !== null, noCode: false, cols: 66 });
  out.push({ text: "keeps to the hint ladder (no code above rung 2, judged)", passed: !issues.includes("code-above-rung") && !issues.includes("missing-judgment"), evidence: `checkReply: ${JSON.stringify(issues)}` });
  const pack = loadPack(e.language);
  const vocab = pack ? vocabOf(pack, loadPack("editor")) : null;
  const tags = r.tags ?? [];
  const bad = vocab ? tags.filter((t) => !vocab.has(t.trim().toLowerCase().replace(/[\s_]+/g, "-"))) : [];
  out.push({ text: "judgment concept tags come from the card's list", passed: r.tags !== null && tags.length > 0 && bad.length === 0, evidence: r.tags === null ? "no judgment" : `tags ${JSON.stringify(tags)}${bad.length ? `, not in the card: ${JSON.stringify(bad)}` : ""}` });
  return out;
}

async function pool<T>(jobs: (() => Promise<T>)[], n: number): Promise<T[]> {
  const out: T[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (next < jobs.length) { const i = next++; out[i] = await jobs[i](); } }));
  return out;
}

it("pack skills: with vs without", async () => {
  if (!WS || !BASELINE) throw new Error("set SKILL_EVAL_WORKSPACE (…/iteration-N) and SKILL_EVAL_BASELINE (a checkout root without the packs)");
  const ROOT = join(PKG, "..");
  const setups: [string, string][] = [["with_skill", ROOT], ["without_skill", BASELINE]];
  const jobs: (() => Promise<void>)[] = [];
  for (const e of evals) {
    const evalDir = join(WS, `eval-${e.name}`);
    mkdirSync(evalDir, { recursive: true });
    writeFileSync(join(evalDir, "eval_metadata.json"), JSON.stringify({ eval_id: e.id, eval_name: e.name, prompt: e.prompt, assertions: [] }, null, 2));
    for (const [config, root] of setups) for (let k = 1; k <= RUNS; k++) jobs.push(async () => {
      const runDir = join(evalDir, config, `run-${k}`);
      mkdirSync(join(runDir, "outputs"), { recursive: true });
      const { stdout, stderr, seconds } = await runPi(root, e);
      const r = parse(stdout);
      writeFileSync(join(runDir, "outputs", "reply.md"), r.reply || "(no reply)");
      writeFileSync(join(runDir, "outputs", "transcript.md"), `# ${e.name} (${config}, run ${k})\n\n**prompt:** ${e.prompt}\n${r.transcript.join("\n")}\n`);
      writeFileSync(join(runDir, "events.jsonl"), stdout);
      if (stderr.trim()) writeFileSync(join(runDir, "stderr.txt"), stderr);
      const expectations = grade(e, r);
      const passed = expectations.filter((x) => x.passed).length;
      writeFileSync(join(runDir, "timing.json"), JSON.stringify({ total_tokens: 0, duration_ms: Math.round(seconds * 1000), total_duration_seconds: seconds }, null, 2));
      writeFileSync(join(runDir, "grading.json"), JSON.stringify({
        expectations,
        summary: { passed, failed: expectations.length - passed, total: expectations.length, pass_rate: Math.round((passed / expectations.length) * 100) / 100 },
        execution_metrics: { tool_calls: Object.fromEntries([...new Set(r.tools)].map((t) => [t, r.tools.filter((x) => x === t).length])), total_tool_calls: r.tools.length, output_chars: r.reply.length },
        timing: { executor_duration_seconds: seconds, total_duration_seconds: seconds },
      }, null, 2));
      process.stdout.write(`${e.name} ${config} run-${k}: ${passed}/${expectations.length} in ${seconds.toFixed(0)}s\n`);
    });
  }
  await pool(jobs, PARALLEL);
}, 6 * 60 * 60 * 1000);
