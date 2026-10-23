import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { retryAssistantCall } from "@earendil-works/pi-ai/compat";
import { NvimLink, type EditorSnapshot, type TutorPayload } from "./nvim.js";
import { renderWidget, renderStatus, type TutorState } from "./ui.js";
import { bandFor, thresholds, DEFAULT_LEVEL } from "./policy.js";
import { tutorPrompt, systemText } from "./prompts.js";
import { parseJudgment, toJudgment, isJudgmentTool, type Judgment } from "./judgment.js";
import { formatEditorContext, formatEpisodeContext } from "./context.js";
import { guardJudgment, checkReply, formatCheck, replyReminder, scrubInternals, diagramCols, ownNames, checkTurn, foldPreamble, hideJudgment, type Issue, type TurnIssue } from "./compliance.js";
import { MAX_REASKS, HOLD_TEXT, REWRITE_TEXT, fallbackReply } from "./turns.js";
import { DEFAULT_ROLE, roleNamed, rolePrompt } from "./roles.js";
import { parseThinkingMode, thinkingHidden, THINKING_LABEL, type ThinkingMode } from "./thinking.js";
import { rememberTool, recallTool, memorySnapshot, memoryLine } from "./memory.js";
import { writeInRoot } from "./files.js";
import { progressReport } from "./report.js";
import { tickTasks } from "./tasks.js";
import { STEPS, TASK_ID, startWorkflow, advance, workflowLabel, formatWorkflowContext, findTask, type Workflow } from "./workflow.js";
import { luaRuntime } from "./luarc.js";
import { goVersionOf } from "./manifest.js";
import { liveChecks, renderChecksMd, tickedIds, openTaskIds, type TickHow } from "./checks.js";
import { projectRun, runChecks, type CheckResult } from "./check-run.js";
import { currentMilestone, readChecksState, writeMilestoneChecks, type ChecksState } from "./check-job.js";
import { StuckDetector, isSyntaxError, spotOf, spotLine, type StuckEvent } from "./stuck.js";
import { sourceHash, projectSources } from "./source-hash.js";
import { easeDelay, attemptScore, stepFor, restoreAttempts, recordAttempt, yieldsTo, openEpisode, applyJudgment, closeEpisode, describeTrigger, type TurnStep, type CloseReason, type Episode, type Trigger } from "./ladder.js";
import { guardToolCall, skillDirs } from "./guard.js";
import { Profile, type FeedbackKind, type ProjectRow } from "./profile.js";
import { FEEDBACK_KINDS, activeFeedback, formatFeedback } from "./feedback.js";
import { suggestOne, createProject, defaultProjectDir, expandHome, isLanguage, LANGUAGES } from "./start.js";
import { newOnboarding, checkInOnboarding, parseIntake, applyTurn, missing, needsFallback, levelFrom, onboardPrompt, selfScoreNeeded, type Onboarding, type Fields } from "./onboard.js";
import { EXPERIENCE } from "./interview.js";
import { levelTasks, writeExercise, loadLessons, planRounds, startLessons, nextConcept, nextRound, type Lesson, type LessonState } from "./lessons.js";
import { scaffoldPrompt, checkScaffold, writeScaffold, taskIds } from "./scaffold.js";
import { completeJson, type Complete } from "./llm.js";
import { withLoader, Cancelled, MODEL_TIMEOUT_MS, SPEC_JOB_TIMEOUT_MS, PROVIDER_RETRY, type CustomUi } from "./progress.js";
import { lastClosedEpisode, transcript, learnPrompt, checkLearned, renderLearned, parseSkillHeader, saveSkill, type Learned } from "./learn.js";
import { fetchReference, referenceInfo, skillsRoot } from "./knowledge/reference.js";
import { loadPack, normalizeTags, vocabOf, cookbookIndex, remapConcepts, weakConcepts, type IndexEntry } from "./packs.js";
import { layout, runExamTests } from "./exam/layout.js";
import { BWRAP_PROBE, type SandboxHost } from "./exam/sandbox.js";
import { parseExamArgs, examPrompt, makeExam, LIMIT_MIN } from "./exam/make.js";
import { restoreExam, examLabel, formatExamContext, type ExamState } from "./exam/state.js";
import { learnerFiles, checkGrade, score, gradePrompt, renderGrade, type Grade } from "./exam/grade.js";
import { renderCard, renderEditorCard, renderIndex, indexWanted } from "./card.js";
import { overrideFor } from "./knowledge/sources.js";
import { LANGS, detectVersion, toolchainCache, languageOfFiletype } from "./knowledge/versions.js";

/** Bundled pack skills (cookbook, expert) that exist for a language; the card names them (spec §5.4). */
const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "skills");
const packSkills = (lang: string) => ["cookbook", "expert"].map((k) => `tutor-${lang}-${k}`).filter((s) => existsSync(join(SKILLS_DIR, s, "SKILL.md")));
/** The idiom index, built once per language from the bundled skill files; sent only when indexWanted (Option 2). */
const indexCache = new Map<string, string>();
function packIndex(lang: string): string {
  if (!indexCache.has(lang)) {
    let entries: IndexEntry[] = [];
    let refs: string[] | null = null;
    try { entries = cookbookIndex(readFileSync(join(SKILLS_DIR, `tutor-${lang}-cookbook`, "SKILL.md"), "utf8")); } catch { /* no cookbook */ }
    const expert = join(SKILLS_DIR, `tutor-${lang}-expert`);
    if (existsSync(join(expert, "SKILL.md"))) { try { refs = readdirSync(join(expert, "references")); } catch { refs = []; } }
    indexCache.set(lang, renderIndex({ language: lang, dir: SKILLS_DIR, entries, expertRefs: refs }));
  }
  return indexCache.get(lang)!;
}

type Ui = ExtensionContext["ui"];

/** Prefix of proactive messages; the ladder prompt tells the model what they are (spec §9). */
const TUTOR_PREFIX = "[tutor]";
/** How often persisting errors are checked against the band's error threshold. */
const TICK_MS = 5000;
/** Spec §5 "at most once per 2 minutes": the floor between proactive nudges. */
const NUDGE_GAP_MS = 120_000;

/** Last `tutor_level` custom entry on the active branch, if any. */
function restoreLevel(ctx: ExtensionContext): number | undefined {
  let level: number | undefined;
  for (const e of ctx.sessionManager.getBranch()) {
    if (e.type === "custom" && e.customType === "tutor_level") {
      const l = (e.data as { level?: unknown } | undefined)?.level;
      if (typeof l === "number" && Number.isInteger(l) && l >= 0 && l <= 100) level = l; // M2 #13
    }
  }
  return level;
}

/** Last `tutor_role` entry on the active branch (spec 2026-10-13 §3). */
function restoreRole(ctx: ExtensionContext): string {
  let role = DEFAULT_ROLE;
  for (const e of ctx.sessionManager.getBranch()) {
    if (e.type === "custom" && e.customType === "tutor_role") {
      const r = (e.data as { role?: unknown } | undefined)?.role;
      if (typeof r === "string") role = r;
    }
  }
  return role;
}

/** Last `tutor_workflow` entry on the active branch, if it is unfinished (spec 2026-10-13 §4). */
function restoreWorkflow(ctx: ExtensionContext): Workflow | null {
  let w: Workflow | undefined;
  for (const e of ctx.sessionManager.getBranch()) {
    if (e.type === "custom" && e.customType === "tutor_workflow") w = e.data as Workflow;
  }
  return w && typeof w.step === "number" && typeof w.task === "string" && w.done === undefined ? w : null;
}

/** Last `tutor_episode` entry on the active branch, if it is still open. */
function restoreEpisode(ctx: ExtensionContext): Episode | null {
  let ep: unknown;
  for (const e of ctx.sessionManager.getBranch()) {
    if (e.type === "custom" && e.customType === "tutor_episode") ep = e.data;
  }
  return ep === undefined ? null : restoreAttempts(ep);
}

function realCwd(cwd: string): string {
  try { return realpathSync(cwd); } catch { return cwd; }
}


/** Pi's model as a plain JSON-call function bound to one abort signal. */
function rawComplete(ctx: ExtensionContext, signal: AbortSignal): Complete {
  return async (system, user) => {
    const model = ctx.model;
    if (!model) throw new Error("no model selected");
    const r = await retryAssistantCall(() => ctx.modelRegistry.complete(model, { systemPrompt: system, messages: [{ role: "user", content: [{ type: "text", text: user }], timestamp: Date.now() }] }, { signal }), PROVIDER_RETRY, signal);
    if (r.stopReason !== "stop") throw new Error(`model stopped (${r.stopReason})${r.errorMessage ? `: ${r.errorMessage}` : ""}`);
    return r.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("\n");
  };
}

/**
 * Run slow work behind Pi's BorderedLoader (Esc cancels) in the TUI, or just a timeout elsewhere;
 * setWorkingMessage alone is invisible outside an agent turn.
 */
async function withProgress<T>(ctx: ExtensionContext, label: string, run: (signal: AbortSignal) => Promise<T>, what?: string): Promise<T> {
  if (ctx.mode !== "tui" || typeof ctx.ui.custom !== "function") return run(AbortSignal.timeout(MODEL_TIMEOUT_MS));
  const { BorderedLoader } = await import("@earendil-works/pi-coding-agent");
  const make = (tui: unknown, theme: unknown, message: string) => new BorderedLoader(tui as never, theme as never, message, { cancellable: true });
  return withLoader(ctx.ui.custom.bind(ctx.ui) as unknown as CustomUi, make, label, run, MODEL_TIMEOUT_MS, what);
}

/** Each model call gets its own loader showing `label()` (spec §6 suggest/scaffold). */
function modelComplete(ctx: ExtensionContext, label: () => string): Complete {
  return (system, user) => withProgress(ctx, label(), (signal) => rawComplete(ctx, signal)(system, user));
}

export default function (pi: ExtensionAPI): void {
  // pi-tutor is installed globally; only the Pi that nvim-tutor starts is the tutor.
  if (process.env.PI_TUTOR !== "1") return;
  const state: TutorState = { state: "idle", connected: false };
  let link: NvimLink | null = null;
  let ui: Ui | null = null;
  let session: ExtensionContext | null = null;
  let episode: Episode | null = null;
  /** Latest push-signal text, shown when no episode is open. */
  let signal = "idle";
  let tick: ReturnType<typeof setInterval> | null = null;
  let lastNudge = -Infinity;
  /** session_shutdown in progress (/new, /resume, quit): our own link close is not the editor going away (M3 #19). */
  let closing = false;
  let profile: Profile | null = null;
  /** The recorded project this Pi runs in (cwd), if any: the source of the profile language. */
  let project: ProjectRow | null = null;
  /**
   * The agent run in flight (before_agent_start → turn_end…): the learner message it answers and
   * whether a judgment was already applied. One judgment per run: a model that "calls" tutor-judgment
   * and then writes the fence must not count twice.
   */
  /** `episodeId`: the episode a ladder-role run answers, `null` when it started without one (M6c M6). */
  /** `lang`: the language at the prompt; the judgment's tags use it (M7 minor: not the language at turn_end). */
  /** `step`: this turn's step on the attempt ladder (spec 2026-10-21 §5), `null` outside a ladder role. */
  /** `reasks`/`rejected`: spec 2026-10-21 §6 held replies; `names`/`sourceLines`: what the reply check compares with. */
  let run: { prompt: string; step: TurnStep | null; judged: boolean; episodeId?: string | null; lang?: string | null; reasks?: number; rejected?: boolean; names?: Set<string>; sourceLines?: string[]; referenceLines?: string[] } | null = null;
  /** A held reply failed its check: the re-ask count carried into the "[tutor] rewrite:" run, and its reasons. */
  let rewrite: { reasks: number; issues: TurnIssue[]; step: TurnStep } | null = null;
  /** Reasons to send as the next "[tutor] rewrite:" once this run ends. */
  let pendingRewrite: TurnIssue[] | null = null;
  /** Messages typed mid-reply that Pi has queued (steer or followUp) but not yet delivered to the model. */
  let pendingSteers = 0;
  /** Rule breaks in the last reply (spec 2026-10-13 §7 #2), quoted to the model on the next turn. */
  let lastIssues: Issue[] = [];
  /** Markdown width Pi last rendered a reply at; undefined until the TUI draws one (print mode never does). */
  let paneWidth: number | undefined;
  /** Thinking visibility (learner setting, kept in the profile): auto hides it only at the pro band. */
  let thinking: ThinkingMode = "auto";
  // Spec 2026-10-19 §5–6: /tutor-start as a conversation. The state lives in the profile (setting
  // "onboarding") so it survives /new, a Pi restart and the move into the project folder.
  let onboarding: Onboarding | null = null;
  /** The last intake note read from this run's replies; undefined when the run had no reply text. */
  let intake: Partial<Fields> | null | undefined;
  /** /tutor-start ran in this session: onboarding may run here even inside an unrelated project's folder. */
  let onboardingHere = false;
  /** Bumped at every session start; a background job only paints the session that started it (final review I2). */
  let generation = 0;
  /** Project paths whose plan job is running in this process (it outlives /new). */
  const specRunning = new Set<string>();
  /** Learn-first lessons for this project (spec 2026-10-19 §7), saved as profile setting `lesson:<project path>`. */
  let lesson: LessonState | null = null;
  /** The background spec job (Q10): shown on the widget's second line while writing or after a failure. */
  let specStatus: "writing" | "failed" | null = null;
  // Plan 2026-10-16 S1: model-written exam tests run in bubblewrap unless the learner turns it off.
  let examSandbox: "on" | "off" = "on";
  const sandboxHost = (): SandboxHost | null => (examSandbox === "off" ? null
    : { env: process.env, home: homedir(), cacheDir: join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "lazycourse") });
  /** Toolchain per language+root (spec §5.1): versions re-checked every few minutes, the constraint every turn. */
  const toolchainOf = toolchainCache((command, args, options) => pi.exec(command, args, options));
  /** Active role (spec 2026-10-13 §3), persisted as `tutor_role` entries. */
  let activeRole = DEFAULT_ROLE;
  /** Design-recipe workflow in progress (spec 2026-10-13 §4), persisted as `tutor_workflow` entries. */
  let workflow: Workflow | null = null;
  /** The exam in progress (spec 2026-10-13 §6), persisted as `tutor_exam` entries. */
  let exam: ExamState | null = null;
  const level = () => state.level ?? DEFAULT_LEVEL;
  // An editor trigger may open an episode when none is open, or replace one that yields (ladder.yieldsTo).
  const detector = new StuckDetector(() => thresholds(level()), () => yieldsTo(episode));
  // Spec 2026-10-13 §7.1: the model's two memory tools, scoped to this session's project.
  /** The language to use outside a recorded project: the buffer's filetype, if it is a pack language (M5 #38). */
  const editorLanguage = () => languageOfFiletype(state.language);
  const memoryScope = { profile: () => profile, language: () => project?.language ?? editorLanguage(), project: () => project?.path ?? null, now: Date.now };
  pi.registerTool(rememberTool(memoryScope));
  pi.registerTool(recallTool(memoryScope));
  /** Frozen at session start (spec §7.1): a stable prompt within a session; new memories show next session. */
  let memoryNote: string | null = null;
  /** The learner's feedback history (spec §7 #7): the profile's per language in a project, else this session's. */
  let feedbackHistory: FeedbackKind[] = [];

  /**
   * Final review I3: the exam outlives the session (/new, a second Pi) through the profile, keyed by
   * project; the last state there wins over an older session's entries (a closed exam stays closed).
   */
  function saveExam(state: ExamState) {
    pi.appendEntry("tutor_exam", state);
    if (project && profile) { const p = profile, key = `exam:${project.path}`; profileWrite(() => p.setSetting(key, JSON.stringify(state))); }
  }
  /** Final review M1 (re-graded): one exam command at a time; a second submit must not grade twice. */
  let examBusy = false;

  async function exclusive(ctx: ExtensionContext, run: () => Promise<void>): Promise<void> {
    if (examBusy) { ctx.ui.notify("an exam command is still running; wait for it to finish", "warning"); return; }
    examBusy = true;
    try { await run(); } finally { examBusy = false; }
  }

  /** One repaint a second while an exam runs (spec §6 mm:ss); unref'd, cleared when the exam ends. */
  let examTimer: ReturnType<typeof setInterval> | null = null;
  function examClock() {
    if (exam && !examTimer) { examTimer = setInterval(paint, 1000); examTimer.unref?.(); }
    if (!exam && examTimer) { clearInterval(examTimer); examTimer = null; }
  }

  function paint() {
    state.attempt = episode?.attempts || undefined;
    state.exam = exam ? examLabel(exam, Date.now()) : undefined;
    state.state = episode ? `stuck: ${describeTrigger(episode.trigger)}`
      : specStatus === "writing" ? "spec: writing…" : specStatus === "failed" ? "spec error: /tutor-start spec" : signal;
    const r = roleNamed(activeRole);
    state.role = r.name === DEFAULT_ROLE ? undefined : r.name;
    if (!r.ladder) state.attempt = undefined;
    state.task = workflow ? workflowLabel(workflow) : undefined;
    state.lesson = lesson ? lessonLabel(lesson) : undefined;
    if (!ui) return;
    ui.setWidget("tutor", renderWidget(state));
    ui.setStatus("tutor", renderStatus(state));
  }

  function setRole(name: string) {
    if (name === activeRole) return;
    activeRole = name;
    pi.appendEntry("tutor_role", { role: name });
  }

  function setLevel(n: number) {
    state.level = n;
    if (episode) {
      episode = { ...episode, band: bandFor(n) };
      pi.appendEntry("tutor_episode", episode);
    }
  }

  function openEp(trigger: Trigger, nudge: boolean) {
    // Spec 2026-10-13 §7 #4: a failed run is the learner's explicit check; it replaces any episode and nudges without the gap.
    if (trigger.kind === "run") { failedRun(trigger, nudge); return; }
    if (episode) {
      // Chat, idle and churn episodes may never close on their own; editor triggers must not be lost behind them.
      if (!nudge || !yieldsTo(episode)) return;
      closeEp("superseded");
    }
    episode = openEpisode(trigger, bandFor(level()), Date.now());
    pi.appendEntry("tutor_episode", episode);
    nudgeFor(trigger, nudge, false);
  }

  /**
   * Spec 2026-10-21 §5: a failed run is a graded try on its spot. A syntax error in the run's own output makes
   * it a typo run (author 2026-10-21): no attempt, no nudge. The same spot again with changed code climbs; unchanged
   * code does not; a new spot starts a new episode. The nudge comes only when the count went up.
   */
  /**
   * Live check 2026-10-21: a different error in between (a typo) must not throw away the count on the spot the
   * learner returns to. Counts per spot live until a run passes.
   */
  const spotMemory = new Map<string, { attempts: number; lastHash?: string }>();
  const remember = (ep: Episode) => {
    if (!ep.spot) return;
    spotMemory.delete(ep.spot);
    spotMemory.set(ep.spot, { attempts: ep.attempts, lastHash: ep.lastHash });
    if (spotMemory.size > 20) spotMemory.delete(spotMemory.keys().next().value!);
  };
  function failedRun(trigger: Extract<Trigger, { kind: "run" }>, nudge: boolean, spotKey?: string) {
    const root = realCwd(project?.path ?? session?.cwd ?? process.cwd());
    if (isSyntaxError(trigger.trace)) { signal = "run failed: a syntax error (fix the line it names)"; paint(); return; }
    const spot = spotKey ?? spotOf(trigger.trace), hash = sourceHash(root);
    if (episode?.trigger.kind === "run" && episode.spot === spot) {
      const before = episode.attempts;
      episode = recordAttempt({ ...episode, trigger }, { spot, hash });
      remember(episode);
      pi.appendEntry("tutor_episode", episode);
      if (episode.attempts > before) nudgeFor(trigger, nudge, true);
      return;
    }
    if (episode) closeEp("superseded");
    const fresh = openEpisode(trigger, bandFor(level()), Date.now());
    const prior = spotMemory.get(spot);
    episode = recordAttempt(prior ? { ...fresh, spot, attempts: prior.attempts, lastHash: prior.lastHash } : fresh, { spot, hash });
    remember(episode);
    pi.appendEntry("tutor_episode", episode);
    nudgeFor(trigger, nudge, true);
  }

  /**
   * Spec §4 "Intervenes": one nudge per editor-triggered episode, never on top of a running
   * reply, and at most one per NUDGE_GAP_MS so a run of changing errors is not a run of turns
   * (`anyGap`: a failed run skips the gap).
   */
  function nudgeFor(trigger: Trigger, nudge: boolean, anyGap: boolean) {
    const now = Date.now();
    // The architect discusses design: editor stuck signals still open episodes but do not interrupt it.
    if (nudge && roleNamed(activeRole).ladder && session?.isIdle() && (anyGap || now - lastNudge >= NUDGE_GAP_MS)) {
      lastNudge = now;
      pi.sendUserMessage(`${TUTOR_PREFIX} stuck signal: ${describeTrigger(trigger)}`, { deliverAs: "followUp" });
    }
  }


  /**
   * Spec §5: a closed episode is mirrored to the profile. Only inside a recorded project, and under
   * the project's language: the buffer filetype (state.language) is display-only — right after the
   * switch it is `markdown` (spec/tasks.md).
   */
  /**
   * Profile writes run from Neovim notifications and the tick, outside any Pi handler: an uncaught
   * SQLITE_BUSY or I/O error there would crash Pi, so it becomes a warning instead.
   */
  function profileWrite(write: () => void) {
    try { write(); } catch (e) { ui?.notify(`tutor: profile write failed: ${e instanceof Error ? e.message : String(e)}`, "warning"); }
  }

  function mirror(closed: Episode) {
    if (!profile || !project || closed.closed === undefined) return;
    const score = attemptScore(closed);
    if (score === null) return;
    const p = profile, proj = project, closedAt = closed.closed;
    profileWrite(() => p.recordEpisode({
      language: proj.language,
      project: proj.path,
      concept_tags: closed.concept_tags,
      rungs_used: closed.attempts + 1, // spec 2026-10-21 §11a: the column now counts failed attempts (+1)
      turns: closed.turns, opened: closed.opened, closed: closedAt,
    }, score));
  }

  function closeEp(reason: CloseReason) {
    if (!episode) return;
    const closed = closeEpisode(episode, reason, Date.now());
    pi.appendEntry("tutor_episode", closed);
    mirror(closed);
    episode = null;
    signal = `episode closed (${reason})`;
  }

  function onStuck(events: StuckEvent[]) {
    for (const e of events) {
      if (e.type === "open") openEp(e.trigger, true);
      else if (e.type === "run_passed") { closeEp("run_passed"); spotMemory.clear(); }
      else if (episode?.trigger.kind === "error" && episode.trigger.path === e.path && episode.trigger.msg === e.msg) closeEp("cleared");
    }
  }

  function onPayload(p: TutorPayload) {
    switch (p.kind) {
      case "diagnostics":
        signal = p.errors > 0 ? `error: ${p.first?.msg ?? ""}` : p.warnings > 0 ? `${p.warnings} warning(s)` : "clean";
        break;
      case "idle": signal = `idle ${Math.round(p.since_ms / 1000)}s`; break;
      case "churn": signal = `churning lines ${p.region[0]}-${p.region[1]}`; break;
      case "run_output": signal = p.code === 0 ? "run passed" : `run failed (exit ${p.code})`; break;
    }
    pi.appendEntry("tutor_signal", p);
    onStuck(detector.observe(p, Date.now()));
    paint();
  }

  pi.on("session_start", async (_event, ctx) => {
    closing = false;
    session = ctx;
    ui = ctx.hasUI ? ctx.ui : null;
    if (!profile) {
      try { profile = Profile.open(); } catch (e) { ctx.ui.notify(`tutor profile unavailable: ${e instanceof Error ? e.message : String(e)}`, "warning"); }
    }
    const proj = profile?.projectAt(realCwd(ctx.cwd));
    project = proj ?? null;
    if (proj) state.language = proj.language;
    // M2 #14: a new session (/new) without a project keeps the level this Pi already has.
    state.level = restoreLevel(ctx) ?? (proj ? profile?.language(proj.language)?.level : undefined) ?? state.level ?? DEFAULT_LEVEL;
    if (profile) { const p = profile; profileWrite(() => { thinking = parseThinkingMode(p.setting("thinking") ?? "") ?? "auto"; examSandbox = p.setting("exam_sandbox") === "off" ? "off" : "on"; }); }
    memoryNote = null;
    if (profile) { const p = profile; profileWrite(() => { memoryNote = memorySnapshot(p.memories({ language: project?.language ?? null, limit: 40 })); }); }
    feedbackHistory = [];
    if (project && profile) { const p = profile, lang = project.language; profileWrite(() => { feedbackHistory = p.feedback(lang).map((f) => f.kind); }); }
    else for (const e of ctx.sessionManager.getBranch()) {
      if (e.type === "custom" && e.customType === "tutor_feedback") feedbackHistory.push((e.data as { kind: FeedbackKind }).kind);
    }
    onboarding = loadOnboarding();
    onboardingHere = false;
    generation++;
    lesson = null;
    if (project && profile) { const p = profile, key = `lesson:${project.path}`; profileWrite(() => { const raw = p.setting(key); if (raw) { try { lesson = JSON.parse(raw) as LessonState; } catch { lesson = null; } } }); }
    // Q23: the Pi that restarted in the new project folder carries the conversation on: build or learn.
    if (onboardingActive() && onboarding?.stage === "choose") kick(ctx, "ask whether they want to start building now, or first learn the ideas the project needs in short lessons with small exercises");
    // Final review C1: a pending choice belongs to its folder; elsewhere the learner is only told where to go.
    else if (onboarding?.stage === "choose" && !onboarding.paused && onboarding.dir) ctx.ui.notify(`your project "${onboarding.project?.title ?? "?"}" is waiting in ${onboarding.dir}: open it there to choose build now or learn first`, "info");
    // Final review I2 / Review Focus #4: a plan job that did not finish (Pi quit) is reported, not forgotten.
    specStatus = null;
    if (project && profile) {
      const p = profile, key = `specjob:${project.path}`;
      let pending = false;
      profileWrite(() => { pending = !!p.setting(key); });
      if (pending) specStatus = specRunning.has(project.path) ? "writing" : "failed";
    }
    ensureChecks(ctx);
    episode = restoreEpisode(ctx);
    activeRole = restoreRole(ctx);
    workflow = restoreWorkflow(ctx);
    let saved: ExamState | null | undefined;
    if (project && profile) {
      const p = profile, key = `exam:${project.path}`;
      profileWrite(() => { const raw = p.setting(key); if (raw) { try { saved = restoreExam([{ type: "custom", customType: "tutor_exam", data: JSON.parse(raw) }]); } catch { saved = undefined; } } });
    }
    exam = saved !== undefined ? saved : restoreExam(ctx.sessionManager.getBranch());
    if (episode) detector.adopt(episode.trigger, Date.now());
    if (!link) {
      // Pane review #5: an old link's disconnect can land after /new or /resume connected a new one;
      // only the link that is still current may mark the editor as gone.
      let mine: NvimLink | null = null;
      link = mine = await NvimLink.connect({
        root: ctx.cwd,
        onPayload,
        onDisconnect: () => { if (mine === null || link !== mine) return; state.connected = false; link = null; if (closing) return; state.lost = true; paint(); },
      });
      state.connected = link !== null;
      if (link) state.lost = false;
    }
    if (!tick) {
      tick = setInterval(() => {
        const ev = detector.tick(Date.now());
        if (ev.length) { onStuck(ev); paint(); }
      }, TICK_MS);
      tick.unref?.();
    }
    examClock();
    paint();
  });

  pi.on("session_shutdown", async () => {
    closing = true;
    // Pane check #2: /new and /reload build a new extension; jobs still running in this one stay silent.
    generation++;
    if (tick) clearInterval(tick);
    if (examTimer) clearInterval(examTimer);
    examTimer = null;
    tick = null;
    profile?.close();
    profile = null;
    await link?.close();
    link = null;
    state.connected = false;
  });

  /** The language card for `lang` at `root` (spec §5), shared by every turn and the exam-maker. */
  async function languageCard(lang: string, root: string): Promise<string | null> {
    const pack = loadPack(lang);
    if (!pack) return null;
    let knows: string[] = [];
    if (profile) { const p = profile; profileWrite(() => { knows = p.languages(); }); }
    return renderCard(pack, { tc: await toolchainOf(lang, root), ref: referenceInfo(skillsRoot(), lang), knows, skills: packSkills(lang), skillsDir: SKILLS_DIR });
  }

  // Spec §4/§5: band prompt section, then the per-turn hidden context (episode + editor snapshot).
  pi.on("before_agent_start", async (event) => {
    if (onboardingActive()) {
      // Spec 2026-10-19 §6: the onboarding rules replace the ladder prompt (no judgment block asked for).
      event.systemPromptOptions.sections["tutor"] = systemText("onboard");
      event.systemPromptOptions.sections["tutor_onboard"] = onboardPrompt(onboarding!);
      if (memoryNote) event.systemPromptOptions.sections["tutor_memory"] = memoryNote;
      intake = undefined;
      run = { prompt: event.messageType === "user" ? event.prompt : "", step: null, judged: true };
      return;
    }
    const band = bandFor(level());
    if (lesson && project) event.systemPromptOptions.sections["tutor_lesson"] = lessonSection(lesson, project.language);
    const role = roleNamed(activeRole);
    event.systemPromptOptions.sections["tutor"] = tutorPrompt(band, { role: rolePrompt(role), ladder: role.ladder });
    if (memoryNote) event.systemPromptOptions.sections["tutor_memory"] = memoryNote;
    // Pi 1.2+: runs started by an extension's custom message (`messageType: "custom"`) carry no prompt.
    const prompt = event.messageType === "user" ? event.prompt : "";
    // A learner's chat message opens an episode; our own [tutor] nudges, custom-message runs and non-ladder roles do not.
    if (role.ladder && !episode && event.messageType === "user" && !prompt.startsWith(TUTOR_PREFIX)) { openEp({ kind: "chat" }, false); paint(); }
    pendingSteers = 0;
    // Spec 2026-10-21 §6: a rewrite run keeps the re-ask count of the reply it replaces; any other run starts at 0.
    const isRewrite = event.messageType === "custom" && event.message.customType === "tutor_rewrite";
    if (!isRewrite) rewrite = null;
    // Final review I2: on a run's episode the fix answers the failed run's own nudge (or its rewrite, or a pro's
    // /tutor-fix); a chat question after it is at why, so a later unrelated question never runs with the leak check off.
    let step = role.ladder ? stepFor(episode, { exam: exam !== null }) : null;
    const answersRun = prompt.startsWith(`${TUTOR_PREFIX} stuck signal: run failed`) || (isRewrite && rewrite?.step === "fix") || episode?.fixAsked === true;
    if (step === "fix" && episode?.trigger.kind === "run" && !answersRun) step = "why";
    run = { prompt, step, judged: false, episodeId: role.ladder ? episode?.id ?? null : undefined, reasks: rewrite?.reasks ?? 0 };
    let snap: EditorSnapshot | null = null;
    if (link) {
      try { snap = await link.snapshot(band === "beginner" ? "full" : "window"); } catch { snap = null; }
    }
    if (snap?.filetype) { state.language = snap.filetype; paint(); }
    if (run.step !== null) {
      // The learner's own names for the reply check: task signatures and their definitions, inside the root only.
      const root = realCwd(project?.path ?? session?.cwd ?? process.cwd());
      let tasksMd: string | null = null;
      try { tasksMd = readFileSync(join(root, "spec", "tasks.md"), "utf8"); } catch { tasksMd = null; }
      const sources = projectSources(root);
      if (snap && realCwd(snap.path).startsWith(root + "/")) sources.push(snap.lines.join("\n"));
      run.names = ownNames({ tasksMd, sources });
      // The failed run's output is what the learner saw too: quoting it is not a leak.
      const trace = episode?.trigger.kind === "run" ? episode.trigger.trace : "";
      run.sourceLines = [...sources, trace].flatMap((t) => t.split(/\r?\n/));
      // Spec §7: the current milestone's hidden reference; its lines are the answer until the fix step.
      if (project && profile && tasksMd !== null) {
        const p = profile, key = `checks:${project.path}`, now = currentMilestone(tasksMd, lesson);
        let state: ChecksState = { milestones: {} };
        profileWrite(() => { state = readChecksState(p.setting(key)); });
        const k = Object.keys(state.milestones).map(Number).filter((n) => n <= now).sort((a, b) => b - a)[0];
        run.referenceLines = k ? state.milestones[k].reference.split(/\r?\n/) : [];
      }
    }
    // Spec §5, §5.4: the project's (or, outside one, the editor's) language card, and the editor card.
    const lang = project?.language ?? editorLanguage();
    run.lang = lang;
    const pack = lang ? loadPack(lang) : null;
    const editorPack = loadPack("editor");
    const cards: string[] = [];
    const card = lang ? await languageCard(lang, project?.path ?? session?.cwd ?? process.cwd()) : null;
    if (card) cards.push(card);
    if (editorPack) cards.push(renderEditorCard(editorPack));
    if (cards.length) event.systemPromptOptions.sections["tutor_lang"] = cards.join("\n\n");
    const parts: string[] = [];
    if (episode && role.ladder) parts.push(formatEpisodeContext(episode, run.step ?? "teach"));
    if (exam && role.ladder) parts.push(formatExamContext(exam, Date.now()));
    // The architect suspends the recipe (M6a minor): no step context for a role that must not write code.
    if (workflow && role.ladder) parts.push(formatWorkflowContext(workflow, band));
    // Option 2: the idiom index only at the recipe's Map step or on a how-do-I question, this turn only.
    const mapStep = workflow !== null && role.ladder && STEPS[workflow.step - 1] === "Map";
    if (lang && pack && role.ladder && indexWanted({ prompt, mapStep })) {
      const index = packIndex(lang);
      if (index) parts.push(index);
    }
    if (isRewrite && rewrite) parts.push(formatCheck(rewrite.issues, diagramCols(paneWidth)));
    else if (lastIssues.length) parts.push(formatCheck(lastIssues, diagramCols(paneWidth)));
    const fb = formatFeedback(activeFeedback(feedbackHistory));
    if (fb) parts.push(fb);
    parts.push(replyReminder(run.step, workflow !== null && role.ladder));
    if (snap) parts.push(formatEditorContext(snap));
    return { message: { customType: "tutor_editor", content: parts.join("\n\n"), display: false, details: { band, path: snap?.path, episode: episode?.id } } };
  });

  /** Move the design recipe on one step when `stepDone`; persists it and drops it once finished. */
  function advanceWorkflow(stepDone: boolean): Workflow | null {
    if (!workflow) return null;
    const next = advance(workflow, stepDone, Date.now());
    if (next === workflow) return workflow;
    pi.appendEntry("tutor_workflow", next);
    if (next.done !== undefined) ui?.notify(`design recipe for ${next.task} finished`, "info");
    workflow = next.done === undefined ? next : null;
    return next;
  }

  /** Apply one accepted judgment to the episode and the profile (spec §5). */
  function applyTurnJudgment(raw: Judgment, episodeId?: string | null, promptLang?: string | null) {
    // Spec §5.4 (gap #5): tags from the card's vocabulary (aliases mapped, unknown dropped), plus the
    // editor pack's; a language with no pack keeps its tags, only normalized. The vocabulary is the one
    // the model saw on its card at the prompt (M7 minor); a run with no prompt falls back to now.
    const lang = promptLang !== undefined ? promptLang : project?.language ?? editorLanguage();
    const pack = lang ? loadPack(lang) : null;
    const j: Judgment = { ...raw, concept_tags: normalizeTags(raw.concept_tags, pack ? vocabOf(pack, loadPack("editor")) : null) };
    state.last = j.judgment;
    pi.appendEntry("tutor_judgment", j);
    // Spec 2026-10-21 §7: tasks are ticked from evidence (/tutor-done), never by the model; task_done_ids is ignored.
    const ladder = roleNamed(activeRole).ladder;
    if (ladder) advanceWorkflow(j.step_done);
    // The architect records concepts but never moves the hint ladder (spec 2026-10-13 §3).
    // M3 #17: the reply answered an episode an editor trigger has since replaced (or, M6c M6, none:
    // the run started without one and an editor episode opened mid-reply).
    if (!ladder || !episode || (episodeId !== undefined && episode.id !== episodeId)) return;
    if (episode.turns === 0 && project && profile) {
      let known = new Map<string, number>();
      const p = profile, lang = project.language;
      const vocab = pack ? vocabOf(pack, loadPack("editor")) : null;
      profileWrite(() => { known = new Map(remapConcepts(p.concepts(lang), vocab).map((c) => [c.tag, c.ease])); });
      episode = easeDelay(episode, j.concept_tags, (t) => known.get(t));
    }
    episode = applyJudgment(episode, j, Date.now());
    pi.appendEntry("tutor_episode", episode);
    if (episode.closed !== undefined) { mirror(episode); episode = null; signal = "episode closed (judged)"; }
  }

  // M6a #56: Pi delivers a message typed mid-reply into the running loop without a new
  // before_agent_start (agent-session.js:1550-1560). `input` fires while the current reply still
  // streams; that reply's turn_end comes first, and the queued text reaches the model later as a
  // user message_start (pi-agent-core agent-loop.js:114-118, 180-186). The run follows the message
  // when it is delivered, using the delivered text (skill and template expansion may change it).
  pi.on("input", (event) => {
    if (event.streamingBehavior) pendingSteers++;
    return undefined;
  });
  pi.on("message_start", (event) => {
    const m = event.message;
    if (m.role !== "user" || !run || pendingSteers === 0) return;
    pendingSteers--;
    const text = typeof m.content === "string" ? m.content : m.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("\n");
    run = { ...run, prompt: text, judged: false };
  });

  // Style guards (golden 2026-10-13: "At rung 1, …", "line 4597 in INDEX.md"). The screen shows the
  // reworded text while it streams; message_end swaps it into the finished reply before turn_end,
  // the saved session and the model's next context see it. Fences (the judgment block) are kept.
  /** A teaching turn: its reply is held off screen while it streams and checked before it is shown. */
  const held = () => run !== null && run.step !== null && !onboardingActive();
  const guarded = () => held() && run!.step !== "fix";
  pi.registerMarkdownTransformer((md, c) => {
    // Spec 2026-10-21 §6: before the fix is allowed the thinking (where the model works the fix out) stays hidden.
    if (c.messageType === "assistant-thinking") return thinkingHidden(thinking, bandFor(level()), guarded()) ? THINKING_LABEL : md;
    if (c.messageType !== "assistant") return md;
    paneWidth = c.availableWidth;
    if (held() && c.isStreaming) return HOLD_TEXT;
    const shown = hideJudgment(scrubInternals(md));
    return held() ? foldPreamble(shown) : shown;
  });
  pi.on("message_end", (event) => {
    const m = event.message;
    if (m.role !== "assistant") return;
    // Live check 2026-10-19: a run Pi continues from our kick has no before_agent_start, so the onboarding
    // state, not a flag set there, decides what an exchange is.
    if (onboardingActive()) {
      // The note must be read here: the scrubbed reply (no fence) is what turn_end and the session see.
      const text = m.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("\n");
      if (text.trim()) intake = parseIntake(text);
    }
    let changed = false;
    let content = m.content.map((c) => {
      if (c.type !== "text") return c;
      const text = held() ? foldPreamble(scrubInternals(c.text)) : scrubInternals(c.text);
      if (text === c.text) return c;
      changed = true;
      return { ...c, text };
    });
    const cur = run;
    const text = content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("\n");
    if (held() && cur && cur.step !== null && text.trim()) {
      const issues = checkTurn(text, { step: cur.step, names: cur.names ?? new Set(), sourceLines: cur.sourceLines ?? [], referenceLines: cur.referenceLines });
      if (issues.length) {
        // The session keeps what was rejected (never shown) so a live audit can tell a leak from a too-strict check.
        pi.appendEntry("tutor_check", { issues, step: cur.step, reasks: cur.reasks ?? 0, rejected: text.slice(0, 2000) });
        // Final review M2: a reply cut off (length) or broken (error) is still the last word of its run: it gets the
        // fallback, never an empty reply. Only a clean stop is re-asked.
        const final = !m.content.some((c) => c.type === "toolCall");
        let replacement = "";
        if (final && m.stopReason === "stop" && (cur.reasks ?? 0) < MAX_REASKS) {
          replacement = REWRITE_TEXT;
          rewrite = { reasks: (cur.reasks ?? 0) + 1, issues, step: cur.step };
          pendingRewrite = issues;
        } else if (final) {
          replacement = fallbackReply(cur.step, episode?.trigger.kind === "run" ? spotLine(episode.trigger.trace) : undefined);
          rewrite = null;
        }
        // A tool-use turn's text is dropped, not re-asked: the run goes on and its final reply is checked.
        if (final) cur.rejected = true;
        let placed = false;
        const next: typeof content = [];
        for (const c of content) {
          if (c.type !== "text") next.push(c);
          else if (!placed) { placed = true; next.push({ ...c, text: replacement }); }
        }
        content = next;
        changed = true;
      }
    }
    return changed ? { message: { ...m, content } } : undefined;
  });

  // Spec §5: take the judgment (fence, fallback, or invented tool call) and apply it once per run.
  pi.on("turn_end", async (event) => {
    const m = event.message;
    if (m.role !== "assistant") return;
    if (onboardingActive()) return; // onboarding exchanges carry no judgment
    // Aborted, errored and truncated turns carry no judgment.
    if (m.stopReason !== "stop" && m.stopReason !== "toolUse") return; // pending, deferred, aborted, error, length carry no judgment
    const cur = run ?? (run = { prompt: "", step: roleNamed(activeRole).ladder ? stepFor(episode, { exam: exam !== null }) : null, judged: false });
    // A held reply that failed its check was replaced: it carries no judgment and is not checked again here.
    if (cur.rejected) { paint(); return; }
    let callArgs: unknown;
    for (const c of m.content) if (c.type === "toolCall" && isJudgmentTool(c.name)) callArgs = c.arguments;
    const final = m.stopReason === "stop" && !m.content.some((c) => c.type === "toolCall");
    const text = m.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("\n");
    // A judgment may come in a tool-use turn's text too (live check); the first one in the run counts.
    const j = callArgs !== undefined ? toJudgment(callArgs) : parseJudgment(text);
    if (j && !cur.judged) { cur.judged = true; applyTurnJudgment(guardJudgment(j, cur.prompt), cur.episodeId, cur.lang); }
    if (final) {
      if (!cur.judged) state.last = "missing";
      lastIssues = checkReply(text, { band: bandFor(level()), step: cur.step, judged: cur.judged, noCode: bandFor(level()) === "pro" || !roleNamed(activeRole).ladder, cols: diagramCols(paneWidth) });
      if (lastIssues.length) pi.appendEntry("tutor_check", { issues: lastIssues });
    }
    paint();
  });

  // Spec §8 tool fence: read-only tools inside the project root. Defence in depth behind `--tools`.
  // Plus the folders of skills Pi loaded (spec §7): skills load through `read`.
  pi.on("tool_call", (event, ctx) => guardToolCall(event.toolName, event.input as Record<string, unknown>, ctx.cwd, skillDirs(pi.getCommands())));

  // Spec §3.4/§4: every turn carries one hidden tutor_editor message. Keep only
  // the newest so stale snapshots do not pile up in the model's context; the same for progress reports (M8).
  const NEWEST_ONLY = new Set(["tutor_editor", "tutor_progress"]);
  pi.on("context", (event) => {
    const msgs = event.messages;
    const last = new Map<string, number>();
    msgs.forEach((m, i) => { if (m.role === "custom" && NEWEST_ONLY.has(m.customType)) last.set(m.customType, i); });
    if (!last.size) return;
    const pruned = msgs.filter((m, i) => !(m.role === "custom" && NEWEST_ONLY.has(m.customType) && last.get(m.customType) !== i));
    return pruned.length === msgs.length ? undefined : { messages: pruned };
  });

  pi.registerCommand("tutor-architect", {
    description: "Architecture professor: components, data flow, trade-offs; /tutor-architect off to return",
    handler: async (args, ctx) => {
      const q = args.trim();
      if (q === "off") { setRole(DEFAULT_ROLE); paint(); ctx.ui.notify("back to the coding tutor", "info"); return; }
      if (exam) { ctx.ui.notify("the design recipe and the architect wait until after the exam (/tutor-submit or /tutor-exam off)", "warning"); return; }
      setRole("architect");
      paint();
      // Only the TUI may start a turn: in print/RPC mode a fire-and-forget turn races the caller's next prompt.
      if (q && ctx.hasUI) pi.sendUserMessage(q, { deliverAs: "followUp" });
      else ctx.ui.notify("architecture professor: ask about components, data flow or trade-offs", "info");
    },
  });

  pi.registerCommand("tutor-plan", {
    description: "Design recipe: walk a task from spec/tasks.md to code in six steps (/tutor-plan P1.T1; next moves on; off stops)",
    handler: async (args, ctx) => {
      const id = args.trim();
      // Live check: the model may call a step complete and never set step_done; the learner moves on.
      if (id === "off") {
        if (!workflow) { ctx.ui.notify("no design recipe in progress", "info"); return; }
        const task = workflow.task;
        pi.appendEntry("tutor_workflow", { ...workflow, done: Date.now() });
        workflow = null;
        paint();
        ctx.ui.notify(`design recipe for ${task} stopped`, "info");
        return;
      }
      if (id === "next") {
        if (!workflow) { ctx.ui.notify("no design recipe in progress; start one with /tutor-plan <task id>", "info"); return; }
        const moved = advanceWorkflow(true);
        paint();
        if (moved && moved.done === undefined && ctx.hasUI) {
          pi.sendUserMessage(`${TUTOR_PREFIX} the learner moved on to step ${moved.step} (${STEPS[moved.step - 1]}) of the design recipe for ${moved.task}.`, { deliverAs: "followUp" });
        }
        return;
      }
      if (exam) { ctx.ui.notify("the design recipe and the architect wait until after the exam (/tutor-submit or /tutor-exam off)", "warning"); return; }
      if (!TASK_ID.test(id)) { ctx.ui.notify("usage: /tutor-plan <task id>, e.g. /tutor-plan P1.T1, or /tutor-plan next|off", "warning"); return; }
      let tasks: string;
      try { tasks = readFileSync(join(ctx.cwd, "spec", "tasks.md"), "utf8"); } catch {
        ctx.ui.notify("no spec/tasks.md in this project; /tutor-start scaffolds one", "warning");
        return;
      }
      const line = findTask(tasks, id);
      if (!line) { ctx.ui.notify(`${id} is not in spec/tasks.md`, "warning"); return; }
      setRole(DEFAULT_ROLE); // spec §3: another role command ends the architect role
      workflow = startWorkflow(id, Date.now());
      pi.appendEntry("tutor_workflow", workflow);
      paint();
      const kickoff = `${TUTOR_PREFIX} design recipe started for ${id}: ${line.replace(/^\s*[-*]\s*\[.\]\s*/, "").replace(id, "").trim()}. Begin step 1 (Find).`;
      // Only the TUI may start a turn: in print/RPC mode a fire-and-forget turn races the caller's next prompt.
      if (ctx.hasUI) pi.sendUserMessage(kickoff, { deliverAs: "followUp" });
      else ctx.ui.notify(`design recipe started for ${id}; send a message to begin step 1`, "info");
    },
  });

  pi.registerCommand("tutor-exam", {
    description: "Timed exam in this project: /tutor-exam [small|medium] [topic]; check runs the examples; off abandons; sandbox on|off",
    handler: (args, ctx) => exclusive(ctx, async () => {
      const a = parseExamArgs(args);
      if (a.kind === "usage") { ctx.ui.notify("usage: /tutor-exam [small|medium] [topic] | check | off | sandbox [on|off]", "warning"); return; }
      if (a.kind === "sandbox") {
        if (a.mode === null) {
          if (examSandbox === "off") { ctx.ui.notify("exam sandbox: off — exam tests run as you, with your files and network", "info"); return; }
          const ok = (await pi.exec(BWRAP_PROBE[0], BWRAP_PROBE[1], { cwd: project?.path ?? process.cwd(), timeout: 10_000 })).code === 0;
          ctx.ui.notify(ok ? "exam sandbox: on (bubblewrap ready)" : "exam sandbox: on, but bubblewrap cannot start: install bubblewrap (Arch: pacman -S bubblewrap) or /tutor-exam sandbox off", ok ? "info" : "warning");
          return;
        }
        examSandbox = a.mode;
        if (profile) { const p = profile, mode = a.mode; profileWrite(() => p.setSetting("exam_sandbox", mode)); }
        const keep = profile ? "" : "; this session only: the profile is unavailable";
        ctx.ui.notify(a.mode === "off" ? `exam sandbox: off — exam tests now run as you, with your files and network${keep}` : `exam sandbox: on — exam tests run in bubblewrap${keep}`, a.mode === "off" ? "warning" : "info");
        return;
      }
      if (a.kind === "off") {
        if (!exam) { ctx.ui.notify("no exam is running", "info"); return; }
        saveExam({ ...exam, abandoned: Date.now() });
        ctx.ui.notify(`exam ${exam.id} abandoned; its files stay in ${exam.dir}`, "info");
        exam = null; examClock(); paint();
        return;
      }
      if (a.kind === "check") {
        if (!exam || !project) { ctx.ui.notify("no exam is running", "info"); return; }
        ctx.ui.notify("running the example tests…", "info");
        const r = await runExamTests((c, a2, o) => pi.exec(c, a2, o), exam.language, join(project.path, exam.dir), { sandbox: sandboxHost() });
        if (r.missing) { ctx.ui.notify(r.missing, "warning"); return; }
        ctx.ui.notify(r.killed ? "examples timed out after 120 s: a loop that never ends?" : r.code === 0 ? "all examples pass; :TutorSubmit when you are ready" : `examples fail (exit ${r.code}): ${r.out.split("\n").slice(-6).join("\n")}`, r.code === 0 ? "info" : "warning");
        return;
      }
      if (exam) { ctx.ui.notify(`exam ${exam.id} is running: /tutor-submit, or /tutor-exam off to abandon it`, "warning"); return; }
      if (!profile || !project) { ctx.ui.notify("exams run inside a project: /tutor-start makes one", "warning"); return; }
      const proj = project, lang = proj.language, lay = layout(lang);
      if (!lay) { ctx.ui.notify(`no exams for ${lang} yet`, "warning"); return; }
      if (workflow) { ctx.ui.notify("finish or stop the design recipe first (/tutor-plan off)", "warning"); return; }
      if (!ctx.model) { ctx.ui.notify("no model selected; pick one with /model first", "error"); return; }
      const vocab = vocabOf(loadPack(lang), loadPack("editor"));
      let weak: string[] = [];
      const p = profile;
      profileWrite(() => { weak = weakConcepts(p.concepts(lang), vocab); });
      const lvl = level();
      try {
        const made = await makeExam({
          complete: modelComplete(ctx, () => "tutor: writing your exam…"),
          exec: (c, a2, o) => pi.exec(c, a2, o),
          system: `${rolePrompt(roleNamed("exam-maker"))}\n\n${systemText("exam-make")}`,
          prompt: examPrompt({ language: lang, level: lvl, band: bandFor(lvl), size: a.size, topic: a.topic, weak, card: (await languageCard(lang, proj.path)) ?? "", naming: lay.naming }),
          language: lang, root: proj.path, vocab, size: a.size, topic: a.topic, sandbox: sandboxHost(),
        });
        setRole(DEFAULT_ROLE); // spec §3: another role command ends the architect role
        exam = { id: made.id, dir: made.dir, language: lang, topic: a.topic, size: a.size, started: Date.now(), limit: LIMIT_MIN[a.size], concepts: made.spec.concepts };
        saveExam(exam);
        examClock();
        paint();
        ctx.ui.notify(`exam ${made.id}: ${exam.limit} minutes. Brief: ${made.dir}/brief.md · write ${made.dir}/${lay.stub} · :TutorExam check · :TutorSubmit`, "info");
        try { await link?.openInEditor(join(proj.path, made.dir, "brief.md")); } catch { /* the notice names the file */ }
      } catch (e) {
        ctx.ui.notify(e instanceof Cancelled ? "exam cancelled" : `exam failed: ${e instanceof Error ? e.message : String(e)}`, e instanceof Cancelled ? "info" : "error");
      }
    }),
  });

  /** Requirement ids as the brief on disk states them (`- **R1** …`). */
  const briefIds = (brief: string) => [...brief.matchAll(/^- \*\*(R\d+)\*\*/gm)].map((m) => m[1]);
  const rubric = () => { try { return readFileSync(join(SKILLS_DIR, "tutor-exam-rubric", "SKILL.md"), "utf8").replace(/^---[\s\S]*?---\n/, ""); } catch { return ""; } };

  pi.registerCommand("tutor-submit", {
    description: "Hand in the running exam: run its tests, grade it, write exam/<id>/grade.md",
    handler: (_args, ctx) => exclusive(ctx, async () => {
      if (!exam || !project || !profile) { ctx.ui.notify("no exam is running; start one with /tutor-exam", "info"); return; }
      if (!ctx.model) { ctx.ui.notify("no model selected; pick one with /model first", "error"); return; }
      const e = exam, proj = project, p = profile, dir = join(proj.path, e.dir);
      let brief: string;
      try { brief = readFileSync(join(dir, "brief.md"), "utf8"); } catch { ctx.ui.notify(`${e.dir}/brief.md is missing; /tutor-exam off and start a new exam`, "error"); return; }
      const ids = briefIds(brief);
      ctx.ui.notify("running the example tests…", "info");
      const test = await runExamTests((c, a, o) => pi.exec(c, a, o), e.language, dir, { sandbox: sandboxHost() });
      if (test.missing) { ctx.ui.notify(`${test.missing} The exam stays open.`, "warning"); return; }
      const files = learnerFiles(dir, e.language);
      const minutes = Math.round((Date.now() - e.started) / 6000) / 10;
      let grade: Grade;
      try {
        grade = await completeJson(modelComplete(ctx, () => "tutor: grading your exam…"),
          `${rolePrompt(roleNamed("examiner"))}\n\n${rubric()}\n\n${systemText("exam-grade")}`,
          gradePrompt({ brief, files, test, checklist: loadPack(e.language)?.body ?? "", minutes, limit: e.limit }),
          (v) => checkGrade(v, { ids, files, testsPassed: test.code === 0 && !test.killed }));
      } catch (err) {
        ctx.ui.notify(err instanceof Cancelled ? "grading cancelled; the exam is still open" : `grading failed: ${err instanceof Error ? err.message : String(err)}; the exam is still open`, err instanceof Cancelled ? "info" : "error");
        return;
      }
      const s = score(grade), late = minutes > e.limit;
      let gradePath: string;
      try { gradePath = writeInRoot(proj.path, `${e.dir}/grade.md`, renderGrade(grade, { id: e.id, score: s, minutes, limit: e.limit, test })); }
      catch (err) { ctx.ui.notify(`could not write grade.md: ${err instanceof Error ? err.message : String(err)}`, "error"); return; }
      profileWrite(() => p.recordExam({ exam: e.id, project: proj.path, language: e.language, topic: e.topic, score: s, minutes, late, concepts: e.concepts, created: Date.now() }));
      saveExam({ ...e, submitted: Date.now(), score: s });
      exam = null; examClock(); paint();
      const summary = [`**Exam ${e.id}: ${s}/100** (${late ? "late" : "on time"}, ${minutes} of ${e.limit} min)`, "",
        ...grade.requirements.map((r) => `- ${r.met ? "✔" : "✘"} ${r.id}`), "", "Next:", ...grade.next_fixes.map((f, n) => `${n + 1}. ${f}`), "", `Full grade: \`${e.dir}/grade.md\``].join("\n");
      pi.sendMessage({ customType: "tutor_grade", content: summary, display: true, details: { exam: e.id, score: s } }, { triggerTurn: false });
      try { await link?.openInEditor(gradePath); } catch { /* the summary names the file */ }
    }),
  });

  pi.registerCommand("tutor-progress", {
    description: "Your progress: hint use over time, exams, concept map (/tutor-progress [language])",
    handler: async (args, ctx) => {
      if (!profile) { ctx.ui.notify("tutor profile unavailable; see the earlier warning", "error"); return; }
      const arg = args.trim().toLowerCase();
      if (arg && !/^[a-z][a-z0-9+#.-]{0,30}$/.test(arg)) { ctx.ui.notify("usage: /tutor-progress [language]", "warning"); return; }
      const p = profile;
      const editorLang = editorLanguage();
      let body = "";
      profileWrite(() => {
        const langs = arg ? [arg] : project ? [project.language] : editorLang ? [editorLang] : p.languages();
        body = langs.map((l) => progressReport({ language: l, level: p.language(l)?.level ?? null, episodes: p.episodes(l), exams: p.exams(l), concepts: p.concepts(l), vocab: vocabOf(loadPack(l), loadPack("editor")) })).join("\n\n");
      });
      pi.sendMessage({ customType: "tutor_progress", content: body || "no progress yet: /tutor-start begins a project", display: true }, { triggerTurn: false });
    },
  });

  pi.registerCommand("tutor-memory", {
    description: "List what the tutor remembers about you; pick one to forget it",
    handler: async (_args, ctx) => {
      if (!profile) { ctx.ui.notify("tutor profile unavailable; see the earlier warning", "error"); return; }
      const rows = profile.memories({ language: null, limit: 200 });
      if (rows.length === 0) { ctx.ui.notify("the tutor has not saved any memories yet", "info"); return; }
      const lines = rows.map(memoryLine); // M6b #62: with the language
      if (!ctx.hasUI) { ctx.ui.notify(lines.join("\n"), "info"); return; }
      const pick = await ctx.ui.select("Saved memories (Esc to close)", lines);
      if (!pick) return;
      const id = Number(/^#(\d+)/.exec(pick)?.[1]);
      if ((await ctx.ui.select(pick, ["Keep it", "Forget it"])) !== "Forget it") return;
      const p = profile;
      let gone = false;
      // Final review I3: a forget is the learner correcting the tutor, so the snapshot is rebuilt now.
      profileWrite(() => { gone = p.forget(id); if (gone) memoryNote = memorySnapshot(p.memories({ language: project?.language ?? null, limit: 40 })); });
      ctx.ui.notify(gone ? `forgot memory #${id}` : `memory #${id} was already gone`, "info");
    },
  });

  pi.registerCommand("tutor-thinking", {
    description: "Show or hide the model's thinking: auto (hidden at pro) | show | hide",
    handler: async (args, ctx) => {
      const shown = () => (thinkingHidden(thinking, bandFor(level())) ? "hidden" : "shown");
      if (!args.trim()) { ctx.ui.notify(`thinking: ${thinking} (${shown()} now)`, "info"); return; }
      const mode = parseThinkingMode(args);
      if (!mode) { ctx.ui.notify("usage: /tutor-thinking auto|show|hide", "warning"); return; }
      thinking = mode;
      if (profile) { const p = profile; profileWrite(() => p.setSetting("thinking", mode)); }
      // M7 minor: without a profile the choice is not saved; say so instead of implying it lasts.
      const keep = profile ? "" : "; this session only: the profile is unavailable";
      ctx.ui.notify(`thinking: ${mode} (${shown()} now; replies already on screen redraw on the next update${keep})`, "info");
    },
  });

  pi.registerCommand("tutor-feedback", {
    description: "Tell the tutor how it is teaching: too-long | too-vague | too-much-help | good",
    handler: async (args, ctx) => {
      const kind = args.trim() as FeedbackKind;
      if (!FEEDBACK_KINDS.includes(kind)) { ctx.ui.notify("usage: /tutor-feedback too-long|too-vague|too-much-help|good", "warning"); return; }
      const rung = episode ? episode.attempts : null; // the profile column keeps its name; it holds the attempt count now
      // Spec 2026-10-21 §5: only graded tries move help. Feedback can only slow it down (too-much-help).
      if (episode && roleNamed(activeRole).ladder && kind === "too-much-help" && episode.delay !== 1) {
        episode = { ...episode, delay: 1 };
        pi.appendEntry("tutor_episode", episode);
      }
      feedbackHistory.push(kind);
      pi.appendEntry("tutor_feedback", { kind, rung });
      if (project && profile) { const p = profile, proj = project; profileWrite(() => p.recordFeedback({ kind, language: proj.language, project: proj.path, rung }, Date.now())); }
      paint();
      ctx.ui.notify(kind === "good" ? "thanks — the tutor keeps going like this" : `noted: ${kind}; the tutor adjusts from the next reply`, "info");
    },
  });

  // Spec 2026-10-21 §5: at pro the fix comes only when the learner asks for it.
  /**
   * Spec 2026-10-21 §7: `/tutor-done [task] [anyway]` ticks a task from evidence. Its trusted checks run in the
   * sandbox: all pass → ticked; one fails → a graded try on that check's spot. Unverified checks never block;
   * no checks or no sandbox → ticked as self-checked; `anyway` → ticked by you. The model never ticks.
   */
  pi.registerCommand("tutor-done", {
    description: "Tick a task when its checks pass: /tutor-done [task id] [anyway]",
    handler: (args, ctx) => exclusive(ctx, async () => {
      if (!project || !profile) { ctx.ui.notify("/tutor-done works inside a project: /tutor-start makes one", "warning"); return; }
      const proj = project, p = profile, root = proj.path, key = `checks:${root}`, path = join(root, "spec", "tasks.md");
      const words = args.trim().split(/\s+/).filter(Boolean);
      const anyway = words.includes("anyway");
      const asked = words.find((w) => w !== "anyway");
      let tasksMd: string;
      try { tasksMd = readFileSync(path, "utf8"); } catch { ctx.ui.notify("no spec/tasks.md here yet", "info"); return; }
      const open = openTaskIds(tasksMd);
      if (asked && !/^P\d+\.T\d+$/.test(asked)) { ctx.ui.notify("usage: /tutor-done [task id like P1.T2] [anyway]", "warning"); return; }
      const id = asked ?? open[0];
      if (!id) { ctx.ui.notify("every task in spec/tasks.md is ticked", "info"); return; }
      if (!open.includes(id)) { ctx.ui.notify(`${id} is not an open task in spec/tasks.md`, "info"); return; }
      try { if (link && await link.isModified(path)) { ctx.ui.notify("spec/tasks.md has unsaved edits in Neovim; save it, then /tutor-done again", "warning"); return; } } catch { /* busy editor: go on */ }
      let state: ChecksState = { milestones: {} };
      profileWrite(() => { state = readChecksState(p.setting(key)); });
      const current = currentMilestone(tasksMd, lesson);
      const tick = (how: TickHow, why: string) => tickDone(root, id, how, why);
      if (anyway) return tick("you", "ticked by you");
      const checks = liveChecks(Object.values(state.milestones).flatMap((m) => m.checks), current).filter((c) => c.task === id || c.task.startsWith(`${id}.`));
      if (checks.length === 0) {
        if (checksRunning.has(root)) { ctx.ui.notify(`the checks for this milestone are still being written; try again in a minute, or /tutor-done ${id} anyway`, "info"); return; }
        return tick("self", "self-checked: it has no checks");
      }
      const { runCmd, entry } = projectRun(root, proj.language);
      ctx.ui.notify(`running ${checks.length} check(s) for ${id}…`, "info");
      const r = await runChecks((c, a, o) => pi.exec(c, a, o), { language: proj.language, root, entry, runCmd, checks, sandbox: sandboxHost() });
      if (r.missing) return tick("self", `self-checked: ${r.missing}`);
      const failed = r.results.filter((x) => !x.pass && x.check.status === "trusted");
      const shaky = r.results.filter((x) => !x.pass && x.check.status === "unverified");
      if (failed.length === 0) {
        const extra = shaky.length ? `; ${shaky.length} unverified check(s) failed and do not block: ${shaky.map((x) => x.check.expr ?? JSON.stringify(x.check.stdin)).join(", ")}` : "";
        // Only a trusted check proves it; unverified ones alone make it self-checked (final review I5).
        if (!r.results.some((x) => x.pass && x.check.status === "trusted")) return tick("self", `self-checked: none of its checks is verified${extra}`);
        return tick("checks", `${r.results.length - shaky.length} check(s) passed${extra}`);
      }
      failedCheck(id, failed[0]);
    }),
  });

  /** A failed trusted check (spec §7): a graded try on its spot, unless the file does not even load (a typo). */
  function failedCheck(id: string, f: CheckResult) {
    const c = f.check;
    if (f.error && isSyntaxError(f.error.replace(/^your file stopped while loading: /, ""))) {
      ui?.notify(`your file has a syntax error, so ${id} could not be checked: ${f.error}`, "warning");
      return;
    }
    // Spec 2026-10-22 §4: a check that cannot call the function as written, or a compile error outside the
    // checked function, blocks the tick but is no try.
    if (f.outcome === "unfit") { ui?.notify(`${id} not yet: ${f.error}`, "warning"); return; }
    if (f.outcome === "elsewhere") { ui?.notify(`${f.error}, so ${id} could not be checked`, "warning"); return; }
    const line = c.kind === "value"
      ? `check ${id}: ${c.expr} ${f.error ? `failed: ${f.error}` : `gave ${f.got}, expected ${c.expected}`}`
      : `check ${id}: typing ${JSON.stringify(c.stdin)} should print ${JSON.stringify(c.contains)}${f.error ? `; it failed: ${f.error}` : ""}; it printed: ${f.got ?? ""}`;
    ui?.notify(`${id} not yet: ${line.replace(/^check \S+: /, "")}`, "warning");
    failedRun({ kind: "run", cmd: ["/tutor-done", id], code: 1, trace: line }, true, `check:${id}:${c.expr ?? c.stdin}`);
    paint();
  }

  /** Tick `id` and its open subtasks in spec/tasks.md, record how, refresh spec/checks.md, close its check episode. */
  async function tickDone(root: string, id: string, how: TickHow, why: string) {
    const path = join(root, "spec", "tasks.md");
    let md: string;
    try { md = readFileSync(path, "utf8"); } catch { return; }
    const r = tickTasks(md, [id, ...taskIds(md).filter((x) => x.startsWith(`${id}.S`))]);
    if (!r.ticked.length) return;
    // Pane check #1: the checks took seconds; edits made meanwhile and not saved must not meet a rewritten file.
    try { if (link && await link.isModified(path)) { ui?.notify(`spec/tasks.md has unsaved edits in Neovim; save it, then /tutor-done ${id} again`, "warning"); return; } } catch { /* busy editor: go on */ }
    try { writeInRoot(root, "spec/tasks.md", r.text); } catch (e) { ui?.notify(`tutor: could not tick ${id}: ${e instanceof Error ? e.message : String(e)}`, "warning"); return; }
    pi.appendEntry("tutor_tick", { ids: [id], how });
    let state: ChecksState = { milestones: {} };
    const key = `checks:${root}`;
    if (profile) { const p = profile; profileWrite(() => { state = readChecksState(p.setting(key)); state.ticks = { ...state.ticks, [id]: how }; p.setSetting(key, JSON.stringify(state)); }); }
    writeChecksMd(root, state, currentMilestone(r.text, lesson));
    // Only passing checks solve it; a self-checked or `anyway` tick gives the episode up (final review I2).
    if (episode?.spot?.startsWith(`check:${id}:`)) closeEp(how === "checks" ? "run_passed" : "superseded");
    for (const k of [...spotMemory.keys()]) if (k.startsWith(`check:${id}:`)) spotMemory.delete(k);
    ui?.notify(`ticked ${id} (${why})`, "info");
    try { await link?.reloadFile(path); } catch { /* the file is written; the buffer reloads on focus */ }
    paint();
  }

  pi.registerCommand("tutor-fix", {
    description: "Pro: show the fix for the spot you are stuck on (other levels get it after a few tries)",
    handler: async (_args, ctx) => {
      if (!episode || !roleNamed(activeRole).ladder) { ctx.ui.notify("nothing to fix: run your program first", "info"); return; }
      if (bandFor(level()) !== "pro") { ctx.ui.notify("the fix comes after a few tries on the same spot", "info"); return; }
      episode = { ...episode, fixAsked: true };
      pi.appendEntry("tutor_episode", episode);
      ctx.ui.notify("the next reply shows the fix for this spot", "info");
    },
  });

  pi.registerCommand("tutor-level", {
    description: "Set the tutor level 0-100 (beginner → pro)",
    handler: async (args, ctx) => {
      const arg = args.trim();
      if (arg === "") {
        ctx.ui.notify(`current level ${level()} (${bandFor(level())}); usage: /tutor-level <0-100>`, "info");
        return;
      }
      const n = /^\d{1,3}$/.test(arg) ? Number(arg) : NaN;
      if (!Number.isInteger(n) || n < 0 || n > 100) {
        ctx.ui.notify("usage: /tutor-level <0-100>", "warning");
        return;
      }
      setLevel(n);
      pi.appendEntry("tutor_level", { level: n });
      if (project && profile) { const p = profile, lang = project.language; profileWrite(() => p.setLevel(lang, n)); }
      paint();
      ctx.ui.notify(`tutor level set to ${n} (${bandFor(n)})`, "info");
    },
  });

  /** Spec 2026-10-13 §5.2: the language's DevDocs bundle at the installed version → tutor-<lang>-ref. */
  async function fetchDocs(ctx: ExtensionContext, language: string, force: boolean): Promise<"fetched" | "cached" | "refreshed" | "none" | "failed"> {
    const spec = LANGS[language];
    if (!spec) {
      ctx.ui.notify(`no cached docs for ${language}; the tutor relies on model knowledge`, "info");
      return "none";
    }
    const installed = await detectVersion(language, (command, args, options) => pi.exec(command, args, options));
    try {
      const r = await withProgress(ctx, `tutor: fetching ${language} docs (DevDocs)…`, (signal) =>
        fetchReference(language, { fetch, root: skillsRoot(), installed, devdocsType: spec.devdocsType, override: overrideFor(language), force, signal }), "docs download");
      const note = r.meta.note ? ` — ${r.meta.note}` : "";
      ctx.ui.notify(r.offline
        ? `${language} docs: DevDocs unreachable (offline?); using the docs on disk unchecked (${r.name}, ${r.meta.release})`
        : r.status === "cached"
        ? `${language} docs already current (${r.name}, ${r.meta.release})`
        : r.status === "refreshed"
          ? `${language} docs updated for installed ${installed ?? "unknown"} (${r.name}, ${r.meta.release})${note}`
          : `${language} docs: ${r.name} (${r.meta.release}, ${r.entries} entries)${note}`, "info");
      return r.status;
    } catch (e) {
      ctx.ui.notify(e instanceof Cancelled ? `${language} docs fetch cancelled` : `${language} docs fetch failed: ${e instanceof Error ? e.message : String(e)}`, "warning");
      return "failed";
    }
  }

  pi.registerCommand("tutor-docs", {
    description: "Fetch (or re-fetch) official docs for a language into tutor-<lang>-* skills",
    handler: async (args, ctx) => {
      const language = (args.trim() || project?.language || editorLanguage() || "").toLowerCase();
      if (!/^[a-z][a-z0-9+#.-]{0,30}$/.test(language)) { ctx.ui.notify("usage: /tutor-docs <language>", "warning"); return; }
      if ((await fetchDocs(ctx, language, true)) === "fetched") await ctx.reload();
    },
  });

  // ---- /tutor-start as a conversation (spec 2026-10-19 §5, §6) ----
  /**
   * Final review C1/I4: onboarding runs where it belongs. The build-or-learn choice only in the folder it
   * made; the earlier stages where no project is open, or after /tutor-start in this session; never paused.
   */
  const onboardingActive = () => {
    const o = onboarding;
    if (!o || o.stage === "done" || o.paused) return false;
    if (o.stage === "choose") return !!project && project.path === o.dir;
    return onboardingHere || !project;
  };
  function loadOnboarding(): Onboarding | null {
    let o: Onboarding | null = null;
    if (profile) { const p = profile; profileWrite(() => { const raw = p.setting("onboarding"); if (raw) { try { o = JSON.parse(raw) as Onboarding; } catch { o = null; } } }); }
    return o;
  }
  function saveOnboarding(o: Onboarding | null) {
    onboarding = o;
    if (profile) { const p = profile; profileWrite(() => p.setSetting("onboarding", o ? JSON.stringify(o) : "")); }
  }
  /**
   * Live check 2026-10-19: a message queued while a run is still ending (from agent_end) runs as a follow-up
   * in that loop with no before_agent_start, so the model never gets the onboarding or lesson section.
   * Sent once Pi is idle, it starts a fresh run.
   */
  function rewriteWhenIdle(ctx: ExtensionContext, text: string, tries = 0) {
    if (closing) return;
    if (ctx.isIdle() || tries >= 600) { pi.sendMessage({ customType: "tutor_rewrite", content: text, display: false }, { triggerTurn: true }); return; }
    setTimeout(() => rewriteWhenIdle(ctx, text, tries + 1), 50).unref?.();
  }
  function sendWhenIdle(ctx: ExtensionContext, text: string, tries = 0) {
    if (closing) return;
    if (ctx.isIdle() || tries >= 600) { pi.sendUserMessage(text, { deliverAs: "followUp" }); return; }
    setTimeout(() => sendWhenIdle(ctx, text, tries + 1), 50).unref?.();
  }
  /** Start the model's next onboarding turn (only the TUI may start a turn, as for /tutor-plan). */
  function kick(ctx: ExtensionContext, what: string) {
    if (ctx.hasUI) sendWhenIdle(ctx, `${TUTOR_PREFIX} onboarding: ${what}`);
    else ctx.ui.notify("send a message to continue", "info");
  }
  const checksRoot = (lang: string) => join(homedir(), "lazycourse", ".checks", lang);
  const aboutOf = (o: Onboarding): Record<string, string> => ({
    experience: o.fields.experience ?? "", known: (o.fields.known ?? []).join(", "), idea: o.fields.idea ?? "no idea yet", confidence: o.fields.confidence ?? "",
  });

  /** The safety net (Q6): the code asks each item still missing, one plain dialog each. */
  async function askMissing(ctx: ExtensionContext, o: Onboarding): Promise<Onboarding> {
    const got: Partial<Fields> = {};
    let probed = false;
    // Re-read what is missing after every answer: "no languages" makes the target the code's choice (Q1).
    for (let m = missing(o)[0], guard = 0; m !== undefined && m !== "path" && guard < 8; m = missing(applyTurn(o, got)).filter((x) => x !== "probe" || !probed)[0], guard++) {
      if (m === "experience") { const a = await ctx.ui.select("How long have you been programming?", [...EXPERIENCE]); if (a === undefined) break; got.experience = a; }
      else if (m === "known") { const a = await ctx.ui.input("Which languages do you already know? (comma-separated; leave empty for none)", ""); if (a === undefined) break; got.known = a.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean); }
      else if (m === "target") { const a = await ctx.ui.select("Which language do you want to learn?", [...LANGUAGES]); if (a === undefined) break; got.target = a; }
      else if (m === "selfScore") { const a = await ctx.ui.select(`How would you rate yourself in ${o.fields.target}, 1 to 10?`, Array.from({ length: 10 }, (_, i) => String(i + 1))); if (a === undefined) break; got.selfScore = Number(a); }
      else if (m === "idea") { const a = await ctx.ui.input("Anything you would like to build? (leave empty if you have no idea yet)", ""); if (a === undefined) break; got.idea = a.trim() || null; }
      else if (m === "probe") probed = true; // a dialog cannot ask technical questions; the self-score stands
    }
    const next = applyTurn(o, got);
    return { ...next, exchanges: o.exchanges, badNotes: o.badNotes, probeTurns: probed ? 2 : next.probeTurns };
  }

  /** The level task (Q7, Q13, Q20): a prepared exercise in a scratch folder; the self-score picks the rung of the ladder. */
  function startLevelCheck(ctx: ExtensionContext, o: Onboarding): Onboarding {
    const lang = o.fields.target!, tasks = levelTasks(lang), score = o.fields.selfScore ?? 5;
    const ex = tasks[Math.min(tasks.length - 1, Math.max(0, score - 6))];
    const root = checksRoot(lang);
    mkdirSync(root, { recursive: true });
    writeExercise(root, ex.id, lang, ex);
    const lay = layout(lang)!;
    // CLAUDE.md: the editor is only driven inside the project root; there is no project yet, so the learner opens it.
    ctx.ui.notify(`a small task to see where to start: open ${join(root, ex.id, "instructions.md")} and write ${join(root, ex.id, lay.stub)} (:e <path>), then /tutor-start check`, "info");
    return { ...o, stage: "check", levelCheck: { task: ex.id, passed: null } };
  }

  /** Everything after a run ends: the code, not the model, moves the onboarding on (spec §6). */
  async function onboardStep(ctx: ExtensionContext): Promise<void> {
    let o = onboarding;
    if (!o || !profile) return;
    if (o.stage === "choose") {
      let path = o.fields.path;
      if (!path) {
        const a = await ctx.ui.select("Build it now, or learn the ideas it needs first?", ["Build it now", "Learn the ideas first"]);
        if (a === undefined) { saveOnboarding(o); return; }
        path = a === "Build it now" ? "build" : "learn";
      }
      await startPath(ctx, { ...o, fields: { ...o.fields, path } }, path);
      return;
    }
    if (o.stage === "talk") {
      if (needsFallback(o) && missing(o).length) o = await askMissing(ctx, o);
      if (missing(o).length) { saveOnboarding(o); return; }
      if (selfScoreNeeded(o) && (o.fields.selfScore ?? 0) >= 5 && !o.levelCheck && levelTasks(o.fields.target!).length) {
        const c = startLevelCheck(ctx, o);
        saveOnboarding(c);
        kick(ctx, `a small task (${c.levelCheck!.task}) is in their ~/lazycourse/.checks folder: tell them it only sets where to start, no grade, and to type /tutor-start check when done`);
        return;
      }
      const lvl = o.level ?? levelFrom(o);
      saveOnboarding({ ...o, stage: "read", level: lvl, presented: "read" });
      kick(ctx, `give the learner your read of them in two or three sentences: level ${lvl}/100 (${bandFor(lvl)}), based on what they told you; ask whether that sounds right`);
      return;
    }
    if (o.stage === "read" && o.presented === "read") {
      const lvl = o.level ?? levelFrom(o);
      ctx.ui.notify(`my read: level ${lvl}/100 (${bandFor(lvl)})`, "info");
      let level = lvl;
      if (!(await ctx.ui.confirm("Your starting level", `Level ${lvl}/100 (${bandFor(lvl)}). Does that sound right?`))) {
        const a = await ctx.ui.input("What level feels right? (0-100)", String(lvl));
        const n = Number(a);
        if (a !== undefined && a.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= 100) level = n;
      }
      o = { ...o, level, stage: "project", presented: null };
    }
    if (o.stage === "project" && !o.project) {
      try {
        const s = await suggestOne({ profile, complete: modelComplete(ctx, () => "tutor: finding a project for you…") }, { language: o.fields.target!, level: o.level ?? levelFrom(o), about: aboutOf(o), exclude: o.shown });
        o = { ...o, project: { title: s.title, summary: s.summary, concepts: s.concepts }, shown: [...o.shown, s.title], presented: "project" };
        saveOnboarding(o);
        kick(ctx, `suggest this one project and say why it suits them: "${s.title}" — ${s.summary}; they can ask for something else`);
      } catch (e) {
        saveOnboarding(o);
        ctx.ui.notify(e instanceof Cancelled ? "cancelled; /tutor-start picks up where we left off" : `no project suggestion: ${e instanceof Error ? e.message : String(e)}; /tutor-start tries again`, e instanceof Cancelled ? "info" : "error");
      }
      return;
    }
    if (o.stage === "project" && o.project && o.presented === "project") {
      const pick = await ctx.ui.select(`Project: ${o.project.title}`, ["Start this project", "Show me something else"]);
      if (pick === undefined) { saveOnboarding(o); return; }
      if (pick === "Show me something else") { onboarding = { ...o, project: null, presented: null }; return onboardStep(ctx); }
      const lang = o.fields.target!, def = defaultProjectDir(homedir(), lang, o.project.title);
      const answer = await ctx.ui.input(`Project folder (Enter for ${def})`, def);
      if (answer === undefined) { saveOnboarding(o); return; }
      let dir: string;
      const lua = await luaRuntimeFor(lang);
      try {
        dir = createProject(profile, { language: lang, level: o.level ?? levelFrom(o), project: { ...o.project, size: "small" }, dir: resolve(expandHome(answer.trim() || def, homedir())), about: aboutOf(o), now: Date.now(), luaRuntime: lua }).dir;
      } catch (e) { saveOnboarding(o); ctx.ui.notify(e instanceof Error ? e.message : String(e), "warning"); return; }
      saveOnboarding({ ...o, stage: "choose", presented: null, dir });
      await fetchDocs(ctx, lang, false); // the switched Pi loads the language's docs (spec §6 last step)
      if (link) {
        ctx.ui.notify(`made ${o.project.title} in ${dir}; moving the editor and tutor there…`, "info");
        await link.switchProject(dir, "README.md");
      } else ctx.ui.notify(`made ${o.project.title} in ${dir}. Continue with: cd ${dir} && pi`, "info");
    }
  }

  /**
   * Spec 2026-10-21 §7: each milestone's checks are written in the background once the learner builds it (the
   * plan of a build-now project, a lesson round reaching its milestone, or an older project at session start).
   * Like the plan job, it keeps the model it started with and writes through the profile open when it ends.
   */
  const checksRunning = new Set<string>();
  function ensureChecks(ctx: ExtensionContext) {
    if (!project || !profile || checksRunning.has(project.path) || specRunning.has(project.path)) return;
    const proj = project, p = profile, key = `checks:${proj.path}`, mine = generation;
    let tasksMd: string;
    try { tasksMd = readFileSync(join(proj.path, "spec", "tasks.md"), "utf8"); } catch { return; }
    const current = currentMilestone(tasksMd, lesson);
    let state: ChecksState = { milestones: {} };
    profileWrite(() => { state = readChecksState(p.setting(key)); });
    const todo = Array.from({ length: current }, (_, i) => i + 1).filter((k) => !state.milestones[k]);
    if (todo.length === 0) return;
    const { runCmd, entry } = projectRun(proj.path, proj.language);
    const frozen = { model: ctx.model, modelRegistry: ctx.modelRegistry } as ExtensionContext;
    checksRunning.add(proj.path);
    void (async () => {
      try {
        for (const k of todo) {
          const m = await writeMilestoneChecks({
            complete: rawComplete(frozen, AbortSignal.timeout(SPEC_JOB_TIMEOUT_MS)), exec: (c, a, o) => pi.exec(c, a, o), sandbox: sandboxHost(),
            language: proj.language, tasksMd, milestone: k, entry, runCmd, root: proj.path,
          });
          if (!profile) return;
          const now = profile;
          let saved: ChecksState = { milestones: {} };
          profileWrite(() => { saved = readChecksState(now.setting(key)); saved.milestones[k] = m; now.setSetting(key, JSON.stringify(saved)); });
          writeChecksMd(proj.path, saved, current);
          const trusted = m.checks.filter((c) => c.status === "trusted").length;
          if (generation === mine && m.checks.length) ui?.notify(`checks for milestone ${k}: spec/checks.md (${trusted} trusted, ${m.checks.length - trusted} unverified)`, "info");
        }
      } catch (e) {
        if (generation === mine) ui?.notify(`the checks could not be written: ${e instanceof Error ? e.message : String(e)}; they are tried again next session`, "warning");
      } finally {
        checksRunning.delete(proj.path);
      }
    })();
  }
  /** spec/checks.md from the profile's record (Review Focus #4: the file is display only and rewritten each time). */
  function writeChecksMd(root: string, state: ChecksState, current: number) {
    let tasksMd = "";
    try { tasksMd = readFileSync(join(root, "spec", "tasks.md"), "utf8"); } catch { /* ticks unknown: none shown */ }
    const all = Object.values(state.milestones).flatMap((m) => m.checks);
    const untried = Object.values(state.milestones).some((m) => m.checks.length && !m.ran);
    const note = untried ? "Some checks could not be tried against a reference here (no sandbox, or README.md's `run:` names no source file), so they are unverified." : undefined;
    try { writeInRoot(root, "spec/checks.md", renderChecksMd(liveChecks(all, current), tickedIds(tasksMd), { note, how: state.ticks })); } catch { /* spec/ is gone or points outside the project: nothing to show */ }
  }

  /** Author 2026-10-21: the installed Lua as lua_ls names it, for a Lua project's .luarc.json; null when absent. */
  async function luaRuntimeFor(language: string): Promise<string | null> {
    if (language !== "lua") return null;
    try {
      const r = await pi.exec("lua", ["-v"], { timeout: 5000 });
      return r.code === 0 ? luaRuntime(`${r.stdout}\n${r.stderr}`) : null;
    } catch { return null; }
  }

  /** Spec 2026-10-22 §5.1: the installed Go as go.mod names it (`go 1.27`); null when absent. */
  async function goVersionFor(language: string): Promise<string | null> {
    if (language !== "go") return null;
    try {
      const r = await pi.exec("go", ["version"], { timeout: 5000 });
      return r.code === 0 ? goVersionOf(r.stdout) : null;
    } catch { return null; }
  }

  /** `/tutor-start check`: run the level task in the sandbox; passing or not only sets the level (Q13). */
  async function onboardCheck(ctx: ExtensionContext): Promise<void> {
    const o = onboarding ?? loadOnboarding();
    if (!o || o.stage !== "check" || !o.levelCheck) { ctx.ui.notify("no level task is waiting; /tutor-start begins", "info"); return; }
    const lang = o.fields.target!;
    ctx.ui.notify("running the task's tests…", "info");
    const r = await runExamTests((c, a, opt) => pi.exec(c, a, opt), lang, join(checksRoot(lang), o.levelCheck.task), { sandbox: sandboxHost() });
    if (r.missing) { ctx.ui.notify(r.missing, "warning"); return; }
    const passed = r.code === 0 && !r.killed;
    const next: Onboarding = { ...o, levelCheck: { ...o.levelCheck, passed }, stage: "read", presented: "read" };
    next.level = levelFrom(next);
    saveOnboarding(next);
    ctx.ui.notify(passed ? `all tests pass; I'd start you at level ${next.level}` : `some tests fail, which is fine: it only tells me where to start (level ${next.level})`, "info");
    kick(ctx, `give the learner your read of them in two or three sentences: level ${next.level}/100 (${bandFor(next.level!)}), from what they told you and the small task; ask whether that sounds right`);
  }

  // ---- build or learn first (spec 2026-10-19 Q10, Q14–Q17, Q22) ----
  const lessonsFor = (lang: string) => loadLessons(lang);
  const lessonOf = (lang: string, concept: string): Lesson | undefined => lessonsFor(lang).find((l) => l.concept === concept);
  function lessonLabel(l: LessonState): string {
    if (l.building) return `build: milestone ${l.round + 1}`;
    const n = project ? lessonOf(project.language, l.concept)?.exercises.length ?? 0 : 0;
    return `lesson: ${l.concept} ${Math.min(l.exercise + 1, Math.max(n, 1))}/${Math.max(n, 1)}`;
  }
  function saveLesson(l: LessonState | null) {
    lesson = l;
    if (project && profile) { const p = profile, key = `lesson:${project.path}`; profileWrite(() => p.setSetting(key, l ? JSON.stringify(l) : "")); }
    paint();
    if (session) ensureChecks(session); // a round that reached its milestone gets that milestone's checks
  }
  /** The hidden lesson section: the rules, the vendored lesson text, the exercise, and a step back after two fails (Q17). */
  function lessonSection(l: LessonState, lang: string): string {
    if (l.building) return `[lesson] Round ${l.round + 1} is done: the learner is building Milestone ${l.round + 1} in spec/tasks.md with ${l.rounds[l.round].join(", ")}. Coach as usual; /tutor-lesson next starts the next round.`;
    const les = lessonOf(lang, l.concept), ex = les?.exercises[l.exercise];
    const parts = [systemText("lesson"), `[lesson] concept: ${l.concept} (round ${l.round + 1} of ${l.rounds.length}), source: ${les?.source ?? "?"}`];
    if (les) parts.push(`Lesson text:\n${les.text}`);
    if (ex) parts.push(`Exercise ${l.exercise + 1}/${les!.exercises.length} (learn/${l.concept}/${ex.id}/):\n${ex.instructions}`);
    if (l.stepBack) parts.push("The learner failed this exercise twice: take a smaller step (one part of the idea, another small example) and say so in one line.");
    return parts.join("\n\n");
  }
  function lessonKick(ctx: ExtensionContext, what: string) {
    if (ctx.hasUI) sendWhenIdle(ctx, `${TUTOR_PREFIX} lesson: ${what}`);
  }

  interface SpecJob { rounds: string[][]; about: Record<string, string>; level: number; project: { title: string; summary: string; concepts: string[] } }
  /** Q10/Q22: the spec is written in the background (no loader: the learner keeps working); a failure is shown, /tutor-start spec retries. */
  function startSpecJob(ctx: ExtensionContext, job: SpecJob) {
    if (!project || !profile) return;
    const proj = project, key = `specjob:${proj.path}`, mine = generation;
    { const p = profile; profileWrite(() => p.setSetting(key, JSON.stringify(job))); }
    // Final review I2: the job may outlive this session (/new): keep the model it started with, write through the
    // profile that is open when it ends, and paint only the session that started it.
    const frozen = { model: ctx.model, modelRegistry: ctx.modelRegistry } as ExtensionContext;
    specRunning.add(proj.path);
    specStatus = "writing";
    paint();
    const meta = { language: proj.language, level: job.level, band: bandFor(job.level), title: job.project.title, summary: job.project.summary };
    void (async () => {
      let written = false;
      try {
        const spec = await completeJson(rawComplete(frozen, AbortSignal.timeout(SPEC_JOB_TIMEOUT_MS)), systemText("scaffold"),
          scaffoldPrompt({ language: proj.language, level: job.level, band: meta.band, project: { ...job.project, size: "small" }, about: job.about, rounds: job.rounds }),
          (v) => checkScaffold(v, job.rounds));
        writeScaffold(proj.path, spec, meta, { existing: true, luaRuntime: await luaRuntimeFor(proj.language), goVersion: await goVersionFor(proj.language) });
        if (profile) { const p = profile; profileWrite(() => p.setSetting(key, "")); }
        if (generation === mine) { specStatus = null; ui?.notify("the project plan is ready: spec/tasks.md", "info"); }
        written = true;
      } catch (e) {
        if (generation === mine) {
          specStatus = "failed";
          ui?.notify(`the project plan could not be written: ${e instanceof Error ? e.message : String(e)}; /tutor-start spec retries`, "warning");
        }
      } finally {
        specRunning.delete(proj.path);
      }
      if (generation === mine) paint();
      if (written && generation === mine) ensureChecks(frozen);
    })();
  }

  /** The learner's choice (Q22): the spec job always; lesson rounds too when they learn first. */
  async function startPath(ctx: ExtensionContext, o: Onboarding, path: "build" | "learn") {
    if (!project || !profile || !o.project || project.path !== o.dir) {
      ctx.ui.notify(`open ${o.dir ?? "the project folder"} to choose build now or learn first`, "info");
      return;
    }
    const lang = project.language, p = profile;
    let rounds: string[][] = [];
    if (path === "learn") {
      let known: string[] = [], weak: string[] = [];
      profileWrite(() => { known = p.knownConcepts(lang, Date.now()); weak = weakConcepts(p.concepts(lang), vocabOf(loadPack(lang), loadPack("editor"))); });
      const concepts = normalizeTags(o.project.concepts, vocabOf(loadPack(lang), loadPack("editor")));
      rounds = planRounds([...concepts, ...o.project.concepts], new Set(known), weak, lessonsFor(lang), { beginner: bandFor(o.level ?? level()) === "beginner" });
    }
    saveOnboarding(null);
    startSpecJob(ctx, { rounds, about: aboutOf(o), level: o.level ?? level(), project: o.project });
    const l = startLessons(rounds);
    saveLesson(l);
    if (l) lessonKick(ctx, `start the lesson on ${l.concept}`);
    // Final review I5 (Q10): building now, the tutor talks the project through while the plan is written.
    else if (path === "build" && ctx.hasUI) sendWhenIdle(ctx, `${TUTOR_PREFIX} project: talk through what "${o.project.title}" involves (${o.project.summary}) and its first small step, while the plan is being written`);
    else if (path === "learn") ctx.ui.notify("no prepared lessons cover this project's ideas yet; we build and learn as we go", "info");
  }

  const exerciseDir = (l: LessonState, ex: { id: string }) => `learn/${l.concept}/${ex.id}`;
  /** Final review I1: a finished review returns exactly to the saved place (it is not part of any round). */
  const backFromReview = (l: LessonState): LessonState => ({ ...l, ...l.resume!, fails: 0, stepBack: false, resume: null });

  pi.registerCommand("tutor-lesson", {
    description: "Learn-first lessons: next (write the exercise / start the next round) | check | skip | review | off",
    handler: (args, ctx) => exclusive(ctx, async () => {
      const a = args.trim().toLowerCase();
      if (!project || !profile) { ctx.ui.notify("lessons run inside a project: /tutor-start makes one", "warning"); return; }
      const lang = project.language, p = profile, root = project.path;
      if (a === "review") {
        if (lesson?.resume) { ctx.ui.notify(`already reviewing ${lesson.concept}: finish it with /tutor-lesson check or skip`, "info"); return; }
        let due: string[] = [];
        profileWrite(() => { due = p.dueConcepts(lang, Date.now(), 10); });
        const les = lessonsFor(lang).find((x) => x.exercises.length && x.tags.some((t) => due.includes(t)));
        if (!les) { ctx.ui.notify("nothing is due for review", "info"); return; }
        const base = lesson ?? { rounds: [[les.concept]], round: 0, concept: les.concept, exercise: 0, fails: 0, stepBack: false, building: false, resume: null };
        saveLesson({ ...base, concept: les.concept, exercise: 0, fails: 0, stepBack: false, building: false, resume: lesson ? { round: lesson.round, concept: lesson.concept, exercise: lesson.exercise, building: lesson.building } : null });
        ctx.ui.notify(`quick review of ${les.concept}: /tutor-lesson next writes the exercise`, "info");
        return;
      }
      if (!lesson) { ctx.ui.notify("no lesson in progress; /tutor-start offers lessons before a project", "info"); return; }
      if (a === "off") { saveLesson(null); ctx.ui.notify("lessons stopped; the project plan stays in spec/", "info"); return; }
      const les = lessonOf(lang, lesson.concept);
      if (a === "next") {
        if (lesson.building) {
          const n = nextRound(lesson);
          saveLesson(n);
          if (n) { ctx.ui.notify(`round ${n.round + 1}: ${n.concept}`, "info"); lessonKick(ctx, `start the lesson on ${n.concept}`); }
          else ctx.ui.notify("every lesson round is done; keep building from spec/tasks.md", "info");
          return;
        }
        const ex = les?.exercises[lesson.exercise];
        if (!ex) { ctx.ui.notify(`${lesson.concept} has no exercise; ask the tutor about it, then /tutor-lesson skip`, "info"); return; }
        const rel = exerciseDir(lesson, ex);
        if (existsSync(join(root, rel))) { ctx.ui.notify(`${rel} is already there; /tutor-lesson check when ready`, "info"); return; }
        writeExercise(root, rel, lang, ex);
        ctx.ui.notify(`exercise: ${rel}/instructions.md · write ${rel}/${layout(lang)!.stub} · /tutor-lesson check`, "info");
        try { await link?.openInEditor(join(root, rel, "instructions.md")); } catch { /* the notice names the file */ }
        paint();
        return;
      }
      if (a === "skip") {
        profileWrite(() => { for (const t of les?.tags.length ? les.tags : [lesson!.concept]) p.rateConcept(lang, t, 0.9, Date.now()); });
        const n = lesson.resume ? backFromReview(lesson) : nextConcept(lesson);
        saveLesson(n);
        ctx.ui.notify(n.building ? `round ${n.round + 1} done: build Milestone ${n.round + 1} in spec/tasks.md, then /tutor-lesson next` : `next: ${n.concept}`, "info");
        if (!n.building) lessonKick(ctx, `start the lesson on ${n.concept}`);
        return;
      }
      if (a === "check") {
        const ex = les?.exercises[lesson.exercise];
        if (!ex || !existsSync(join(root, exerciseDir(lesson, ex)))) { ctx.ui.notify("no exercise written yet: /tutor-lesson next", "info"); return; }
        ctx.ui.notify("running the exercise's tests…", "info");
        const r = await runExamTests((c, a2, o) => pi.exec(c, a2, o), lang, join(root, exerciseDir(lesson, ex)), { sandbox: sandboxHost() });
        if (r.missing) { ctx.ui.notify(r.missing, "warning"); return; }
        if (r.code === 0 && !r.killed) {
          profileWrite(() => { for (const t of les!.tags.length ? les!.tags : [lesson!.concept]) p.rateConcept(lang, t, 1, Date.now()); });
          const was = lesson.concept;
          const n: LessonState = lesson.exercise + 1 < les!.exercises.length ? { ...lesson, exercise: lesson.exercise + 1, fails: 0, stepBack: false }
            : lesson.resume ? backFromReview(lesson) : nextConcept(lesson);
          saveLesson(n);
          ctx.ui.notify(n.building ? `all pass! round ${n.round + 1} done: build Milestone ${n.round + 1} in spec/tasks.md, then /tutor-lesson next` : `all pass! next: ${n.concept === was ? `exercise ${n.exercise + 1}` : n.concept} (/tutor-lesson next)`, "info");
          return;
        }
        const fails = lesson.fails + 1;
        saveLesson({ ...lesson, fails, stepBack: fails >= 2 });
        ctx.ui.notify(r.killed ? "the tests timed out: a loop that never ends?" : `not yet (exit ${r.code}): ${r.out.split("\n").slice(-4).join(" ")}`, "warning");
        return;
      }
      ctx.ui.notify("usage: /tutor-lesson next | check | skip | review | off", "warning");
    }),
  });

  /** `/tutor-start spec`: retry the background spec job after a failure (Review Focus #4). */
  function retrySpec(ctx: ExtensionContext) {
    if (!project || !profile) { ctx.ui.notify("no project here", "info"); return; }
    const p = profile, key = `specjob:${project.path}`;
    let job: SpecJob | null = null;
    profileWrite(() => { const raw = p.setting(key); if (raw) { try { job = JSON.parse(raw) as SpecJob; } catch { job = null; } } });
    if (!job) { ctx.ui.notify("no project plan is waiting to be written", "info"); return; }
    startSpecJob(ctx, job);
  }

  pi.on("agent_end", async (_event, ctx) => {
    if (pendingRewrite) {
      const issues = pendingRewrite;
      pendingRewrite = null;
      // A fresh run from a hidden message (live check 2026-10-21: a typed "[tutor] rewrite:" showed the machinery
      // in the learner's chat); before_agent_start builds its context; started once Pi is idle (2026-10-19).
      rewriteWhenIdle(ctx, `Your last reply broke this turn's rules (${issues.join(", ")}). Write it again, following this turn's instruction.`);
    }
    if (!onboardingActive() || !onboarding) return;
    const note = intake;
    intake = undefined;
    saveOnboarding(applyTurn(onboarding, note === undefined ? null : note));
    try { await onboardStep(ctx); } catch (e) { ctx.ui.notify(`onboarding: ${e instanceof Error ? e.message : String(e)}`, "error"); }
    paint();
  });

  pi.registerCommand("tutor-start", {
    description: "Meet the tutor: a short conversation, one project, then build or learn first; check runs the level task; off pauses",
    handler: async (args, ctx) => {
      if (!profile) { ctx.ui.notify("tutor profile unavailable; see the earlier warning", "error"); return; }
      if (!ctx.model) { ctx.ui.notify("no model selected; pick one with /model first", "error"); return; }
      const a = args.trim().toLowerCase();
      if (a === "off") {
        if (!onboardingActive()) { ctx.ui.notify("no onboarding in progress", "info"); return; }
        saveOnboarding({ ...onboarding!, paused: true }); // the next /tutor-start resumes (final review I4)
        ctx.ui.notify("paused; /tutor-start picks up where we left off", "info");
        return;
      }
      if (a === "check") { await onboardCheck(ctx); return; }
      if (a === "spec") { retrySpec(ctx); return; }
      if (a && !isLanguage(a)) { ctx.ui.notify(`pick one of: ${LANGUAGES.join(", ")}`, "warning"); return; }
      const saved = onboarding ?? loadOnboarding();
      if (saved && saved.stage !== "done" && (!a || saved.fields.target === a)) {
        onboardingHere = true;
        saveOnboarding({ ...saved, paused: false });
        ctx.ui.notify("picking up where we left off", "info");
        kick(ctx, "continue the conversation");
        return;
      }
      // Q9: a language with a project already is a check-in, not a first meeting.
      const p = profile;
      let o: Onboarding = newOnboarding(a || null);
      profileWrite(() => {
        const recent = (a ? [a] : p.languages()).flatMap((l) => p.projects(l)).sort((x, y) => y.created - x.created)[0];
        const row = recent ? p.language(recent.language) : undefined;
        if (recent && row) o = checkInOnboarding(recent.language, { level: row.level, known: p.languages(), last: recent.title, due: p.dueConcepts(recent.language, Date.now()) });
      });
      onboardingHere = true;
      saveOnboarding(o);
      kick(ctx, o.checkIn ? "check in with the learner" : "start the conversation");
      paint();
    },
  });

  pi.registerCommand("tutor-learn", {
    description: "Draft a skill from the last finished stuck episode; edit it, then submit to keep or Esc to discard",
    handler: async (_args, ctx) => {
      const branch = ctx.sessionManager.getBranch() as unknown[];
      const ep = lastClosedEpisode(branch);
      if (!ep) { ctx.ui.notify("no finished stuck episode to learn from yet", "info"); return; }
      if (!ctx.model) { ctx.ui.notify("no model selected; pick one with /model first", "error"); return; }
      const language = project?.language ?? editorLanguage() ?? "general";
      let draft: Learned;
      try {
        draft = await completeJson(modelComplete(ctx, () => "tutor: drafting a skill…"), systemText("learn"), learnPrompt(language, ep, transcript(branch)), checkLearned);
      } catch (e) {
        ctx.ui.notify(e instanceof Cancelled ? "tutor-learn cancelled" : `tutor-learn failed: ${e instanceof Error ? e.message : String(e)}`, e instanceof Cancelled ? "info" : "error");
        return;
      }
      const edited = await ctx.ui.editor("Learned skill: edit, submit to save, Esc to discard", renderLearned(language, draft));
      if (edited === undefined) { ctx.ui.notify("learned skill discarded", "info"); return; }
      let header: { name: string };
      try { header = parseSkillHeader(edited); } catch (e) { ctx.ui.notify(`not saved: ${e instanceof Error ? e.message : String(e)}`, "error"); return; }
      const dir = saveSkill(skillsRoot(), header.name, edited);
      ctx.ui.notify(`saved ${dir}; reloading skills`, "info");
      await ctx.reload();
    },
  });

  pi.registerCommand("tutor-status", {
    description: "Show the tutor's current state",
    handler: async (_args, ctx) => {
      ctx.ui.notify(renderWidget(state).join(" | "), "info");
    },
  });
}
