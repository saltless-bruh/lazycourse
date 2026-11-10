import { Text } from "@earendil-works/pi-tui";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import type { BeforeAgentStartEvent, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { retryAssistantCall } from "@earendil-works/pi-ai/compat";
import { NvimLink, type EditorSnapshot, type TutorPayload } from "./nvim.js";
import { renderWidget, renderStatus, type TutorState } from "./ui.js";
import { bandFor, thresholds, DEFAULT_LEVEL } from "./policy.js";
import { tutorPrompt, systemText } from "./prompts.js";
import { parseJudgment, toJudgment, isJudgmentTool, type Judgment } from "./judgment.js";
import { formatEditorContext, formatEpisodeContext } from "./context.js";
import { cleanReply, guardJudgment, checkReply, formatCheck, replyReminder, scrubInternals, diagramCols, ownNames, checkTurn, functionLines, foldPreamble, hideJudgment, type Issue, type TurnIssue } from "./compliance.js";
import { MAX_REASKS, HOLD_TEXT, REWRITE_TEXT, EMPTY_TEXT, LOST_TEXT, fallbackReply, turnInstruction } from "./turns.js";
/** Habits Task 19: the second reader gets three minutes (glm took about one per reply; speed is no goal for learners). */
const CHECKER_TIMEOUT_MS = 180_000;
import { DEFAULT_ROLE, roleNamed, rolePrompt } from "./roles.js";
import { parseThinkingMode, thinkingHidden, THINKING_LABEL, type ThinkingMode } from "./thinking.js";
import { rememberTool, recallTool, memorySnapshot, memoryLine } from "./memory.js";
import { writeInRoot } from "./files.js";
import { progressReport } from "./report.js";
import { tickTasks } from "./tasks.js";
import { STEPS, STEP_SPECS, TASK_ID, startWorkflow, recipeAutoStart, advance, workflowLabel, formatWorkflowContext, findTask, type Workflow } from "./workflow.js";
import { luaRuntime } from "./luarc.js";
import { goVersionOf, manifestFor } from "./manifest.js";
import { liveChecks, parseChecks, renderChecksMd, tickedIds, openTaskIds, shortNumber, type TickHow, type Check } from "./checks.js";
import { fallbackChecks, pickFallback } from "./improve-fallback.js";
import { describe as describeCmd, commandNote, editorCommandOf } from "./commands.js";
import { refreshPlanBuffers } from "./plan-reload.js";
import { whereOf, nextStep, sessionCard, type Where, type WayInput } from "./wayfinding.js";
import { taskTerms } from "./similarity.js";
import { calledFunctions, pythonSources, codeMetrics, improvePrompt, improveResult, measuredLine, type Measured } from "./improve.js";
import { projectRun, runChecks, type CheckResult } from "./check-run.js";
import { canFail, findOwnTests, hasTests, ownTestBodies, ownTestName, runOwnTests, testsInFile } from "./own-tests.js";
import { coveredCalls, doneWhenCalls, levelSuggestion, proScore, scoreLine, type ProFacts } from "./pro-score.js";
import { crossCheckOnReference, currentMilestone, extractCode, milestoneCount, milestoneText, readChecksState, writeMilestoneChecks, type ChecksState } from "./check-job.js";
import { recognize, examplesToChecks, recipeIntent, isAttempt } from "./recipe-steps.js";
import { questionTask, directionEvent, questionEvent, readsErrorEvent, smallRunEvent, changedLines, ownFixEvent, stepsFirstEvent, ideasToCodeEvent, type TryOutcome } from "./habit-events.js";
import type { HabitId } from "./habits.js";
import { levelInBand, stepDownSuggested, bandProgress, habitReport, HABIT_LABEL } from "./levels.js";
import { stepUpOffered, missingForStepUp, parsePlan, piecesMatch, unfamiliarModule, importedModules, stepUpResult, brokenProgram, backupStepUp, STEP_UP_LANGUAGES, ADVANCED_STEP_UP_LANGUAGES } from "./step-up.js";
import { commentPrefix } from "./scaffold.js";
import { solidIn } from "./habits.js";
import { calledName } from "./check-run-compiled.js";
import { StuckDetector, isSyntaxError, spotOf, spotLine, type StuckEvent } from "./stuck.js";
import { OfferBook, offerSpot, offerText, type Offer } from "./offers.js";
import { QUIET_KEY, QUIET_CHOICES, parseQuiet, quietLeft, quietLabel } from "./quiet.js";
import { sourceHash, projectSources } from "./source-hash.js";
import { easeDelay, attemptScore, stepFor, askHelp, restoreAttempts, recordAttempt, yieldsTo, openEpisode, applyJudgment, closeEpisode, describeTrigger, type TurnStep, type CloseReason, type Episode, type Trigger } from "./ladder.js";
import { guardToolCall, skillDirs } from "./guard.js";
import { writeProjectsFile, Profile, type FeedbackKind, type ProjectRow } from "./profile.js";
import { FEEDBACK_KINDS, activeFeedback, formatFeedback } from "./feedback.js";
import { IdeaError, suggestOne, createProject, defaultProjectDir, expandHome, isLanguage, LANGUAGES } from "./start.js";
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
import { BWRAP_PROBE, SANDBOX_MISSING, type SandboxHost } from "./exam/sandbox.js";
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
  /** Project paths whose plan job (spec Q22) or checks job (spec 2026-10-21 §7) runs in this load. */
  const specRunning = new Set<string>();
  const checksRunning = new Set<string>();
  /** Phase 8 B2: project path → the task whose improve-it checks are being written in the background. */
  const improvePreparing = new Map<string, string>();
  /**
   * Phase 8 A2 + review I2: on /new and /resume Pi loads the extension again and makes this load's `pi.*` throw
   * ("ctx is stale"), so a checks or improve-it job left running here would only fail later, after its model call.
   * session_shutdown stops them; the new load starts the checks job again at its session_start.
   */
  const jobs = new AbortController();
  const jobSignal = () => AbortSignal.any([AbortSignal.timeout(SPEC_JOB_TIMEOUT_MS), jobs.signal]);
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
   * - `episodeId`: the episode a ladder-role run answers, `null` when it started without one (M6c M6).
   * - `lang`: the language at the prompt; the judgment's tags use it (M7 minor: not the language at turn_end).
   * - `step`: this turn's step on the attempt ladder (spec 2026-10-21 §5), `null` outside a ladder role.
   * - `reasks`/`rejected`: spec 2026-10-21 §6 held replies; `names`/`sourceLines`: what the reply check compares with.
   */
  let run: { prompt: string; step: TurnStep | null; judged: boolean; episodeId?: string | null; lang?: string | null; reasks?: number; rejected?: boolean; names?: Set<string>; sourceLines?: string[]; referenceLines?: string[]; proseScope?: { referenceLines: string[]; sourceLines: string[] }; referenceCode?: string; taskTerms?: Set<string> } | null = null;
  /** A held reply failed its check: the re-ask count carried into the "[tutor] rewrite:" run, and its reasons. */
  let rewrite: { reasks: number; issues: TurnIssue[]; step: TurnStep; reason?: string } | null = null;
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
  // Spec 2026-10-26 §5.2: an error that sits never nudges; the learner asks with the right-click entry.
  // Ask-first spec 2026-11-09: signals only offer help, so an open episode never blocks one (offers back off on their own).
  const detector = new StuckDetector(() => thresholds(level()), () => true, { errorNudges: false });
  const offers = new OfferBook(() => thresholds(level()).idleMs);
  /** Quiet mode left (ms or "always"), or null when offers are on. */
  // Read from the profile at session start and kept here: paint runs often and must never wait on a locked profile.
  let quietRaw: string | undefined;
  function quietNow(): number | "always" | null { return quietLeft(quietRaw, Date.now()); }
  /** Ask-first: show an offer as a corner notice in Neovim (a pane notice without it). Never a reply. */
  /** No offers now: quiet mode, an exam or a step-up. Then nothing is recorded either (final review M2). */
  const offersOff = () => !!exam || !!stepUp || quietNow() !== null;
  /** Record and show an offer for `t` at `spot`, unless offers are off. */
  function offerFor(t: Trigger, spot: string) { if (!offersOff()) showOffer(offers.signal(t, spot, Date.now())); }
  function showOffer(o: Offer | null) {
    if (!o || offersOff()) return;
    const text = offerText(o.trigger, project?.path ?? session?.cwd ?? process.cwd());
    pi.appendEntry("tutor_offer", { spot: o.spot, count: o.count, text });
    if (link) link.offer(text).catch(() => {});
    else ui?.notify(text, "info");
  }
  /** Whether an offer's spot is still going: the pause it named, or an error on the file it named. */
  const offerCurrent = (o: Offer) => o.trigger.kind === "idle" ? detector.pausedIn()?.path === o.trigger.path
    : o.trigger.kind === "churn" ? detector.errorKeys().some((k) => k.startsWith(`${(o.trigger as { path: string }).path}|`)) : false;
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

  let lastNow = "";
  /** Author 2026-11-09: one re-ask per learner turn for a reply with nothing visible; the re-ask is due at agent_end. */
  let emptyAsked = false, pendingEmpty = false;
  /** Author 2026-11-09: a blank getting-started reply was re-asked; its onboarding step waits for the retry's agent_end. */
  let onboardWaits = false;
  /** Third review I1: the blank reply's own note, merged under the retry's (a retry's `{}` must not erase it). */
  let waitNote: Partial<Fields> | null = null;
  /** Third review M1: a queued rewrite belongs to the turn it was asked for; a learner's new message cancels it. */
  let rewriteToken = 0;
  /** Wayfinding spec §8.3: the tour's current step, from Neovim's `tour` payloads; null when no tour runs. */
  let tourState: { step: number; total: number; title: string } | null = null;
  /** Wayfinding spec 2026-11-08 §7: what decides the next step, read from the extension's own state. */
  function wayInput(): WayInput {
    const o = onboarding;
    const elsewhere = o && o.stage === "choose" && !o.paused && o.dir && !onboardingActive() ? o.dir : null;
    const shown = !!o && o.stage !== "done" && (o.paused || onboardingActive() || !!elsewhere);
    let passingTask: string | null = null;
    if (signal === "run passed" && project) {
      if (workflow) passingTask = workflow.task;
      else { try { passingTask = openTaskIds(readFileSync(join(project.path, "spec", "tasks.md"), "utf8"))[0] ?? null; } catch { passingTask = null; } }
    }
    return {
      firstRun: firstRun(), tour: tourState,
      onboarding: shown ? { stage: o!.stage, paused: !!o!.paused, levelTaskOpen: o!.stage === "check" && o!.levelCheck?.passed === null,
        dialog: (o!.stage === "read" && o!.presented === "read") || (o!.stage === "project" && o!.presented === "project"), elsewhere } : null,
      spec: specStatus, project: !!project,
      recipe: workflow ? { task: workflow.task, step: workflow.step, action: STEP_SPECS[workflow.step - 1].name.toLowerCase() } : null,
      stuck: !!episode, passingTask, lesson: lesson ? { step: lessonStep(lesson) } : null, exam: !!exam, stepUp: !!stepUp,
    };
  }
  function whereNow(): Where { return whereOf(wayInput()); }

  function paint() {
    state.attempt = episode?.attempts || undefined;
    state.exam = exam ? examLabel(exam, Date.now()) : undefined;
    state.state = episode ? `stuck: ${describeTrigger(episode.trigger)}`
      : specStatus === "writing" ? "spec: writing…" : specStatus === "failed" ? "spec error: /tutor-start spec" : signal;
    const r = roleNamed(activeRole);
    state.role = r.name === DEFAULT_ROLE ? undefined : r.name;
    if (!r.ladder) state.attempt = undefined;
    state.task = workflow ? workflowLabel(workflow) : undefined;
    { const q = quietNow(); state.quiet = q === null ? undefined : quietLabel(q); }
    state.lesson = lesson ? lessonLabel(lesson) : undefined;
    const way = wayInput();
    state.next = nextStep(way);
    // Wayfinding spec §8.2: Neovim's help tab opens with "Now: …"; sent only when it changed.
    const now = { where: whereOf(way), next: state.next };
    const nowKey = `${now.where}|${now.next}`;
    if (link && nowKey !== lastNow) { lastNow = nowKey; link.setNow(now).catch(() => { lastNow = ""; }); }
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
    state.levelKnown = true;
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
   *
   * Live check 2026-10-21: a different error in between (a typo) must not throw away the count on the spot the
   * learner returns to. Counts per spot live until a run passes.
   */
  const spotMemory = new Map<string, { attempts: number; lastHash?: string; climbs?: number; askedAt?: Episode["askedAt"] }>();
  const remember = (ep: Episode) => {
    if (!ep.spot) return;
    spotMemory.delete(ep.spot);
    spotMemory.set(ep.spot, { attempts: ep.attempts, lastHash: ep.lastHash, climbs: ep.climbs, askedAt: ep.askedAt });
    if (spotMemory.size > 20) spotMemory.delete(spotMemory.keys().next().value!);
  };
  function failedRun(trigger: Extract<Trigger, { kind: "run" }>, nudge: boolean, spotKey?: string) {
    const root = realCwd(project?.path ?? session?.cwd ?? process.cwd());
    if (isSyntaxError(trigger.trace)) { signal = "run failed: a syntax error (fix the line it names)"; paint(); return; }
    // Author 2026-11-08: a test run stopped at its time limit is no graded try (a slow machine must not spend tries);
    // the tutor still hears it timed out and helps, without help climbing.
    if (trigger.timedOut) { signal = "tests timed out"; paint(); if (nudge) offerFor(trigger, offerSpot(trigger)); return; }
    const spot = spotKey ?? spotOf(trigger.trace), hash = sourceHash(root);
    if (episode?.trigger.kind === "run" && episode.spot === spot) {
      episode = recordAttempt({ ...episode, trigger }, { spot, hash });
      remember(episode);
      pi.appendEntry("tutor_episode", episode);
      // Ask-first spec 2026-11-09: the try counts silently (an unchanged rerun is no new try); every failed run
      // still gets its own offer, not a reply (minor M7).
      if (nudge) offerFor(trigger, offerSpot(trigger, spot));
      return;
    }
    if (episode) closeEp("superseded");
    const fresh = openEpisode(trigger, bandFor(level()), Date.now());
    const prior = spotMemory.get(spot);
    episode = recordAttempt(prior ? { ...fresh, spot, attempts: prior.attempts, lastHash: prior.lastHash, climbs: prior.climbs, askedAt: prior.askedAt } : fresh, { spot, hash });
    remember(episode);
    pi.appendEntry("tutor_episode", episode);
    if (nudge) offerFor(trigger, offerSpot(trigger, spot));
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
      sendNudge(session, `${TUTOR_PREFIX} stuck signal: ${describeTrigger(trigger)}`);
    }
  }


  /**
   * Profile writes run from Neovim notifications and the tick, outside any Pi handler: an uncaught
   * SQLITE_BUSY or I/O error there would crash Pi, so it becomes a warning instead.
   */
  function profileWrite(write: () => void) {
    try { write(); } catch (e) { ui?.notify(`tutor: profile write failed: ${e instanceof Error ? e.message : String(e)}`, "warning"); }
  }
  /**
   * Phase 8 A2: a background job that outlives this load (/new, /resume: Pi loads the extension again and this
   * load's profile is closed) still saves what it made, through the open profile or one opened just for it.
   */
  function withProfile(use: (p: Profile) => void) {
    if (profile) { const p = profile; profileWrite(() => use(p)); return; }
    profileWrite(() => { const p = Profile.open(); try { use(p); } finally { p.close(); } });
  }

  /**
   * Spec §5: a closed episode is mirrored to the profile. Only inside a recorded project, and under
   * the project's language: the buffer filetype (state.language) is display-only — right after the
   * switch it is `markdown` (spec/tasks.md).
   */
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
      // Habits Task 6a (author 2026-10-27): a pause while working through a recipe is thinking, not being stuck.
      if (e.type === "open" && e.trigger.kind === "idle" && workflow) continue;
      // Ask-first spec 2026-11-09: a pause or churn only offers help; the learner asks with <leader>ts.
      if (e.type === "open" && (e.trigger.kind === "idle" || e.trigger.kind === "churn")) offerFor(e.trigger, offerSpot(e.trigger));
      // A failed run goes through failedRun, which counts the try and offers (never replies); nothing else talks first.
      else if (e.type === "open") openEp(e.trigger, e.trigger.kind === "run");
      else if (e.type === "run_passed") { closeEp("run_passed"); spotMemory.clear(); }
      else if (episode?.trigger.kind === "error" && episode.trigger.path === e.path && episode.trigger.msg === e.msg) closeEp("cleared");
    }
  }

  /** A step of the tour moved (or it ended): show it, record that the tour was seen, repaint. Code never the model. */
  function onTour(p: Extract<TutorPayload, { kind: "tour" }>) {
    const before = tourState;
    tourState = p.status === "running" ? { step: p.step, total: p.total, title: p.title } : null;
    if (profile) { const pr = profile; profileWrite(() => { if (!pr.setting("tour")) pr.setSetting("tour", "seen"); }); }
    const card = p.status === "done" ? "tour done — tell me what you'd like to learn, or type /tutor-start"
      : p.status === "running" ? `tour ${p.step}/${p.total}: ${p.title}` : null;
    const same = before && tourState && before.step === tourState.step;
    if (card && !same) pi.sendMessage({ customType: "tutor_card", display: true, content: card }, { triggerTurn: false });
    paint();
  }

  /**
   * Ask-first spec 2026-11-09: <leader>ts. The learner asks for help at their spot (or at the offer just shown, while
   * it still holds); the tutor answers now, never before. Not during an exam or a step-up.
   */
  // Final review I1 (2026-11-10): an ask pressed during a reply waits for it to end, however long (a nudge sent while
  // Pi streams is steered into the running reply, skipping the step the ask earned); several presses make one ask.
  let askQueued: Extract<TutorPayload, { kind: "stuck" }> | null = null;
  let askWaiting = false;
  function askStuck(p: Extract<TutorPayload, { kind: "stuck" }>) {
    askQueued = p;
    if (askWaiting) return;
    askWaiting = true;
    const poll = () => {
      if (closing) { askWaiting = false; askQueued = null; return; }
      if (!session || !session.isIdle()) { setTimeout(poll, 50).unref?.(); return; }
      askWaiting = false;
      const q = askQueued; askQueued = null;
      if (q) { runAsk(q); paint(); }
    };
    poll();
  }
  /** Asked readers of an error (path|message): one reads-errors event each, however often the learner presses (M5). */
  const askedErrors = new Set<string>();
  function runAsk(p: Extract<TutorPayload, { kind: "stuck" }>) {
    const base = project?.path ?? session?.cwd;
    if (!base || !session) return;
    const root = realCwd(base);
    // Final review I2: a new file not saved yet has no realpath; its folder does.
    let real: string;
    try { real = realpathSync(p.path); } catch {
      try { real = join(realpathSync(dirname(p.path)), basename(p.path)); } catch { ui?.notify("save the file, then <leader>ts", "info"); return; }
    }
    if (!real.startsWith(root + "/")) return;
    const rel = relative(root, real);
    if (exam || stepUp) {
      const t = `Not during the ${exam ? "exam" : "step-up test"}: <leader>ts works again after it`;
      if (link) link.offer(t).catch(() => {}); else ui?.notify(t, "info");
      return;
    }
    if (p.error && !askedErrors.has(`${real}|${p.error}`)) {
      askedErrors.add(`${real}|${p.error}`);
      const since = detector.errorSince(p.path) ?? detector.errorSince(real);
      recordHabit("reads-errors", readsErrorEvent({ shownMs: since === null ? null : Date.now() - since }, false), `stuck:${rel}:${p.line}`);
    }
    // Final review I3: a failing run's episode is kept first; a pending offer counts only when it is about this spot
    // (the cursor's 20-line region for a pause or churn) and still current; else this file's open episode; else here.
    const here: Trigger = p.error ? { kind: "error", path: p.path, line: p.line, msg: p.error } : { kind: "idle", path: p.path, line: p.line };
    const pend = offers.pending();
    const runEp = episode?.trigger.kind === "run";
    const holds = !!pend && pend.trigger.kind !== "run" && "path" in pend.trigger && pend.trigger.path === p.path
      && offerCurrent(pend) && (pend.trigger.kind === "idle" ? offerSpot(pend.trigger) === offerSpot({ kind: "idle", path: p.path, line: p.line })
        : p.line >= (pend.trigger as { region: [number, number] }).region[0] && p.line <= (pend.trigger as { region: [number, number] }).region[1]);
    const sameFile = !!episode && "path" in episode.trigger && episode.trigger.path === p.path;
    const trigger: Trigger = runEp ? episode!.trigger : holds ? pend!.trigger : sameFile ? episode!.trigger : here;
    if (pend && (holds || (runEp && pend.trigger.kind === "run"))) offers.reset(pend.spot); else offers.reset(offerSpot(trigger));
    if (!episode || offerSpot(episode.trigger) !== offerSpot(trigger)) {
      if (episode) closeEp("superseded");
      episode = openEpisode(trigger, bandFor(level()), Date.now());
      pi.appendEntry("tutor_episode", episode);
    }
    // Author 2026-11-09: this ask, not the failed runs before it, moves help (one step, and only after new effort).
    episode = askHelp(episode!, sourceHash(root));
    if (episode.spot) remember(episode);
    pi.appendEntry("tutor_episode", episode);
    ui?.notify(`stuck: ${rel}:${p.line}`, "info");
    lastNudge = Date.now();
    pi.sendMessage({ customType: "tutor_nudge", content: `${TUTOR_PREFIX} stuck (asked): ${describeTrigger(trigger)}`, display: false }, { triggerTurn: true });
  }

  function onPayload(p: TutorPayload) {
    switch (p.kind) {
      case "diagnostics":
        signal = p.errors > 0 ? `error: ${p.first?.msg ?? ""}` : p.warnings > 0 ? `${p.warnings} warning(s)` : "clean";
        break;
      case "idle": signal = `idle ${Math.round(p.since_ms / 1000)}s`; break;
      case "churn": signal = `churning lines ${p.region[0]}-${p.region[1]}`; break;
      case "tour": { onTour(p); return; }
      case "stuck": { askStuck(p); paint(); return; }
      case "run_output": {
        signal = p.code === 0 ? "run passed" : p.timed_out ? "tests timed out" : `run failed (exit ${p.code})`;
        // Final review I5: a :TutorRun run is a run too, for small runs.
        const entry = project ? projectRun(project.path, project.language).entry : null;
        if (project && entry) runSized(join(project.path, entry), "run");
        break;
      }
    }
    pi.appendEntry("tutor_signal", p);
    onStuck(detector.observe(p, Date.now()));
    paint();
  }

  pi.on("session_start", async (_event, ctx) => {
    closing = false;
    session = ctx;
    // Phase 1 minor M5: a new session (/new, /resume) owes nothing to the last one: no rewrite, no issues, no
    // spot counts. `run` stays: a reply still streaming finishes under its own language (M7 minor).
    rewrite = null; pendingRewrite = null; lastIssues = []; spotMemory.clear();
    emptyAsked = false; pendingEmpty = false; onboardWaits = false; waitNote = null;
    ui = ctx.hasUI ? ctx.ui : null;
    if (!profile) {
      try { profile = Profile.open(); } catch (e) { ctx.ui.notify(`tutor profile unavailable: ${e instanceof Error ? e.message : String(e)}`, "warning"); }
    }
    if (profile) { const p = profile; profileWrite(() => { quietRaw = p.setting(QUIET_KEY) ?? undefined; }); }
    // Wayfinding spec §8.4: Neovim reads the project folders at start-up to open the tutor by itself there.
    if (profile) { const p = profile; profileWrite(() => writeProjectsFile(p)); }
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
    // Learner-session fixes (spec §2): a first run leads — a welcome line, and no level shown until one is known.
    state.levelKnown = !(firstRun() || (onboardingActive() && (onboarding?.level === undefined || onboarding?.level === null)));
    generation++;
    lesson = null;
    if (project && profile) { const p = profile, key = `lesson:${project.path}`; profileWrite(() => { const raw = p.setting(key); if (raw) { try { lesson = JSON.parse(raw) as LessonState; } catch { lesson = null; } } }); }
    // Q23: the Pi that restarted in the new project folder carries the conversation on: build or learn.
    // Author 2026-11-09 (freeze option B): the first turn starts after session_start has returned, so Pi's screen is
    // hooked up to the run before the build-or-learn dialog opens (once, a dialog opened earlier ignored every key).
    if (onboardingActive() && onboarding?.stage === "choose") {
      const mine = generation;
      setTimeout(() => { if (generation === mine && onboardingActive() && onboarding?.stage === "choose") kick(ctx, "ask whether they want to start building now, or first learn the ideas the project needs in short lessons with small exercises"); }, 250).unref?.();
    }
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
    recipeOff = new Set(ctx.sessionManager.getBranch().flatMap((e) => (e.type === "custom" && e.customType === "tutor_workflow_off" ? [(e.data as { task: string }).task] : [])));
    const lessonNow = lesson as LessonState | null; // set inside profileWrite above; TS narrows it to null
    if (!lessonNow || lessonNow.building) autoRecipe(ctx);
    // Final review C1: a step-up in progress survives a restart (a step-up still being prepared does not).
    stepUp = null;
    if (project && profile) {
      const p = profile, key = `stepup:${project.path}`;
      let raw: string | null = null;
      profileWrite(() => { raw = p.setting(key); });
      try { const s = raw ? (JSON.parse(raw) as StepUpState) : null; stepUp = s && s.stage !== "preparing" ? s : null; } catch { stepUp = null; }
      // Phase 8 A9: an intermediate step-up saved before it had the tests and improve parts (habits Task 17) would
      // be passed on three parts; it starts again instead, with no wait.
      if (stepUp && stepUp.band === "intermediate" && !stepUp.improveTask) {
        stepUp = null;
        ctx.ui.notify("the intermediate step-up now also has a tests part and an improve part, so the one you started is dropped: /tutor-step-up starts it again. Nothing counts against you.", "info");
      }
      if (raw && !stepUp) profileWrite(() => p.setSetting(key, ""));
    }
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
      if (link) { state.lost = false; link.tourHello().catch(() => {}); }
    }
    if (!tick) {
      tick = setInterval(() => {
        const ev = detector.tick(Date.now());
        // Ask-first minor M3: the quiet label counts down, and goes when quiet ends, with no other event to repaint.
        const q = quietNow(), quietNowLabel = q === null ? undefined : quietLabel(q);
        if (ev.length) onStuck(ev);
        if (ev.length || quietNowLabel !== state.quiet) paint();
        if (!offersOff()) showOffer(offers.due(Date.now(), offerCurrent));
      }, TICK_MS);
      tick.unref?.();
    }
    // Wayfinding spec §8.1: every session opens with a card (the first-run welcome is its first form).
    {
      let tourSeen = false;
      if (profile) { const p = profile; profileWrite(() => { tourSeen = !!p.setting("tour"); }); }
      const task = workflow?.task;
      pi.sendMessage({ customType: "tutor_card", display: true, content: sessionCard(wayInput(), {
        project: project?.title, task, level: state.levelKnown === false ? undefined : state.level, tourOffered: firstRun() && !tourSeen,
      }) }, { triggerTurn: false });
    }
    examClock();
    paint();
  });

  pi.on("session_shutdown", async () => {
    closing = true;
    jobs.abort(); // Phase 8 review I2: this load's background jobs end with it
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
  /** The text a run started with: the learner's prompt, or the content of our hidden nudge (wayfinding spec §9.1). */
  function promptOf(event: BeforeAgentStartEvent): string {
    if (event.messageType === "user") return event.prompt;
    return event.message.customType === "tutor_nudge" && typeof event.message.content === "string" ? event.message.content : "";
  }
  pi.on("before_agent_start", async (event) => {
    // Review I4: every run but the empty-reply re-ask itself starts with its own re-ask available.
    if (!(event.messageType === "custom" && event.message.customType === "tutor_rewrite")) emptyAsked = false;
    // Third review M1: a new message from the learner is the next turn: no queued rewrite or onboarding wait survives it.
    if (event.messageType === "user") { rewriteToken++; onboardWaits = false; }
    event.systemPromptOptions.sections["tutor_commands"] = commandNote(whereNow());
    // Learner-session fixes (spec §2): a first run's first message is the onboarding's first answer.
    // Wayfinding spec §8.3: during the tour a question is about the tour, not the onboarding's first answer.
    if (event.messageType === "user" && tourState && !event.prompt.trim().startsWith("/")) link?.tourEvent("asked").catch(() => {});
    if (event.messageType === "user" && firstRun() && !tourState && !event.prompt.trim().startsWith("/")) {
      saveOnboarding(newOnboarding(null));
      onboardingHere = true;
    }
    if (onboardingActive()) {
      // Spec 2026-10-19 §6: the onboarding rules replace the ladder prompt (no judgment block asked for).
      event.systemPromptOptions.sections["tutor"] = systemText("onboard");
      event.systemPromptOptions.sections["tutor_onboard"] = onboardPrompt(onboarding!);
      if (memoryNote) event.systemPromptOptions.sections["tutor_memory"] = memoryNote;
      if (!onboardWaits) intake = undefined; // a retry of a blank reply keeps the note that reply carried
      run = { prompt: promptOf(event), step: null, judged: true };
      return;
    }
    const band = bandFor(level());
    if (lesson && project) event.systemPromptOptions.sections["tutor_lesson"] = lessonSection(lesson, project.language);
    const role = roleNamed(activeRole);
    event.systemPromptOptions.sections["tutor"] = tutorPrompt(band, { role: rolePrompt(role), ladder: role.ladder });
    if (memoryNote) event.systemPromptOptions.sections["tutor_memory"] = memoryNote;
    if (tourState) event.systemPromptOptions.sections["tutor_tour"] = `${systemText("tour")}\n[tour] the learner is on step ${tourState.step}/${tourState.total}: ${tourState.title}`;
    // Pi 1.2+: runs started by an extension's custom message (`messageType: "custom"`) carry no prompt; our own
    // hidden nudge's text stands in, so every "[tutor]" check below still knows the turn is the tutor's.
    const prompt = promptOf(event);
    learnerMessage(prompt);
    // A learner's chat message opens an episode; our own [tutor] nudges, custom-message runs and non-ladder roles do not.
    if (role.ladder && !episode && event.messageType === "user" && !prompt.startsWith(TUTOR_PREFIX)) { openEp({ kind: "chat" }, false); paint(); }
    // Author 2026-11-09: <leader>te is an ask like <leader>ts: it may move help one step (only after new effort).
    if (role.ladder && episode && event.messageType === "user" && prompt.startsWith("[ask-error]")) {
      // Final review I4: an ask about another file starts fresh, never at the other file's step.
      const base = realCwd(project?.path ?? session?.cwd ?? process.cwd());
      const at = /^\[ask-error\] (.+?):\d+:/.exec(prompt)?.[1];
      const epPath = "path" in episode.trigger ? episode.trigger.path : null;
      const sameFile = (q: string) => { try { return realpathSync(q) === realpathSync(join(base, at!)); } catch { return q === join(base, at!); } };
      if (at && ((epPath && !sameFile(epPath)) || (!epPath && episode.trigger.kind !== "chat"))) { closeEp("superseded"); openEp({ kind: "chat" }, false); }
      episode = askHelp(episode!, sourceHash(base));
      if (episode.spot) remember(episode);
      pi.appendEntry("tutor_episode", episode);
    }
    pendingSteers = 0;
    // Spec 2026-10-21 §6: a rewrite run keeps the re-ask count of the reply it replaces; any other run starts at 0.
    const isRewrite = event.messageType === "custom" && event.message.customType === "tutor_rewrite";
    // Phase 5 live run: the pro notes turn has its own shape; the five bold parts won over the request.
    const isNotes = event.messageType === "custom" && event.message.customType === "tutor_notes";
    if (!isRewrite) rewrite = null;
    // Final review I2: on a run's episode the fix answers the failed run's own nudge (or its rewrite, or a pro's
    // /tutor-fix); a chat question after it is at why, so a later unrelated question never runs with the leak check off.
    let step = role.ladder ? stepFor(episode, { exam: exam !== null }) : null;
    const answersRun = prompt.startsWith(`${TUTOR_PREFIX} stuck signal: run failed`) || prompt.startsWith(`${TUTOR_PREFIX} stuck (asked): run failed`) || (isRewrite && rewrite?.step === "fix") || episode?.fixAsked === true;
    if (step === "fix" && episode?.trigger.kind === "run" && !answersRun) step = "why";
    if (isNotes) step = null;
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
      // Learner-session fixes (spec §5): the current task's words — the recipe's task, the episode's, else the first
      // open one — or, before a plan, the README's title and first paragraph (the project's own words).
      const current = workflow?.task ?? (episode?.spot?.startsWith("check:") ? episode.spot.split(":")[1] : null) ?? (tasksMd ? openTaskIds(tasksMd)[0] ?? null : null);
      const taskLine = current && tasksMd ? findTask(tasksMd, current) : null;
      const about = taskLine ?? projectAbout(root);
      run.taskTerms = about ? taskTerms(about) : undefined;
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
        run.referenceCode = k ? state.milestones[k].reference : undefined;
        // Final review C1: a fix in words is judged on a failed check only, inside the function it calls.
        const fn = episode?.spot?.startsWith("check:") ? calledName(episode.spot.split(":").slice(2).join(":")) : null;
        run.proseScope = fn ? { referenceLines: functionLines(run.referenceLines, fn), sourceLines: functionLines(sources.flatMap((t) => t.split(/\r?\n/)), fn) } : undefined;
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
    // Spec 2026-10-26 §6.3: during the talking test the tutor listens; the plan is the learner's.
    if (stepUp && (stepUp.stage === "coding" || stepUp.stage === "coding-ready")) parts.push("[step-up] coding test in stepup/ (it runs as an exam): never write, complete or fix the learner's code in stepup/, never point at the planted bug in the fix file, and never quote a solution. Answer questions about the language in general, on unrelated examples.");
    if (stepUp && (stepUp.stage === "talk" || stepUp.stage === "plan" || stepUp.stage === "plan-reask")) parts.push(`[step-up] talking test on: ${stepUp.talkTask}\nThe learner plans it in words. Ask at most one short question; never name functions, pieces or code yourself, and never solve it.`);
    // The architect suspends the recipe (M6a minor): no step context for a role that must not write code.
    // Phase 1 live check: a right-click question is about the error, so the recipe step stays out of that turn.
    if (workflow && role.ladder && !prompt.startsWith("[ask-error]")) {
      parts.push(formatWorkflowContext(workflow, band));
      if (recipeNote) parts.push(recipeNote);
    }
    // Option 2: the idiom index only at the recipe's Map step or on a how-do-I question, this turn only.
    const mapStep = workflow !== null && role.ladder && STEPS[workflow.step - 1] === "Map";
    if (lang && pack && role.ladder && indexWanted({ prompt, mapStep })) {
      const index = packIndex(lang);
      if (index) parts.push(index);
    }
    if (isRewrite && rewrite) parts.push(formatCheck(rewrite.issues, diagramCols(paneWidth), rewrite.reason));
    else if (lastIssues.length) parts.push(formatCheck(lastIssues, diagramCols(paneWidth)));
    const fb = formatFeedback(activeFeedback(feedbackHistory));
    if (fb) parts.push(fb);
    parts.push(isNotes ? NOTES_REMINDER : replyReminder(run.step, workflow !== null && role.ladder));
    if (snap) parts.push(formatEditorContext(snap));
    return { message: { customType: "tutor_editor", content: parts.join("\n\n"), display: false, details: { band, path: snap?.path, episode: episode?.id } } };
  });

  /** Phase 8 A16: the learner's message moved the recipe since the last judgment. */
  let recipeMovedByCode = false;
  /** Learner-session fixes §6: this message asked what the step means; the step's explanation, for this turn only. */
  let recipeNote: string | null = null;
  /** The learner's latest own message: the model's step_done counts only after a real attempt (spec §6). */
  let lastLearnerText = "";
  /**
   * Spec 2026-10-26 §5.1: the learner's own message advances the step when it has the step's artifact. Spec §6:
   * plain words first — a skip moves on without counting as the learner's own; "what is …" gets the explanation.
   */
  function recipeStep(prompt: string) {
    const w = workflow;
    if (!w || !project) return;
    // Final review I4: the learner's artifact first, so a hedged one ("not sure, but my steps are: 1. …") still counts.
    if (!recognize(w.step, prompt, { language: project.language, task: w.task })) {
      const intent = recipeIntent(prompt);
      if (intent === "skip") { advanceWorkflow(true); recipeMovedByCode = true; paint(); }
      if (intent === "explain") {
        const spec = STEP_SPECS[w.step - 1];
        recipeNote = `[workflow] Explain step ${spec.name} in one sentence: ${spec.explain}; then ask for it again (the learner writes: ${spec.learnerWrites}).`;
      }
      return;
    }
    if (w.step === 3) void addExampleChecks(prompt, w.task);
    rememberOwnStep(w.task, w.step);
    advanceWorkflow(true);
    recipeMovedByCode = true;
    paint();
  }

  /** The learner's Examples rows become checks for the task, cross-checked on the milestone's reference. */
  async function addExampleChecks(text: string, task: string) {
    if (!project || !profile) return;
    const proj = project, p = profile, root = proj.path, key = `checks:${root}`;
    let tasksMd = "";
    try { tasksMd = readFileSync(join(root, "spec", "tasks.md"), "utf8"); } catch { return; }
    const k = currentMilestone(tasksMd, lesson);
    const rows = examplesToChecks(text, task, proj.language, k);
    if (!rows.length) return;
    let state: ChecksState = { milestones: {} };
    profileWrite(() => { state = readChecksState(p.setting(key)); });
    const { runCmd, entry } = projectRun(root, proj.language);
    const checked = await crossCheckOnReference({ exec: (c, a, o) => pi.exec(c, a, o), sandbox: sandboxHost(), language: proj.language, entry, runCmd, reference: state.milestones[k]?.reference ?? "", checks: rows, root });
    if (!profile) return;
    const now = profile;
    let saved: ChecksState = { milestones: {} };
    profileWrite(() => {
      saved = readChecksState(now.setting(key));
      const m = saved.milestones[k] ?? { checks: [], reference: "", ran: false };
      // Deferred minor: an example said again (or twice in one message) is the same check, kept once.
      const same = (c: Check) => JSON.stringify([c.task, c.kind, c.expr, c.expected, c.stdin, c.contains]);
      const had = new Set(m.checks.map(same));
      saved.milestones[k] = { ...m, checks: [...m.checks, ...checked.filter((c) => !had.has(same(c)) && had.add(same(c)) !== undefined)] };
      now.setSetting(key, JSON.stringify(saved));
    });
    writeChecksMd(root, saved, k);
  }

  function advanceWorkflow(stepDone: boolean): Workflow | null {
    if (!workflow) return null;
    const next = advance(workflow, stepDone, Date.now());
    if (next === workflow) return workflow;
    // Habits: reaching Build, how many of Shape / Examples / Steps were the learner's own.
    if (next.step === STEPS.length && workflow.step === STEPS.length - 1) {
      const own = ownStepsOf(next.task);
      recordHabit("steps-first", stepsFirstEvent([2, 3, 4].filter((s) => own.has(s)).length), `recipe:${next.task}`);
    }
    pi.appendEntry("tutor_workflow", next);
    if (next.done !== undefined) { ui?.notify(`design recipe for ${next.task} finished`, "info"); rememberRecipe("done", next.task); }
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
    // Phase 8 A16: one step per reply — when code already moved the recipe on the learner's message, the reply's
    // step_done is about that same step. Spec §6: the model's word moves the step only after a real attempt, and
    // never counts toward a habit (no rememberOwnStep) — the model still awards nothing.
    if (ladder) advanceWorkflow(j.step_done && !recipeMovedByCode && isAttempt(lastLearnerText));
    recipeMovedByCode = false;
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
  /**
   * Everything that reads a learner's own message: recipe steps, the step-up, the right-click ask and the
   * chat habits. Called for a fresh prompt and for one typed while the tutor was answering (a steer, which
   * Pi delivers without a new before_agent_start — phase 3 live check).
   */
  function learnerMessage(prompt: string) {
    recipeMovedByCode = false; // Phase 8 review I4: one judgment cycle per learner message, judged or not
    recipeNote = null;
    if (prompt && !prompt.startsWith(TUTOR_PREFIX)) lastLearnerText = prompt.startsWith("[ask-error]") ? "" : prompt; // a right-click ask is a question
    // Final review I6/M10: during the talking test a message is the step-up's (not a recipe step, not chat
    // evidence); a right-click question stays a question.
    const talking = stepUp && (stepUp.stage === "talk" || stepUp.stage === "plan" || stepUp.stage === "plan-reask");
    if (talking && prompt && !prompt.startsWith(TUTOR_PREFIX) && !prompt.startsWith("[ask-error]")) { stepUpTurn(prompt); return; }
  // Phase 8 A14: a right-click ask carries the code it points at, which is no recipe step of the learner's.
  if (workflow && prompt && !prompt.startsWith(TUTOR_PREFIX) && !prompt.startsWith("[ask-error]")) recipeStep(prompt);
  const asked = /^\[ask-error\] (.+?):(\d+): (.*?) \| code: /.exec(prompt);
  if (asked) {
    const base = project?.path ?? session?.cwd;
    const since = base ? detector.errorSince(join(base, asked[1])) : null;
    const shownMs = since === null ? null : Date.now() - since;
    pi.appendEntry("tutor_ask_error", { path: asked[1], line: Number(asked[2]), msg: asked[3], shownMs });
    recordHabit("reads-errors", readsErrorEvent({ shownMs }, false), `ask:${asked[1]}:${asked[2]}`);
  } else if (prompt && !prompt.startsWith(TUTOR_PREFIX)) {
    // Final review I6: one miss per open error, never for recipe replies, exams or roles without the ladder.
    const fresh = detector.errorKeys().filter((k) => !missedErrors.has(k));
    if (fresh.length && !workflow && !exam && roleNamed(activeRole).ladder) {
      recordHabit("reads-errors", readsErrorEvent(null, true), "chat");
      for (const k of fresh) missedErrors.add(k);
    }
    // Right question: judged by the next graded try on the task this question was asked during (M2: a question has a "?").
    // Phase 8 A12: a question that names another open task (or only its functions) is that task's question.
    const task = episode?.spot?.startsWith("check:") && prompt.includes("?") ? questionTask(prompt, episode.spot.split(":")[1], ...taskIndex()) : null;
    if (task) {
      const said = prompt.trim().toLowerCase(), before = askedBefore.get(task) ?? [];
      if (before.includes(said)) recordHabit("right-question", questionEvent(null, true), `question:${task}`);
      else pendingQuestion = task;
      askedBefore.set(task, [...before, said]);
    }
  }
  }

  /** The open task ids and, from the live checks, function → the tasks whose checks call it (Phase 8 A12). */
  function taskIndex(): [Set<string>, Map<string, string[]>] {
    const fns = new Map<string, string[]>();
    if (!project || !profile) return [new Set(), fns];
    let tasksMd = "";
    try { tasksMd = readFileSync(join(project.path, "spec", "tasks.md"), "utf8"); } catch { /* no plan */ }
    let cs: ChecksState = { milestones: {} };
    const p = profile, key = `checks:${project.path}`;
    profileWrite(() => { cs = readChecksState(p.setting(key)); });
    for (const c of liveChecks(Object.values(cs.milestones).flatMap((m) => m.checks), currentMilestone(tasksMd, lesson))) {
      const task = c.task.replace(/\.S\d+$/, "");
      for (const f of calledFunctions(c.expr ? [c.expr] : [])) fns.set(f, [...new Set([...(fns.get(f) ?? []), task])]);
    }
    return [new Set(openTaskIds(tasksMd)), fns];
  }

  pi.on("input", async (event, ctx) => {
    // 2026-11-09: `:TutorTour` typed into the pane went to the model as chat. A listed Neovim command runs in Neovim,
    // only when the learner typed it (review #1: text an extension or rpc sends is never run as an editor command).
    const cmd = event.source === "interactive" ? editorCommandOf(event.text) : null;
    if (cmd) {
      const typed = `:${cmd.name}${cmd.args.length ? ` ${cmd.args.join(" ")}` : ""}`;
      if (link) {
        try { await link.runEditorCommand(cmd.name, cmd.args); ctx.ui.notify(`ran ${typed} in Neovim (Neovim commands start with ":" and go in the editor; here you talk to the tutor)`, "info"); }
        catch { ctx.ui.notify(`${typed} is a Neovim command: press <Esc><Esc>, then <C-w>h, and type it in the editor`, "warning"); }
      } else ctx.ui.notify(`${typed} is a Neovim command: type it in the editor, not here`, "info");
      return { action: "handled" as const };
    }
    if (event.streamingBehavior) pendingSteers++;
    return undefined;
  });
  pi.on("message_start", (event) => {
    const m = event.message;
    if (m.role !== "user" || !run || pendingSteers === 0) return;
    pendingSteers--;
    const text = typeof m.content === "string" ? m.content : m.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("\n");
    // Phase 8 review I3: a held reply that got the fallback marked the run rejected; the reply to this message is new.
    run = { ...run, prompt: text, judged: false, rejected: false, reasks: 0 };
    emptyAsked = false; pendingEmpty = false; onboardWaits = false; // review I3: the learner moved on; their message gets the next reply
    learnerMessage(text);
  });

  // Style guards (golden 2026-10-13: "At rung 1, …", "line 4597 in INDEX.md"). The screen shows the
  // reworded text while it streams; message_end swaps it into the finished reply before turn_end,
  // the saved session and the model's next context see it. Fences (the judgment block) are kept.
  /** A teaching turn: its reply is held off screen while it streams and checked before it is shown. */
  const held = () => run !== null && run.step !== null && !onboardingActive();
  /** Phase 1 minor M4: a hint or a question is plain sentences, so a bold label in it is no heading to fold to. */
  const folds = () => held() && run!.step !== "hint" && run!.step !== "ask";
  const guarded = () => held() && run!.step !== "fix";
  /**
   * Habits Task 19 (spec 2026-10-26 §9): `/tutor-checker <provider/model>` names a second model that reads a held
   * reply after code's checks passed, against this turn's rule. Its "no: <reason>" is handled like a failed code
   * check; an error, a timeout or an unclear answer lets the reply through, since it may only make replies stricter.
   */
  async function askChecker(ctx: ExtensionContext, step: TurnStep, text: string, names: Set<string>): Promise<string | undefined> {
    const id = profile?.setting("checker");
    if (!id || id === "off") return undefined;
    const slash = id.indexOf("/");
    if (slash <= 0) { checkerSkipped(`${id} is not a provider/model`); return undefined; } // final review M3
    const model = ctx.modelRegistry.find(id.slice(0, slash), id.slice(slash + 1));
    if (!model) { checkerSkipped(`no model ${id} in Pi's model list`); return undefined; }
    // Final review I3: the facts the rule speaks of, and for `why` only the corrected line is held back.
    const rule = `${turnInstruction(step)}${step === "why" ? " Do not write the corrected line." : step !== "fix" ? " Do not state the fix, in code or in words." : ""}`;
    const spot = episode?.trigger.kind === "run" ? spotLine(episode.trigger.trace) : episode?.spot ?? "";
    const facts = [spot ? `The spot: ${spot}` : "", names.size ? `The learner's names: ${[...names].slice(0, 30).join(", ")}` : ""].filter(Boolean).join("\n");
    // Final review M2: the reply is data inside tags, never instructions to the checker.
    const ask = `This turn's rule: ${rule}${facts ? `\n${facts}` : ""}\n\nThe reply:\n<reply>\n${text}\n</reply>`;
    const t0 = Date.now();
    // Final review I1: Esc stops the wait, and nothing it said afterwards counts.
    const signal = AbortSignal.any([AbortSignal.timeout(CHECKER_TIMEOUT_MS), ...(ctx.signal ? [ctx.signal] : [])]);
    try {
      const r = await ctx.modelRegistry.complete(model, { systemPrompt: systemText("checker"), messages: [{ role: "user", content: [{ type: "text", text: ask }], timestamp: Date.now() }] }, { signal });
      // Final review I2: the API resolves its failures (stopReason "error" / "aborted"), it does not throw them.
      if (ctx.signal?.aborted) { checkerSkipped("stopped"); return undefined; }
      if (r.stopReason !== "stop") { checkerSkipped(r.stopReason === "aborted" ? "no answer in three minutes" : r.errorMessage || r.stopReason); return undefined; }
      const answer = r.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("\n").trim();
      // Final review M1: only a first line that is "yes" or "no" (or "no: reason") is a verdict.
      const first = (answer.split("\n")[0] ?? "").replace(/\*+/g, "").trim();
      const v = /^\W*(yes|no)\b\W*?(?:[:—–-]\s*(.*)|\W*)$/i.exec(first);
      if (!v) { checkerSkipped(`an unclear answer: ${first.slice(0, 60) || "nothing"}`); return undefined; }
      const verdict = v[1].toLowerCase();
      pi.appendEntry("tutor_checker", { verdict, ms: Date.now() - t0 }); // live audits count what it read
      return verdict === "no" ? (v[2]?.trim() || "it breaks this turn's rule") : undefined;
    } catch (e) {
      checkerSkipped(ctx.signal?.aborted ? "stopped" : e instanceof Error ? e.message : String(e));
      return undefined;
    }
  }
  /** Side-agent note: a check that did not happen is never silent; the session counts them for live audits. */
  function checkerSkipped(why: string) {
    pi.appendEntry("tutor_checker_skip", { why });
    ui?.notify(`the second reader did not answer (${why}); this reply was shown unread`, "info");
  }
  pi.registerCommand("tutor-checker", {
    description: describeCmd("/tutor-checker"),
    handler: async (args, ctx) => {
      const want = args.trim();
      const now = profile?.setting("checker") || "off";
      if (!want) { ctx.ui.notify(`usage: /tutor-checker <provider/model>|off (now ${now})`, "info"); return; }
      if (want !== "off") {
        const slash = want.indexOf("/");
        if (slash <= 0 || !ctx.modelRegistry.find(want.slice(0, slash), want.slice(slash + 1))) { ctx.ui.notify(`no model ${want} in Pi's model list (/model shows them)`, "warning"); return; }
      }
      if (!profile) { ctx.ui.notify("/tutor-checker needs the tutor's profile, which is not open", "warning"); return; } // final review M4
      const p = profile;
      profileWrite(() => p.setSetting("checker", want));
      ctx.ui.notify(want === "off" ? "no second reader: code's checks alone hold replies" : `held replies are also read by ${want} against the turn's rule; it can only make them stricter`, "info");
    },
  });

  // Wayfinding spec §8.1: the card is plain text, not shown under a "[tutor_card]" label.
  pi.registerMessageRenderer("tutor_card", (m) => new Text(String(m.content), 1, 0));
  pi.registerMarkdownTransformer((md, c) => {
    // Spec 2026-10-21 §6: before the fix is allowed the thinking (where the model works the fix out) stays hidden.
    if (c.messageType === "assistant-thinking") return thinkingHidden(thinking, bandFor(level()), guarded()) ? THINKING_LABEL : md;
    if (c.messageType !== "assistant") return md;
    paneWidth = c.availableWidth;
    if (held() && c.isStreaming) return HOLD_TEXT;
    // Learner-session fixes (spec §4): every assistant message, every turn type, onboarding included.
    const shown = hideJudgment(scrubInternals(cleanReply(md), { intakeJson: onboardingActive() }));
    return folds() ? foldPreamble(shown) : shown;
  });
  pi.on("message_end", async (event, ctx) => {
    const m = event.message;
    if (m.role !== "assistant") return;
    // Live check 2026-10-19: a run Pi continues from our kick has no before_agent_start, so the onboarding
    // state, not a flag set there, decides what an exchange is.
    if (onboardingActive()) {
      // The note must be read here: the scrubbed reply (no fence) is what turn_end and the session see.
      const text = m.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("\n");
      // A retry's reply without a note keeps the note the blank reply carried (author 2026-11-09).
      if (text.trim()) { const note = parseIntake(text, { json: true }); if (note !== null || !onboardWaits) intake = note; }
    }
    let changed = false;
    let content = m.content.map((c) => {
      if (c.type !== "text") return c;
      const clean = cleanReply(c.text);
      const scrubbed = scrubInternals(clean, { intakeJson: onboardingActive() });
      const text = folds() ? foldPreamble(scrubbed) : scrubbed;
      if (text === c.text) return c;
      changed = true;
      return { ...c, text };
    });
    const cur = run;
    const text = content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("\n");
    if (held() && cur && cur.step !== null && text.trim()) {
      let issues: TurnIssue[] = checkTurn(text, { step: cur.step, names: cur.names ?? new Set(), sourceLines: cur.sourceLines ?? [], referenceLines: cur.referenceLines, proseScope: cur.proseScope, referenceCode: cur.referenceCode, taskTerms: cur.taskTerms });
      // Habits Task 19: the optional second reader sees only a final reply code passed; it can only make it stricter.
      let reason: string | undefined, typedMeanwhile = false;
      if (!issues.length && m.stopReason === "stop" && !m.content.some((c) => c.type === "toolCall")) {
        const steersBefore = pendingSteers;
        reason = await askChecker(ctx, cur.step, text, cur.names ?? new Set());
        // Phase 8 B4: a message typed during the wait continues this run before any rewrite could start.
        typedMeanwhile = pendingSteers > steersBefore;
        if (reason) issues = ["checker"];
      }
      if (issues.length) {
        // The session keeps what was rejected (never shown) so a live audit can tell a leak from a too-strict check.
        pi.appendEntry("tutor_check", { issues, step: cur.step, reasks: cur.reasks ?? 0, rejected: text.slice(0, 2000), ...(reason ? { reason } : {}) });
        // Final review M2: a reply cut off (length) or broken (error) is still the last word of its run: it gets the
        // fallback, never an empty reply. Only a clean stop is re-asked.
        const final = !m.content.some((c) => c.type === "toolCall");
        let replacement = "";
        // Phase 8 B4: the learner typed while the checker read: the run goes on to their message, so the held reply
        // gets the fallback instead of a rewrite of a turn they have moved past.
        if (final && m.stopReason === "stop" && (cur.reasks ?? 0) < MAX_REASKS && !typedMeanwhile) {
          replacement = REWRITE_TEXT;
          rewrite = { reasks: (cur.reasks ?? 0) + 1, issues, step: cur.step, ...(reason ? { reason } : {}) };
          pendingRewrite = issues;
        } else if (final) {
          const inRecipe = workflow && roleNamed(activeRole).ladder ? { n: workflow.step, ...STEP_SPECS[workflow.step - 1] } : undefined;
          replacement = fallbackReply(cur.step, episode?.trigger.kind === "run" ? spotLine(episode.trigger.trace) : undefined, inRecipe);
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
    // Author 2026-11-09 (option B): a final reply with nothing for the learner — the answer stayed in the hidden thinking —
    // is held and asked once more; empty again, an honest line. The judgment fence stays, so the turn still counts.
    // Review I5: a reply cut off (length) or broken (error) with nothing visible gets the honest line, never a re-ask.
    // Author 2026-11-09: getting-started is re-asked too; its own next step waits for the retry (agent_end).
    const ended = !m.content.some((c) => c.type === "toolCall");
    const shown = content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("\n");
    if (ended && !hideJudgment(shown).trim()) {
      const reask = m.stopReason === "stop" && !emptyAsked;
      const line = reask ? EMPTY_TEXT : LOST_TEXT;
      if (reask) {
        emptyAsked = true; pendingEmpty = true;
        if (onboardingActive()) { onboardWaits = true; waitNote = intake ?? null; }
        // Review I1: the judgment counts on the reply the learner reads, so this one's is dropped; the re-ask keeps
        // this turn's step (a fix stays a fix) and is told why.
        if (cur) {
          cur.rejected = true;
          if (cur.step) rewrite = { reasks: cur.reasks ?? 0, issues: ["empty"], step: cur.step };
        }
      }
      pi.appendEntry("tutor_check", { issues: ["empty"], step: cur?.step ?? null, rejected: shown.slice(0, 2000) });
      const i = content.findIndex((c) => c.type === "text");
      content = i < 0 ? [...content, { type: "text" as const, text: line }]
        : content.map((c, k) => (k === i && c.type === "text" ? { ...c, text: `${line}\n${c.text}` } : c));
      changed = true;
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
  const LEARNER_ONLY = new Set(["tutor_stepup", "tutor_exam_check", "tutor_welcome", "tutor_card"]);
  pi.on("context", (event) => {
    const msgs = event.messages;
    const last = new Map<string, number>();
    msgs.forEach((m, i) => { if (m.role === "custom" && NEWEST_ONLY.has(m.customType)) last.set(m.customType, i); });
    // Phase 8 B6: the step-up's messages (the problem, "Now your plan", the result) are the learner's to read; the
    // model gets its own [step-up] rule in the turn context and must not answer them.
    const pruned = msgs.filter((m, i) => !(m.role === "custom" && ((NEWEST_ONLY.has(m.customType) && last.get(m.customType) !== i) || LEARNER_ONLY.has(m.customType))));
    return pruned.length === msgs.length ? undefined : { messages: pruned };
  });

  pi.registerCommand("tutor-architect", {
    description: describeCmd("/tutor-architect"),
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
    description: describeCmd("/tutor-plan"),
    handler: async (args, ctx) => {
      const id = args.trim();
      // Live check: the model may call a step complete and never set step_done; the learner moves on.
      if (id === "off") {
        if (!workflow) { ctx.ui.notify("no design recipe in progress", "info"); return; }
        const task = workflow.task;
        recipeOff.add(task);
        rememberRecipe("off", task);
        pi.appendEntry("tutor_workflow_off", { task });
        pi.appendEntry("tutor_workflow", { ...workflow, done: Date.now() });
        workflow = null;
        paint();
        ctx.ui.notify(`design recipe for ${task} stopped`, "info");
        return;
      }
      if (id === "next" || id === "skip") {
        if (!workflow) { ctx.ui.notify("no design recipe in progress; start one with /tutor-plan <task id>", "info"); return; }
        const moved = advanceWorkflow(true);
        paint();
        if (moved && moved.done === undefined && ctx.hasUI) {
          sendNudge(ctx, `${TUTOR_PREFIX} the learner moved on to step ${moved.step} (${STEPS[moved.step - 1]}) of the design recipe for ${moved.task}.`);
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
      beginRecipe(ctx, id, line);
    },
  });

  function beginRecipe(ctx: ExtensionContext, id: string, line: string) {
    workflow = startWorkflow(id, Date.now());
    pi.appendEntry("tutor_workflow", workflow);
    paint();
    const kickoff = `${TUTOR_PREFIX} design recipe started for ${id}: ${line.replace(/^\s*[-*]\s*\[.\]\s*/, "").replace(id, "").trim()}. Begin step 1 (Find). (You can say "skip" to skip a step, or "/tutor-plan off" to stop.)`;
    // Only the TUI may start a turn: in print/RPC mode a fire-and-forget turn races the caller's next prompt.
    if (ctx.hasUI) sendNudge(ctx, kickoff);
    else ctx.ui.notify(`design recipe started for ${id}; send a message to begin step 1`, "info");
  }

  /** Spec 2026-10-26 §5.1: a beginner's next open task starts the recipe by itself (skip/off per task). */
  let recipeOff = new Set<string>();

  // Habits Task 7: what the detectors remember between events, and the one place events are recorded.
  const lastTry = new Map<string, TryOutcome>();      // task id → its last graded outcome
  const lastRunText = new Map<string, string>();      // file → its text at the last run
  const missedErrors = new Set<string>();             // errors a reads-errors miss was already recorded for
  const askedBefore = new Map<string, string[]>();    // task → the learner's questions on it
  const missedTest = new Map<string, string>();       // task → the own-test text whose miss is already recorded
  let pendingQuestion: string | null = null;           // the task a question was just asked about
  function recordHabit(habit: HabitId, ok: boolean | null, evidence: string) {
    if (ok === null || !project || !profile) return;
    const p = profile, e = { habit, ok, language: project.language, project: project.path, at: Date.now(), evidence };
    profileWrite(() => p.addHabitEvent(e));
  }
  let fixStepStreak = 0, tickHanded = false;
  /** Spec 2026-10-26 §4: after a task, the level moves inside its band by the habits; every move says why. */
  function settleLevel(handedNow: boolean) {
    if (!project || !profile) return;
    const p = profile, lang = project.language, band = bandFor(level());
    let events: ReturnType<Profile["habitEvents"]> = [];
    let handSolid: number | null = null;
    profileWrite(() => { events = p.habitEvents(); const h = p.setting(`level-hand:${lang}`); handSolid = h ? Number(h) : null; });
    const prog = bandProgress(events, band, lang);
    let move = levelInBand({ level: level(), band, solid: prog.solid, total: prog.total, fixStepStreak, newest: prog.newest, handedNow });
    // Final review I4: a level set by hand rises again only once more habits are solid than when it was set.
    if (move && move.level > level() && handSolid !== null && prog.solid <= handSolid) move = null;
    if (move) {
      const old = level();
      setLevel(move.level);
      pi.appendEntry("tutor_level", { level: move.level, reason: move.reason });
      profileWrite(() => p.setLevel(lang, move.level));
      ui?.notify(`level ${old} → ${move.level}: ${move.reason}`, "info");
      paint();
    }
    // Spec 2026-10-26 §6.2: all of the band's habits solid → the step-up is offered, at most once a day.
    const key = `stepup-offer:${lang}`;
    let lastOffer: number | null = null;
    profileWrite(() => { const v = p.setting(key); lastOffer = v ? Number(v) : null; });
    const now = Date.now(), b = bandFor(level());
    let wait = 0;
    profileWrite(() => { wait = Number(p.setting(`stepup-wait:${lang}`) ?? "0") || 0; });
    // Final review M9: no invitation while a retake waits or a step-up is running.
    if (wait === 0 && !stepUp && STEP_UP_LANGUAGES.has(lang) && stepUpOffered({ band: b, habitsSolidIn: (h) => solidIn(events.filter((e) => e.habit === h), lang), lastOffer, now })) {
      profileWrite(() => p.setSetting(key, String(now)));
      ui?.notify(`your ${b} habits are solid: /tutor-step-up starts the step-up (a talking test and a coding test) whenever you are ready`, "info");
    }
    if (handedNow && stepDownSuggested(fixStepStreak)) ui?.notify("the last three tasks needed the handed line: /tutor-level can move you down a band if you want", "info");
  }

  function runSized(path: string, evidence: string) {
    let text: string;
    try { text = readFileSync(path, "utf8"); } catch { return; }
    const prev = lastRunText.get(path);
    if (prev !== undefined) recordHabit("small-runs", smallRunEvent(changedLines(prev, text)), evidence);
    lastRunText.set(path, text);
  }
  /** Final review I1a: per project, the tasks whose recipe was turned off or finished (profile `recipe:<root>`). */
  function recipeMemory(): { off: string[]; done: string[]; own?: Record<string, number[]> } {
    let m: { off: string[]; done: string[]; own?: Record<string, number[]> } = { off: [], done: [] };
    if (project && profile) { const p = profile, key = `recipe:${project.path}`; profileWrite(() => { try { m = { off: [], done: [], ...JSON.parse(p.setting(key) ?? "{}") }; } catch { /* a broken record is empty */ } }); }
    return m;
  }
  function rememberRecipe(kind: "off" | "done", task: string) {
    if (!project || !profile) return;
    const p = profile, key = `recipe:${project.path}`, m = recipeMemory();
    if (!m[kind].includes(task)) m[kind].push(task);
    profileWrite(() => p.setSetting(key, JSON.stringify(m)));
  }
  /** Final review I7: the recipe steps code recognised in the learner's own text, kept per project across restarts. */
  function rememberOwnStep(task: string, step: number) {
    if (!project || !profile) return;
    const p = profile, key = `recipe:${project.path}`, m = recipeMemory();
    const own = { ...(m.own ?? {}) };
    own[task] = [...new Set([...(own[task] ?? []), step])];
    profileWrite(() => p.setSetting(key, JSON.stringify({ ...m, own })));
  }
  const ownStepsOf = (task: string) => new Set(recipeMemory().own?.[task] ?? []);

  /** The milestone a task belongs to (1 for a plan without milestone headings). */
  function milestoneOf(tasksMd: string, id: string): number {
    for (let k = 1; k <= milestoneCount(tasksMd); k++) if (findTask(milestoneText(tasksMd, k), id)) return k;
    return 1;
  }
  function autoRecipe(ctx: ExtensionContext | null) {
    if (!ctx || !project || exam) return;
    const ls = lesson as LessonState | null;
    if (ls && !ls.building) return; // a lesson round is not a task
    let tasks: string;
    try { tasks = readFileSync(join(project.path, "spec", "tasks.md"), "utf8"); } catch { return; }
    const next = openTaskIds(tasks)[0] ?? null;
    // Final review I1c: in a learn-first project, never past the milestone being built.
    if (ls && next && milestoneOf(tasks, next) > currentMilestone(tasks, ls)) return;
    // Final review I1a: tasks turned off or finished in any session (kept in the profile) never restart.
    const kept = recipeMemory();
    const id = recipeAutoStart({ band: bandFor(level()), workflow, task: next, offFor: new Set([...recipeOff, ...kept.off, ...kept.done]) });
    const line = id ? findTask(tasks, id) : null;
    if (id && line) beginRecipe(ctx, id, line);
  }

  pi.registerCommand("tutor-exam", {
    description: describeCmd("/tutor-exam"),
    handler: (args, ctx) => exclusive(ctx, async () => {
      const a = parseExamArgs(args);
      if (a.kind === "usage") { ctx.ui.notify("usage: /tutor-exam [small|medium] [topic] | check | off | sandbox [on|off] (for a topic that starts with \"sandbox\": /tutor-exam small sandbox …)", "warning"); return; }
      if (a.kind === "sandbox") {
        if (a.mode === null) {
          if (examSandbox === "off") { ctx.ui.notify("exam sandbox: off — exam tests run as you, with your files and network", "info"); return; }
          const ok = (await pi.exec(BWRAP_PROBE[0], BWRAP_PROBE[1], { cwd: project?.path ?? process.cwd(), timeout: 10_000 })).code === 0;
          ctx.ui.notify(ok ? "exam sandbox: on (bubblewrap ready)" : `exam sandbox: on, but ${SANDBOX_MISSING}`, ok ? "info" : "warning");
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
        ctx.ui.notify(r.killed ? "examples timed out after 120 s: a loop that never ends?" : r.code === 0 ? "all examples pass; :TutorSubmit when you are ready" : `examples fail (exit ${r.code}): the output is below`, r.code === 0 ? "info" : "warning");
        // Phase 8 D (M8 minor): the last 30 lines, as grade.md shows them; the toast held 6 (only the summary).
        if (r.code !== 0 && !r.killed) {
          const out = r.out.split("\n").slice(-30).join("\n");
          const fence = "`".repeat(Math.max(3, ...[...out.matchAll(/`+/g)].map((m) => m[0].length + 1)));
          pi.sendMessage({ customType: "tutor_exam_check", content: `${fence}\n${out}\n${fence}`, display: true }, { triggerTurn: false });
        }
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
        let tests: string | undefined, brief: string | undefined;
        try { tests = readFileSync(join(proj.path, made.dir, lay.tests), "utf8"); } catch { tests = undefined; }
        try { brief = readFileSync(join(proj.path, made.dir, "brief.md"), "utf8"); } catch { brief = undefined; }
        exam = { id: made.id, dir: made.dir, language: lang, topic: a.topic, size: a.size, started: Date.now(), limit: LIMIT_MIN[a.size], concepts: made.spec.concepts, ids: made.spec.requirements.map((r) => r.id), ...(tests !== undefined ? { tests } : {}), ...(brief !== undefined ? { brief } : {}) };
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
    description: describeCmd("/tutor-submit"),
    handler: (_args, ctx) => exclusive(ctx, async () => {
      if (!exam || !project || !profile) { ctx.ui.notify("no exam is running; start one with /tutor-exam", "info"); return; }
      if (!ctx.model) { ctx.ui.notify("no model selected; pick one with /model first", "error"); return; }
      const e = exam, proj = project, p = profile, dir = join(proj.path, e.dir);
      let brief: string;
      try { brief = e.brief ?? readFileSync(join(dir, "brief.md"), "utf8"); } catch { ctx.ui.notify(`${e.dir}/brief.md is missing; /tutor-exam off and start a new exam`, "error"); return; }
      // Phase 8 D: the ids the exam was written with; an exam saved before then reads them from the brief.
      const ids = e.ids?.length ? e.ids : briefIds(brief);
      if (!ids.length) { ctx.ui.notify(`${e.dir}/brief.md lists no requirements (- **R1** …), so the exam cannot be graded; /tutor-exam off and start a new one`, "error"); return; }
      ctx.ui.notify("running the example tests…", "info");
      // M8 minor M3: tests the learner edited never grade. In the sandbox the tests as written are laid over the
      // throwaway copy; without it the grade says it ran the edited ones.
      const testsFile = layout(e.language)?.tests;
      let nowTests: string | undefined;
      try { nowTests = testsFile ? readFileSync(join(dir, testsFile), "utf8") : undefined; } catch { nowTests = undefined; }
      const edited = testsFile !== undefined && e.tests !== undefined && nowTests !== e.tests;
      const host = sandboxHost();
      const runTest = await runExamTests((c, a, o) => pi.exec(c, a, o), e.language, dir, { sandbox: host, ...(edited && host ? { overlay: { [testsFile!]: e.tests! } } : {}) });
      const editNote = !edited ? "" : host ? `${testsFile} was changed after the exam began; these results come from the tests as written.`
        : `${testsFile} was changed after the exam began and the sandbox is off, so these results come from the changed tests.`;
      // At the end: grade.md shows the last 30 lines of the output.
      const test = editNote ? { ...runTest, out: `${runTest.out}\n\n${editNote}` } : runTest;
      if (test.missing) { ctx.ui.notify(`${test.missing} The exam stays open.`, "warning"); return; }
      let files: ReturnType<typeof learnerFiles>;
      try { files = learnerFiles(dir, e.language, proj.path); } catch (err) { ctx.ui.notify(`${err instanceof Error ? err.message : String(err)}; the exam stays open`, "error"); return; }
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
    description: describeCmd("/tutor-progress"),
    handler: async (args, ctx) => {
      if (!profile) { ctx.ui.notify("tutor profile unavailable; see the earlier warning", "error"); return; }
      const arg = args.trim().toLowerCase();
      if (arg && !/^[a-z][a-z0-9+#.-]{0,30}$/.test(arg)) { ctx.ui.notify("usage: /tutor-progress [language]", "warning"); return; }
      const p = profile;
      const editorLang = editorLanguage();
      let body = "";
      profileWrite(() => {
        const langs = arg ? [arg] : project ? [project.language] : editorLang ? [editorLang] : p.languages();
        body = langs.map((l) => {
          const lvl = p.language(l)?.level ?? null;
          const base = progressReport({ language: l, level: lvl, episodes: p.episodes(l), exams: p.exams(l), concepts: p.concepts(l), vocab: vocabOf(loadPack(l), loadPack("editor")) });
          // Spec 2026-10-26 §6.1: the band's habits, their state and the latest evidence.
          // Phase 8 B7: a language with no level yet still shows where its habits stand, against the beginner band.
          if (lvl === null) return `${base}\n\n${habitReport(p.habitEvents(), "beginner", l)}\n(no level for ${l} yet: the beginner habits)`;
          const events = p.habitEvents(), band = bandFor(lvl);
          const missing = missingForStepUp(band, (h) => solidIn(events.filter((e) => e.habit === h), l));
          const up = band === "pro" ? "" : missing.length ? `\nstep-up: when ${missing.map((h) => HABIT_LABEL[h]).join(", ")} turn solid` : "\nstep-up: ready (/tutor-step-up)";
          const passedRaw = p.setting(`stepup-passed:${l}`);
          let passedLine = "";
          try { if (passedRaw) { const ps = JSON.parse(passedRaw) as { band: string; at: number }; passedLine = `\npassed the ${ps.band} step-up on ${new Date(ps.at).toISOString().slice(0, 10)}`; } } catch { /* an old record */ }
          return `${base}\n\n${habitReport(events, band, l)}${up}${passedLine}`;
        }).join("\n\n");
      });
      pi.sendMessage({ customType: "tutor_progress", content: body || "no progress yet: /tutor-start begins a project", display: true }, { triggerTurn: false });
    },
  });

  pi.registerCommand("tutor-memory", {
    description: describeCmd("/tutor-memory"),
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
    description: describeCmd("/tutor-thinking"),
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
    description: describeCmd("/tutor-feedback"),
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
   * Habits Task 17 ("improve it", spec 2026-10-26 §8): working code made better, measured before → after. The
   * model writes edge-case checks and one timed large-input check, kept only when the hidden reference passes
   * them; the task's own checks must still pass. Better on something and worse on nothing is the optimizes habit.
   * `beforeSource`: the entry's text (saved before Phase 8) or every Python file of the project (Phase 8 A10).
   */
  interface ImproveState { task: string; checks: Check[]; extra: Check[]; functions: string[]; before: Measured; beforeSource?: string | Record<string, string> }
  const improveKey = (root: string) => `improve:${root}`;
  async function measure(root: string, entry: string, st: { checks: Check[]; extra: Check[]; functions: string[] }, baseline?: string | Record<string, string>, asOf?: string | Record<string, string>) {
    const files = (t: string | Record<string, string>) => (typeof t === "string" ? { [entry]: t } : t);
    const host = sandboxHost()!, exec = (c: string, a: string[], o: { cwd: string; timeout: number }) => pi.exec(c, a, o);
    // Phase 5 live run: `asOf` measures that exact text (laid over in the throwaway copy), so an edit made while
    // /tutor-improve is still working never mixes into the before.
    const asOver = asOf !== undefined ? files(asOf) : undefined;
    const r = await runChecks(exec, { language: "python", root, entry, runCmd: projectRun(root, "python").runCmd, checks: [...st.checks, ...st.extra], sandbox: host, overlay: asOver });
    const own = r.results.slice(0, st.checks.length), extra = r.results.slice(st.checks.length);
    const metrics = await codeMetrics(exec, { root, entry, sandbox: host, functions: st.functions, overlay: asOver });
    const timed = extra.find((x) => x.check.kind === "timed");
    let ms = timed?.ms ?? null, baseMs: number | null = null;
    // Load flake: the first timing ran at another moment, under other load; the code as it was before is timed
    // again right next to the code as it is now, twice each in turn, and the faster of each counts.
    if (baseline !== undefined && timed && ms !== null) {
      const once = async (overlay?: Record<string, string>) =>
        (await runChecks(exec, { language: "python", root, entry, runCmd: null, checks: [{ ...timed.check, limitMs: undefined }], sandbox: host, overlay })).results[0]?.ms ?? null;
      const runs: { base: number[]; now: number[] } = { base: [], now: [ms] };
      for (let k = 0; k < 2; k++) {
        const b = await once(files(baseline)); if (b !== null) runs.base.push(b);
        if (k === 0) { const n = await once(); if (n !== null) runs.now.push(n); }
      }
      ms = Math.min(...runs.now);
      baseMs = runs.base.length ? Math.min(...runs.base) : null;
    }
    const m: Measured | null = metrics && { ...metrics, edgePassed: extra.filter((x) => x.check.kind === "value" && x.pass).length, ms };
    // Option C review I2: a large input answered wrongly (or not at all) is a failed check, not a skipped timing;
    // a run that is only slower than its limit still has its time and is judged on speed.
    const wrongTimed = extra.find((x) => x.check.kind === "timed" && !x.pass && x.ms === undefined);
    return { m, baseMs, failed: own.find((x) => !x.pass) ?? wrongTimed, missing: r.missing };
  }
  pi.registerCommand("tutor-improve", {
    description: describeCmd("/tutor-improve"),
    handler: (args, ctx) => exclusive(ctx, async () => {
      if (!project || !profile) { ctx.ui.notify("/tutor-improve works inside a project: /tutor-start makes one", "warning"); return; }
      const proj = project, p = profile, root = proj.path, arg = args.trim();
      let st: ImproveState | null = null;
      profileWrite(() => { try { st = JSON.parse(p.setting(improveKey(root)) ?? "null"); } catch { st = null; } });
      const running = st as ImproveState | null;
      const preparing = improvePreparing.get(root)?.split("#")[0];
      if (arg === "off") {
        profileWrite(() => p.setSetting(improveKey(root), ""));
        improvePreparing.delete(root);
        const task = running?.task ?? preparing;
        ctx.ui.notify(task ? `the improve-it task for ${task} dropped` : "no improve-it task is running", "info");
        return;
      }
      if (preparing) { ctx.ui.notify(`the improve-it checks for ${preparing} are still being written; you can keep working, or /tutor-improve off`, "info"); return; }
      if (proj.language !== "python") { ctx.ui.notify("improve-it measures Python code for now", "info"); return; }
      if (exam && arg !== "done") { ctx.ui.notify("improve-it waits until the exam is over (/tutor-submit)", "info"); return; }
      if (running && arg !== "done") { ctx.ui.notify(`an improve-it task for ${running.task} is running: /tutor-improve done, or /tutor-improve off first`, "info"); return; }
      if (!sandboxHost()) { ctx.ui.notify("improve-it runs your code in the sandbox, and it is off (/tutor-exam sandbox on)", "info"); return; }
      const { entry } = projectRun(root, proj.language);
      if (!entry) { ctx.ui.notify("no entry file: name it in README.md's `run:` command", "warning"); return; }
      if (arg === "done") {
        if (!running) { ctx.ui.notify("no improve-it task is running: /tutor-improve <ticked task id> starts one", "info"); return; }
        const after = await measure(root, entry, running, running.beforeSource);
        if (after.missing) { ctx.ui.notify(after.missing, "warning"); return; }
        const f = after.failed;
        if (f) {
          const what = f.check.kind === "value" ? `${f.check.expr} ${f.error ? `failed: ${f.error}` : gaveExpected(f.got ?? "", f.check.expected ?? "")}` : f.error ?? "a check failed";
          ctx.ui.notify(`${running.task} not yet: the task's checks must still pass: ${what}`, "warning");
          return;
        }
        if (!after.m) { ctx.ui.notify("your file does not parse, so it could not be measured", "warning"); return; }
        const { better, worse } = improveResult({ ...running.before, ms: after.baseMs ?? running.before.ms }, after.m);
        // Final review I3: a success counts once per task and project; making it worse and undoing it again earns nothing.
        const evidence = `improve:${root}:${running.task}`;
        let counted = false;
        profileWrite(() => { counted = p.habitEvents().some((e) => e.habit === "optimizes" && e.ok && e.evidence === evidence); });
        const good = better.length > 0 && worse.length === 0;
        if ((better.length || worse.length) && !(good && counted)) recordHabit("optimizes", good, evidence);
        if (good) {
          profileWrite(() => p.setSetting(improveKey(root), ""));
          ctx.ui.notify(`${running.task} improved: ${better.join(" · ")}${counted ? ` (optimizes counts once per task; ${running.task} already counted)` : ""}`, "info");
          return;
        }
        ctx.ui.notify(`${running.task} is not better yet: ${worse.length ? `worse: ${worse.join(" · ")}` : "nothing measured changed"}${better.length ? `; better: ${better.join(" · ")}` : ""}`, "info");
        return;
      }
      const id = arg;
      if (!/^P\d+\.T\d+$/.test(id)) { ctx.ui.notify("usage: /tutor-improve <ticked task id like P1.T2>|done|off", "info"); return; }
      let tasksMd = "";
      try { tasksMd = readFileSync(join(root, "spec", "tasks.md"), "utf8"); } catch { /* none */ }
      if (!tickedIds(tasksMd).has(id)) { ctx.ui.notify(`${id} is not a ticked task: improve-it starts from working code`, "info"); return; }
      let cs: ChecksState = { milestones: {} };
      profileWrite(() => { cs = readChecksState(p.setting(`checks:${root}`)); });
      const all = Object.values(cs.milestones).flatMap((m) => m.checks);
      const checks = liveChecks(all, currentMilestone(tasksMd, lesson)).filter((c) => c.status === "trusted" && c.kind !== "timed" && (c.task === id || c.task.startsWith(`${id}.`)));
      const ms = Object.entries(cs.milestones).find(([, m]) => m.checks.some((c) => c.task === id));
      const reference = ms?.[1].reference ?? "";
      if (!checks.length || !reference) { ctx.ui.notify(`${id} has no trusted checks to keep it working, so it cannot be improved here`, "info"); return; }
      const beforeSource = pythonSources(root);
      if (beforeSource[entry] === undefined) { ctx.ui.notify(`cannot read ${entry}`, "warning"); return; }
      const line = tasksMd.split("\n").find((l) => l.includes(` ${id} `)) ?? id;
      // Phase 8 B2: the model writes the checks in the background, outside the command lock, so /tutor-done and the
      // other commands keep working meanwhile (it can take up to 30 min); /tutor-improve off drops it.
      ctx.ui.notify(`writing edge-case and timing checks for ${id} in the background…`, "info");
      const frozen = { model: ctx.model, modelRegistry: ctx.modelRegistry } as ExtensionContext, mine = generation;
      const say = (text: string, level: "info" | "warning") => { if (generation === mine) ui?.notify(text, level); };
      const job = `${id}#${Date.now()}#${Math.random()}`; // Phase 8 review M3: this job, not just its task
      improvePreparing.set(root, job);
      void (async () => {
        try {
          const text = await rawComplete(frozen, jobSignal())(systemText("improve"),
            improvePrompt({ taskLine: line, checks: checks.map((c) => c.kind === "value" ? `check ${c.task}: ${c.expr} == ${c.expected}` : `run ${c.task}: stdin ${JSON.stringify(c.stdin)} -> stdout contains ${JSON.stringify(c.contains)}`) }));
          const parsed = parseChecks(text, { language: "python", taskIds: [id], milestone: checks[0].milestone }).checks.filter((c) => c.kind !== "io");
          const extra = (await crossCheckOnReference({ exec: (c, a, o) => pi.exec(c, a, o), sandbox: sandboxHost(), language: "python", entry, runCmd: null, reference, checks: parsed, root }))
            .filter((c) => c.status === "trusted");
          const functions = calledFunctions(checks.flatMap((c) => (c.expr ? [c.expr] : [])));
          const before = await measure(root, entry, { checks, extra, functions }, undefined, beforeSource);
          if (improvePreparing.get(root) !== job) return; // dropped with /tutor-improve off (or started again)
          if (before.missing || !before.m) { say(before.missing ?? "your file does not parse, so it could not be measured", "warning"); return; }
          if (before.failed) { say(`${id}'s checks fail now; make it work again before improving it`, "warning"); return; }
          const next: ImproveState = { task: id, checks, extra, functions, before: before.m, beforeSource };
          withProfile((pr) => pr.setSetting(improveKey(root), JSON.stringify(next)));
          const timed = extra.find((c) => c.kind === "timed")?.expr ?? null;
          say(`improve ${id}: make the working code better — faster, simpler, or right on more edge cases. `
            + `measured now: ${measuredLine(before.m, extra.filter((c) => c.kind === "value").length, timed)}. `
            + "The task's checks must still pass. /tutor-improve done measures it again; /tutor-improve off drops it.", "info");
        } catch (e) {
          say(`the improve-it checks for ${id} could not be written: ${e instanceof Error ? e.message : String(e)}; /tutor-improve ${id} tries again`, "warning");
        } finally {
          if (improvePreparing.get(root) === job) improvePreparing.delete(root);
        }
      })();
    }),
  });

  /** Task 16: the pro notes on design and naming (no points) are on by default; `/tutor-notes off` stops them. */
  // Ask-first spec 2026-11-09: stuck offers off for a while, or until turned on; kept in the profile across restarts.
  const QUIET_PICK: [string, string][] = [["1 minute", "1m"], ["5 minutes", "5m"], ["10 minutes", "10m"], ["1 hour", "1h"],
    ["until I turn them on", "off"], ["turn them back on", "on"]];
  pi.registerCommand("tutor-quiet", {
    description: describeCmd("/tutor-quiet"),
    handler: async (args, ctx) => {
      let arg = args.trim().toLowerCase();
      if (!arg) {
        const pick = await ctx.ui.select("Stuck notices", QUIET_PICK.map(([l]) => l));
        arg = QUIET_PICK.find(([l]) => l === pick)?.[1] ?? "";
        if (!arg) return;
      }
      const q = parseQuiet(arg, Date.now());
      if (q === null) { ctx.ui.notify(`usage: /tutor-quiet ${QUIET_CHOICES.join(" | ")} (off = until /tutor-quiet on)`, "warning"); return; }
      quietRaw = q === "on" ? undefined : JSON.stringify(q);
      if (profile) { const p = profile; profileWrite(() => p.setSetting(QUIET_KEY, quietRaw ?? "")); }
      const label = QUIET_PICK.find(([, v]) => v === arg)?.[0];
      ctx.ui.notify(q === "on" ? "notices on" : "always" in q ? "notices off until /tutor-quiet on" : `notices off for ${label?.replace(/^(\d+) minutes?$/, "$1 min")}`, "info");
      paint();
    },
  });

  pi.registerCommand("tutor-notes", {
    description: describeCmd("/tutor-notes"),
    handler: async (args, ctx) => {
      const want = args.trim();
      if (want !== "on" && want !== "off") { ctx.ui.notify(`usage: /tutor-notes on|off (now ${profile?.setting("pro-notes") === "off" ? "off" : "on"})`, "info"); return; }
      if (profile) { const p = profile; profileWrite(() => p.setSetting("pro-notes", want)); }
      ctx.ui.notify(want === "off" ? "no design and naming notes after a pro tick" : "design and naming notes after a pro tick, with no points", "info");
    },
  });

  /**
   * Spec 2026-10-21 §7: `/tutor-done [task] [anyway]` ticks a task from evidence. Its trusted checks run in the
   * sandbox: all pass → ticked; one fails → a graded try on that check's spot. Unverified checks never block;
   * no checks or no sandbox → ticked as self-checked; `anyway` → ticked by you. The model never ticks.
   */
  pi.registerCommand("tutor-done", {
    description: describeCmd("/tutor-done"),
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
      const unsaved = await tasksUnsaved(path);
      if (unsaved) { ctx.ui.notify(unsaved === "unknown" ? TASKS_UNKNOWN : "spec/tasks.md has unsaved edits in Neovim; save it, then /tutor-done again", "warning"); return; }
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
      // Habits: did this try get closer than the last one, did a question help, how much changed since the last run.
      const trusted = r.results.filter((x) => x.check.status === "trusted");
      // Final review I1: a run that is no try (a syntax error, a check that does not fit, an error elsewhere) moves no habit.
      const noTry = trusted.some((x) => !x.pass && (!!x.outcome || (!!x.error && isSyntaxError(x.error.replace(/^your file stopped while loading: /, "")))));
      if (!noTry) {
        const key = trusted.map((x) => `${x.check.kind}:${x.check.expr ?? x.check.stdin}`).sort().join("|");
        const outcome: TryOutcome = { passed: trusted.filter((x) => x.pass).length, total: trusted.length, crashed: trusted.some((x) => !x.pass && !!x.error), key };
        const prev = lastTry.get(id);
        const closer = prev ? directionEvent(prev, outcome) : null;
        recordHabit("right-direction", closer, `check:${id}`);
        // Final review M3: a question is judged only against a comparable earlier try; otherwise it waits.
        if (pendingQuestion === id && closer !== null) { recordHabit("right-question", questionEvent({ closer }, false), `question:${id}`); pendingQuestion = null; }
        lastTry.set(id, outcome);
        if (entry) runSized(join(root, entry), `check:${id}`);
      }
      const failed = r.results.filter((x) => !x.pass && x.check.status === "trusted");
      const shaky = r.results.filter((x) => !x.pass && x.check.status === "unverified");
      if (failed.length === 0) {
        const extra = shaky.length ? `; ${shaky.length} unverified check(s) failed and do not block: ${shaky.map((x) => x.check.expr ?? JSON.stringify(x.check.stdin)).join(", ")}` : "";
        // Only a trusted check proves it; unverified ones alone make it self-checked (final review I5).
        if (!r.results.some((x) => x.pass && x.check.status === "trusted")) return tick("self", `ticked on trust: I could not build a check that works for ${id}${extra}`);
        const passed = `${r.results.length - shaky.length} check(s) passed${extra}`;
        // Task 16: at pro a tick from checks shows the pro score, built only from facts code checked here.
        // Final review M3: `judged` false when the own tests could not run, so a sandbox failure never suggests a level.
        const scored = async (why: string, own: string[], ownPass: boolean, catches: boolean, judged = own.length > 0) => {
          if (bandFor(level()) !== "pro") return tick("checks", why);
          const named = doneWhenCalls(tasksMd, id);
          const cases = named.length ? named : [...new Set(trusted.flatMap((x) => (x.check.kind === "value" && x.check.expr ? [x.check.expr] : [])))];
          const facts: ProFacts = { checksPass: true, ownTestsPass: ownPass, ownTestsCanFail: catches, edgeCasesTotal: cases.length,
            edgeCasesCovered: ownPass ? coveredCalls(cases, ownTestBodies(root, proj.language, own)) : 0 };
          await tick("checks", `${why}; ${scoreLine(facts)}`);
          afterProTick(ctx, id, proScore(facts), judged);
        };
        // Spec 2026-10-26 §7 (both must pass): from intermediate on, the learner's own test for the task adds proof.
        const own = bandFor(level()) === "beginner" ? [] : findOwnTests(root, proj.language, id);
        // Phase 4 live run: a weak model may never say how to name the test; code points it out.
        if (!own.length) return scored(bandFor(level()) !== "beginner" && hasTests(root, proj.language)
          ? `${passed}; no test of yours is named for ${id} (${ownTestName(proj.language, id)}), so none was run`
          : passed, [], false, false);
        const host = sandboxHost()!;
        const ran = await runOwnTests((c, a, o) => pi.exec(c, a, o), { root, language: proj.language, tests: own, sandbox: host, entry });
        if (ran.missing) return scored(`${passed}; your test could not run: the sandbox cannot start`, own, false, false, false);
        if (!ran.pass) {
          // Final review I3: the failing test's own name keeps one spot for its tries.
          const name = ran.failed ?? own[0].split("::")[1].split(".").at(-1)!;
          const line = `your test ${name} fails: ${ran.out.startsWith(`${name}: `) ? ran.out.slice(name.length + 2) : ran.out}`;
          ui?.notify(`${id} not yet: ${line}`, "warning");
          failedRun({ kind: "run", cmd: ["/tutor-done", id], code: 1, trace: line }, true, `test:${id}:${name}`);
          paint();
          return;
        }
        const able = await canFail((c, a, o) => pi.exec(c, a, o), { root, language: proj.language, tests: own, entry, sandbox: host });
        // Final review I1: with nothing in the code that a broken copy could try it on, the checks prove the task.
        if (able === "untestable") return scored(`${passed}; your test passes; no broken version of the code it calls could be made to try it on`, own, true, false);
        // Phase 8 C: the same test that cannot fail, run again, is no new evidence; a changed test is.
        const bodies = ownTestBodies(root, proj.language, own).join("\n");
        if (able === "caught" || missedTest.get(id) !== bodies) recordHabit("tests-that-fail", able === "caught", `test:${id}`);
        if (able === "missed") missedTest.set(id, bodies); else missedTest.delete(id);
        if (able === "missed") { ui?.notify(`${id} not yet: your test passes even on a broken version of your code, so it cannot catch a bug; make it check what ${id} should give`, "warning"); return; }
        return scored(`${passed}; your test ${own.map((t) => t.split("::")[1]).join(", ")} passes and catches a broken version`, own, true, true);
      }
      // Habits Task 22: checks.md shows the checks that just ran (it was only written on a tick).
      writeChecksMd(root, state, current);
      failedCheck(id, failed[0]);
    }),
  });

  /** Short decimals, unless the short forms would look equal for a value that failed (final review M5). */
  const gaveExpected = (got: string, want: string) => {
    const g = shortNumber(got), w = shortNumber(want);
    return g === w ? `gave ${got}, expected ${want}` : `gave ${g}, expected ${w}`;
  };

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
    const line = c.kind === "timed" ? `check ${id}: ${c.expr} ${f.error ?? "was too slow"}`
      : c.kind === "value"
      ? `check ${id}: ${c.expr} ${f.error ? `failed: ${f.error}` : gaveExpected(f.got ?? "", c.expected ?? "")}`
      : `check ${id}: typing ${JSON.stringify(c.stdin)} should print ${JSON.stringify(c.contains)}${f.error ? `; it failed: ${f.error}` : ""}; it printed: ${f.got ?? ""}`;
    ui?.notify(`${id} not yet: ${line.replace(/^check \S+: /, "")}`, "warning");
    failedRun({ kind: "run", cmd: ["/tutor-done", id], code: 1, trace: line }, true, `check:${id}:${c.expr ?? c.stdin}`);
    paint();
  }

  const BUILTINS = new Set(["print", "input", "len", "range", "round", "max", "min", "sum", "abs", "sorted", "int", "float", "str", "list", "dict", "set", "tuple", "map", "filter", "zip", "enumerate", "open", "isinstance", "type", "any", "all"]);
  /** Habits Task 17: the task's lines name three or more functions, or it is multi-part and its code imports a module new to this language. */
  function complexTask(root: string, md: string, id: string): boolean {
    const lines = md.split("\n").filter((l) => new RegExp(`\\b${id.replace(".", "\\.")}(\\.S\\d+)?\\b`).test(l)).join("\n");
    // Final review M4: built-ins in backticks (`round(x)`, `len(…)`) are not the task's functions.
    const named = new Set([...lines.matchAll(/`([A-Za-z_]\w*)\s*\(/g)].map((m) => m[1]).filter((n) => !BUILTINS.has(n)));
    let fresh = false;
    if (profile && project) {
      const p = profile, key = `modules:${project.language}`, { entry } = projectRun(root, project.language);
      let src = "";
      try { if (entry) src = readFileSync(join(root, entry), "utf8"); } catch { /* none */ }
      const now = importedModules([src], project.language);
      profileWrite(() => {
        const seen = p.setting(key);
        let known = new Set<string>();
        try { known = new Set<string>(seen ? JSON.parse(seen) : []); } catch { known = new Set(); }
        fresh = seen !== null && [...now].some((m) => !known.has(m));
        p.setSetting(key, JSON.stringify([...new Set([...known, ...now])]));
      });
    }
    // Side-agent note: a module new to the learner counts only in a multi-part task (two or more functions named,
    // or subtasks); otherwise the first one-liner with `math`, then `random`, … would each count as complex.
    const parts = named.size >= 2 || new RegExp(`\\b${id.replace(".", "\\.")}\\.S\\d+\\b`).test(md);
    return named.size >= 3 || (fresh && parts);
  }

  const TASKS_UNKNOWN = "Neovim did not answer whether spec/tasks.md has unsaved edits, so nothing was ticked; save it, then /tutor-done again";
  /**
   * Phase 8 D (M8 minor): whether spec/tasks.md has unsaved edits in Neovim; asked twice, then "unknown" — a busy
   * editor no longer gets a tick written over edits it could not report.
   */
  async function tasksUnsaved(path: string): Promise<boolean | "unknown"> {
    if (!link) return false;
    for (let k = 0; k < 2; k++) { try { return await link.isModified(path); } catch { /* busy: ask once more */ } }
    return "unknown";
  }
  /** Tick `id` and its open subtasks in spec/tasks.md, record how, refresh spec/checks.md, close its check episode. */
  async function tickDone(root: string, id: string, how: TickHow, why: string) {
    const path = join(root, "spec", "tasks.md");
    let md: string;
    try { md = readFileSync(path, "utf8"); } catch { return; }
    const r = tickTasks(md, [id, ...taskIds(md).filter((x) => x.startsWith(`${id}.S`))]);
    if (!r.ticked.length) return;
    // Pane check #1: the checks took seconds; edits made meanwhile and not saved must not meet a rewritten file.
    const unsaved = await tasksUnsaved(path);
    if (unsaved) { ui?.notify(unsaved === "unknown" ? TASKS_UNKNOWN : `spec/tasks.md has unsaved edits in Neovim; save it, then /tutor-done ${id} again`, "warning"); return; }
    try { writeInRoot(root, "spec/tasks.md", r.text); } catch (e) { ui?.notify(`tutor: could not tick ${id}: ${e instanceof Error ? e.message : String(e)}`, "warning"); return; }
    pi.appendEntry("tutor_tick", { ids: [id], how });
    let state: ChecksState = { milestones: {} };
    const key = `checks:${root}`;
    if (profile) { const p = profile; profileWrite(() => { state = readChecksState(p.setting(key)); state.ticks = { ...state.ticks, [id]: how }; p.setSetting(key, JSON.stringify(state)); }); }
    writeChecksMd(root, state, currentMilestone(r.text, lesson));
    // Only passing checks solve it; a self-checked or `anyway` tick gives the episode up (final review I2).
    const onTask = (spot?: string | null) => !!spot && (spot.startsWith(`check:${id}:`) || spot.startsWith(`test:${id}:`));
    // Phase 8 A13: during an exam the tutor never reaches the fix step, so nothing was handed.
    const handed = how === "checks" && onTask(episode?.spot) ? stepFor(episode, { exam: exam !== null }) === "fix" : null;
    if (handed !== null && episode) recordHabit("own-fixes", ownFixEvent(handed ? "fix-step" : "checks"), episode.id);
    if (how === "checks") fixStepStreak = handed ? fixStepStreak + 1 : 0;
    // Final review I8: without a check run there is nothing to say about the idea.
    if (how === "checks") recordHabit("ideas-to-code", ideasToCodeEvent(ownStepsOf(id).has(4), true), `tick:${id}`);
    // Habits Task 17: a complex task (three or more functions named, or a module never used in an earlier tick)
    // solved from checks counts toward "figures out complex problems" — unless the tutor handed the fix.
    if (how === "checks" && complexTask(root, md, id)) recordHabit("complex", handed !== true, `tick:${id}`);
    tickHanded = handed === true;
    if (onTask(episode?.spot)) closeEp(how === "checks" ? "run_passed" : "superseded");
    for (const k of [...spotMemory.keys()]) if (onTask(k)) spotMemory.delete(k);
    ui?.notify(`ticked ${id} (${why})`, "info");
    // Phase 8 A7: only a task its checks solved counts toward a retake; `anyway` and self-checked ticks do not.
    if (how === "checks" && profile && project) { const p = profile, key = `stepup-wait:${project.language}`; profileWrite(() => { const w = Number(p.setting(key) ?? "0") || 0; if (w > 0) p.setSetting(key, String(w - 1)); }); }
    settleLevel(tickHanded);
    if (workflow?.task === id) { pi.appendEntry("tutor_workflow", { ...workflow, done: Date.now() }); workflow = null; }
    autoRecipe(session);
    try { await link?.reloadFile(path); } catch { /* the file is written; the buffer reloads on focus */ }
    paint();
  }

  /** Spec 2026-10-26 §6.3: the step-up in progress, kept per project (`stepup:<root>`). */
  interface StepUpState {
    stage: "preparing" | "talk" | "plan" | "plan-reask" | "coding" | "coding-ready";
    language: string; band: string; talkTask: string; solveTask: string; fixTask?: string; module: string | null;
    talkRef: string; talkChecks: Check[]; plan?: { steps: string[]; pieces: string[] } | null; talk?: { matched: number; total: number }; started: number;
    solveChecks?: Check[]; fixChecks?: Check[]; fixMissing?: boolean;
    /** Hidden solutions, kept in the profile like a milestone's reference, never in the project. */
    solveRef?: string; fixRef?: string;
    /** Habits Task 17, the intermediate step-up: an improve-it part (clumsy working code, measured) and a tests part. */
    improveTask?: string; improveChecks?: Check[]; improveExtra?: Check[]; improveFunctions?: string[]; improveBefore?: Measured; improveMissing?: boolean; improveRef?: string; improveSource?: string;
  }
  let stepUpModel: ExtensionContext | null = null;
  const NEXT_BAND: Record<string, { level: number; name: string }> = { beginner: { level: 34, name: "intermediate" }, intermediate: { level: 67, name: "pro" } };
  const trustedOnly = (cs: Check[] = []) => cs.filter((c) => c.status === "trusted");

  /** Spec §6.3 part 2: the coding test's three parts, written into stepup/ with their checks and hidden solutions. */
  let codingPreparing = false;
  /**
   * Final review I1: a part's manifest is the project's own (its `go` line, its Rust edition and dependencies),
   * renamed, since the hidden solution and its checks were confirmed with the project's manifest.
   */
  function partManifest(language: string, part: string): { rel: string; text: string } | null {
    const fresh = manifestFor(language, part);
    if (!fresh || !project) return fresh;
    let text: string;
    try { text = readFileSync(join(project.path, fresh.rel), "utf8"); } catch { return fresh; }
    if (language === "go") return /^module\s+\S+/m.test(text) ? { rel: fresh.rel, text: text.replace(/^module\s+\S+/m, () => `module ${part}`) } : fresh;
    if (!/^\s*name\s*=\s*"[^"]*"/m.test(text)) return fresh;
    const renamed = text.replace(/^(\s*name\s*=\s*)"[^"]*"/m, (_m, a: string) => `${a}"${part}"`);
    return { rel: fresh.rel, text: /^\[workspace\]/m.test(renamed) ? renamed : `${renamed.trimEnd()}\n\n[workspace]\n` };
  }

  /**
   * Habits Task 24b: where a step-up part lives. Python and Lua: one file each in stepup/. Rust and Go: a folder
   * each (its own crate or module, with its entry), so the compiled harness builds and checks one part at a time.
   */
  function stepUpPart(language: string, part: string, ext: string): { dir: string; entry: string; path: string; manifest: { rel: string; text: string } | null; stub: (task: string) => string } {
    if (language === "rust" || language === "go") {
      const entry = language === "rust" ? "src/main.rs" : "main.go", dir = `stepup/${part}`;
      const stub = (task: string) => (language === "rust" ? `// ${task}\n\nfn main() {}\n` : `package main\n\n// ${task}\n\nfunc main() {}\n`);
      return { dir, entry, path: `${dir}/${entry}`, manifest: partManifest(language, part), stub };
    }
    const c = commentPrefix(`x${ext}`);
    return { dir: "stepup", entry: `${part}${ext}`, path: `stepup/${part}${ext}`, manifest: null, stub: (task) => `${c} ${task}\n` };
  }

  async function prepareCoding() {
    const s = stepUp, frozen = stepUpModel;
    if (!s || !project || !frozen || codingPreparing) return;
    codingPreparing = true;
    const root = project.path, lang = s.language, projectEntry = projectRun(root, lang).entry ?? "src/main.py", ext = extname(projectEntry) || ".py";
    // Habits Task 24b: a compiled part's reference builds as that part's own entry.
    const entry = lang === "rust" || lang === "go" ? stepUpPart(lang, "solve", ext).entry : projectEntry;
    const exec = (c: string, a: string[], o: { cwd: string; timeout: number }) => pi.exec(c, a, o);
    try {
      const complete = rawComplete(frozen, AbortSignal.timeout(SPEC_JOB_TIMEOUT_MS));
      const one = (task: string) => writeMilestoneChecks({ complete, exec, sandbox: sandboxHost(), language: lang, tasksMd: `## Milestone 1: step-up\n- [ ] P1.T1 ${task}\n`, milestone: 1, entry, runCmd: null, root, retry: false });
      // Phase 7 live run (Rust, nemotron): checks the hidden solution never confirms (a HashMap printed in random
      // order) aborted the whole step-up. A part with none confirmed is asked for once more.
      const sure = async (task: string) => { const r = await one(task); return trustedOnly(r.checks).length ? r : one(task); };
      const solve = await sure(s.solveTask);
      const fix = await sure(s.fixTask ?? s.solveTask);
      const fixTrusted = trustedOnly(fix.checks);
      // Final review I5: nothing confirmed (no sandbox, or every check unverified) is a setup problem, not the learner's.
      const unsure = [...(trustedOnly(solve.checks).length ? [] : ["solve"]), ...(fixTrusted.length ? [] : ["fix"]), ...(trustedOnly(s.talkChecks).length ? [] : ["plan"])];
      if (unsure.length) {
        saveStepUp(null);
        ui?.notify(`the coding test could not be prepared: no confirmed checks for the ${unsure.join(" and ")} part${unsure.length > 1 ? "s" : ""} (is the sandbox on? /tutor-exam sandbox on). Nothing counts against you: /tutor-step-up starts again`, "warning");
        return;
      }
      // Habits Task 17: the improve-it part — clumsy working code, confirmed by the checks and measured as written.
      // Phase 8 A8, option C (author 2026-11-07): the model is asked twice; when its clumsy code still does not work,
      // a ready-made program vetted by the test suite is used (improve-fallback.ts). Never a part that counts as
      // done without the learner doing it, and never a cancelled coding test because the model failed.
      let improve: Partial<StepUpState> & { improveClumsy?: string } = {};
      if (s.improveTask) {
        const lines = (cs: Check[]) => cs.map((c) => (c.kind === "timed" ? `timed P1.T1: ${c.expr}` : `check P1.T1: ${c.expr} == ${c.expected}`));
        /** Clumsy code that passes the task's trusted checks, its extra checks confirmed on the reference, measured. */
        const finish = async (task: string, checks: Check[], reference: string, raw: string, extraFor: () => Promise<Check[]>): Promise<typeof improve | null> => {
          const clumsy = raw.endsWith("\n") ? raw : `${raw}\n`;
          const works = raw.trim() !== "" && (await crossCheckOnReference({ exec, sandbox: sandboxHost(), language: lang, entry, runCmd: null, reference: clumsy, checks, root })).every((c) => c.status === "trusted");
          if (!works) return null;
          const extra = trustedOnly(await crossCheckOnReference({ exec, sandbox: sandboxHost(), language: lang, entry, runCmd: null, reference, checks: await extraFor(), root }));
          const st = { checks, extra, functions: calledFunctions(checks.flatMap((c) => (c.expr ? [c.expr] : []))) };
          const before = await measure(root, `stepup/improve${ext}`, st, undefined, clumsy);
          if (!before.m || before.failed) return null;
          return { improveTask: task, improveChecks: st.checks, improveExtra: st.extra, improveFunctions: st.functions, improveRef: reference, improveBefore: before.m, improveSource: clumsy, improveClumsy: clumsy };
        };
        const task = s.improveTask;
        const fromModel = async (): Promise<typeof improve | null> => {
          const imp = await one(task);
          const impTrusted = trustedOnly(imp.checks);
          if (!impTrusted.length) return null;
          const raw = extractCode(await complete(systemText("step-up-clumsy"), `Language: ${lang}.\nThe task: ${task}\nIts checks:\n${lines(impTrusted).join("\n")}`));
          return finish(task, impTrusted, imp.reference, raw, async () =>
            parseChecks(await complete(systemText("improve"), improvePrompt({ taskLine: `P1.T1 ${task}`, checks: lines(impTrusted) })), { language: lang, taskIds: ["P1.T1"], milestone: 1 }).checks.filter((c) => c.kind !== "io"));
        };
        const readyMade = async (): Promise<typeof improve | null> => {
          const f = pickFallback(lastFallback()), parsed = fallbackChecks(f);
          rememberFallback(f);
          const checks = trustedOnly(await crossCheckOnReference({ exec, sandbox: sandboxHost(), language: lang, entry, runCmd: null, reference: f.reference, checks: parsed.checks, root }));
          return checks.length === parsed.checks.length ? finish(f.task, checks, f.reference, f.clumsy, async () => parsed.extra) : null;
        };
        // Option C review I1: a model call that errors (cut off, timed out) is an attempt that failed, not the end.
        const attempt = () => fromModel().catch(() => null);
        const made = (await attempt()) ?? (await attempt()) ?? (lang === "python" ? await readyMade() : null);
        if (!made) {
          // Only a sandbox that cannot run the vetted program gets here: a setup problem, not the learner's.
          saveStepUp(null);
          ui?.notify("the coding test could not be prepared: the improve part's code could not be run and measured here (is the sandbox on? /tutor-exam sandbox on). Nothing counts against you: /tutor-step-up starts again", "warning");
          return;
        }
        improve = made;
      }
      const broken = await brokenProgram(fix.reference, async (src) =>
        (await crossCheckOnReference({ exec, sandbox: sandboxHost(), language: lang, entry, runCmd: null, reference: src, checks: fixTrusted, root })).some((c) => c.status === "unverified"));
      const moved = backupStepUp(root, Date.now());
      const c = commentPrefix(`x${ext}`);
      const steps = (s.plan?.steps ?? []).map((st, i) => `${c} ${i + 1}. ${st}`).join("\n");
      const clumsy = improve.improveClumsy;
      delete improve.improveClumsy;
      let more = "";
      if (s.improveTask && clumsy && improve.improveBefore) {
        const solveFn = calledFunctions(trustedOnly(solve.checks).flatMap((c) => (c.expr ? [c.expr] : [])))[0] ?? "the solve function";
        more += `4. \`stepup/test_solve${ext}\`: write tests for \`${solveFn}\` (functions named \`test_…\`, \`from solve import ${solveFn}\`). They run against a hidden solution: they must pass on it and must fail on a broken version of it.\n`;
        writeInRoot(root, `stepup/improve${ext}`, clumsy);
        const timed = improve.improveExtra?.find((c) => c.kind === "timed")?.expr ?? null;
        more += `5. \`stepup/improve${ext}\`: ${improve.improveTask ?? s.improveTask} This code works but is clumsy: make it better (faster, simpler, right on more edge cases) and keep it working. measured now: ${measuredLine(improve.improveBefore, (improve.improveExtra ?? []).filter((c) => c.kind === "value").length, timed)}.\n`;
      }
      const [solveP, fixP, planP] = (["solve", "fix", "plan"] as const).map((k) => stepUpPart(lang, k, ext));
      for (const part of [solveP, fixP, planP]) if (part.manifest) writeInRoot(root, `${part.dir}/${part.manifest.rel}`, part.manifest.text);
      writeInRoot(root, "stepup/README.md", `# Step-up, part 2: the coding test\n\n1. \`${solveP.path}\`: ${s.solveTask}${s.module ? ` You will likely need \`${s.module}\`: look it up.` : ""}\n2. \`${fixP.path}\`: ${s.fixTask ?? ""} This code has a bug: find it and fix it.\n3. \`${planP.path}\`: ${s.talkTask} Build the plan you gave in the talking test.\n${more}\n\`/tutor-step-up check\` runs the checks; \`/tutor-step-up submit\` decides.\n`);
      writeInRoot(root, solveP.path, solveP.stub(s.solveTask));
      writeInRoot(root, fixP.path, broken ?? fixP.stub(s.fixTask ?? ""));
      const planText = planP.stub(s.talkTask);
      writeInRoot(root, planP.path, lang === "rust" || lang === "go" ? planText.replace(`// ${s.talkTask}\n`, () => `// ${s.talkTask}\n// Your plan:\n${steps}\n`) : `${c} ${s.talkTask}\n${c} Your plan:\n${steps}\n`);
      saveStepUp({ ...s, stage: "coding-ready", solveChecks: solve.checks, fixChecks: fix.checks, fixMissing: broken === null, solveRef: solve.reference, fixRef: fix.reference, ...improve });
      showStepUp(`Step-up, part 2: the coding test is in stepup/ (README.md says what each file is for).${moved ? ` Your earlier stepup/ folder was moved to ${moved}.` : ""} No timer: take the time you need. /tutor-step-up check runs the checks; /tutor-step-up submit decides.`);
    } catch (e) {
      ui?.notify(`the coding test could not be prepared: ${e instanceof Error ? e.message : String(e)}; /tutor-step-up check tries again`, "warning");
    } finally {
      codingPreparing = false;
    }
  }

  /** Each part's trusted checks against the learner's file in stepup/. */
  async function scoreStepUp(s: StepUpState): Promise<Record<"solve" | "fix" | "plan", { passed: number; total: number }> & { tests?: { passed: number; total: number }; improve?: { passed: number; total: number } }> {
    const root = project!.path, ext = extname(projectRun(root, s.language).entry ?? "src/main.py") || ".py";
    const score = async (file: string, checks: Check[]) => {
      if (!checks.length) return { passed: 0, total: 0 };
      const part = stepUpPart(s.language, file, ext); // habits Task 24b: a compiled part is checked in its own folder
      const r = await runChecks((c, a, o) => pi.exec(c, a, o), { language: s.language, root: part.dir === "stepup" ? root : join(root, part.dir), entry: part.dir === "stepup" ? part.path : part.entry, runCmd: null, checks, sandbox: sandboxHost() });
      return { passed: r.results.filter((x) => x.pass).length, total: checks.length };
    };
    const base = {
      solve: await score("solve", trustedOnly(s.solveChecks)),
      fix: s.fixMissing ? { passed: 1, total: 1 } : await score("fix", trustedOnly(s.fixChecks)),
      plan: await score("plan", trustedOnly(s.talkChecks)),
    };
    if (!s.improveTask) return base;
    // Habits Task 17: the learner's tests run against the hidden solve solution (laid over in the throwaway copy):
    // they must pass on it and catch a broken copy of it.
    const host = sandboxHost();
    const tests = testsInFile(root, `stepup/test_solve${ext}`);
    let testsOk = false;
    if (host && tests.length && s.solveRef) {
      const overlay = { [`stepup/solve${ext}`]: s.solveRef };
      const ran = await runOwnTests((c, a, o) => pi.exec(c, a, o), { root, language: s.language, tests, sandbox: host, entry: `stepup/solve${ext}`, overlay });
      testsOk = ran.pass && (await canFail((c, a, o) => pi.exec(c, a, o), { root, language: s.language, tests, entry: `stepup/solve${ext}`, sandbox: host, overlay, only: [`stepup/solve${ext}`] })) === "caught";
    }
    // Phase 8 A8: no new step-up sets improveMissing; one saved earlier told the learner the part counts as done.
    let improveOk = s.improveMissing === true;
    if (!improveOk && s.improveBefore && host) {
      const after = await measure(root, `stepup/improve${ext}`, { checks: s.improveChecks ?? [], extra: s.improveExtra ?? [], functions: s.improveFunctions ?? [] }, s.improveSource);
      if (after.m && !after.failed && !after.missing) { const r = improveResult({ ...s.improveBefore, ms: after.baseMs ?? s.improveBefore.ms }, after.m); improveOk = r.better.length > 0 && r.worse.length === 0; }
    }
    return { ...base, tests: { passed: testsOk ? 1 : 0, total: 1 }, improve: { passed: improveOk ? 1 : 0, total: 1 } };
  }
  /** Option C review M1: the ready-made improve-it program used last, per language, so a retake gets the next one. */
  function lastFallback(): string | null {
    let v: string | null = null;
    if (profile && project) { const p = profile, key = `stepup-fallback:${project.language}`; profileWrite(() => { v = p.setting(key) || null; }); }
    return v;
  }
  function rememberFallback(f: { task: string }) {
    if (profile && project) { const p = profile, key = `stepup-fallback:${project.language}`; profileWrite(() => p.setSetting(key, f.task)); }
  }
  let stepUp: StepUpState | null = null;
  function saveStepUp(s: StepUpState | null) {
    stepUp = s;
    if (project && profile) { const p = profile, key = `stepup:${project.path}`; profileWrite(() => p.setSetting(key, s ? JSON.stringify(s) : "")); }
  }
  function showStepUp(text: string) {
    pi.sendMessage({ customType: "tutor_stepup", content: text, display: true }, { triggerTurn: false });
  }
  /** The learner's message during the talking test: free talk, then the plan (asked for again once). */
  function stepUpTurn(prompt: string) {
    const s = stepUp;
    if (!s) return;
    if (s.stage === "talk" && !parsePlan(prompt)) {
      saveStepUp({ ...s, stage: "plan" });
      showStepUp(`Now your plan: numbered steps (1., 2., …), then one line starting with \`pieces:\` naming the ${s.language} functions and building blocks you would use, separated by commas.`);
      return;
    }
    if (s.stage !== "talk" && s.stage !== "plan" && s.stage !== "plan-reask") return;
    const plan = parsePlan(prompt);
    if (!plan && s.stage === "plan") {
      saveStepUp({ ...s, stage: "plan-reask" });
      showStepUp("The plan needs numbered steps and one line starting with `pieces:` listing what you would use. Only that plan is marked, not the talk before it.");
      return;
    }
    const talk = plan ? piecesMatch(plan.pieces, s.talkRef, s.language) : { matched: 0, total: 0 };
    saveStepUp({ ...s, stage: "coding", plan, talk });
    void prepareCoding();
    ui?.notify(plan ? `plan saved: ${talk.matched} of ${talk.total} pieces match the hidden solution; the coding test comes next` : "no plan with a pieces: line was given; the coding test comes next", "info");
  }

  pi.registerCommand("tutor-step-up", {
    description: describeCmd("/tutor-step-up"),
    handler: async (args, ctx) => {
      if (!project || !profile) { ctx.ui.notify("the step-up runs inside a project: /tutor-start makes one", "warning"); return; }
      const p = profile, lang = project.language, band = bandFor(level());
      const sub = args.trim();
      if (sub === "check" || sub === "submit") {
        const s = stepUp;
        // Final review I2: a setup that stopped (an error, a restart) is started again by check.
        if (s?.stage === "coding" && !codingPreparing) {
          stepUpModel = { model: ctx.model, modelRegistry: ctx.modelRegistry } as ExtensionContext;
          ctx.ui.notify("preparing the coding test again", "info");
          void prepareCoding();
          return;
        }
        if (!s || s.stage !== "coding-ready") { ctx.ui.notify(s ? `the coding test is not ready yet (${s.stage})` : "no step-up is running: /tutor-step-up starts one", "info"); return; }
        const parts = await scoreStepUp(s);
        const line = (["solve", "fix", "plan", "tests", "improve"] as const).flatMap((k) => (parts[k] ? [`${k} ${parts[k]!.passed}/${parts[k]!.total}`] : [])).join(" · ");
        if (sub === "check") { ctx.ui.notify(line, "info"); return; }
        const r = stepUpResult(parts, s.talk ?? { matched: 0, total: 0 });
        const next = NEXT_BAND[s.band];
        if (r.pass) {
          recordHabit("looks-up", true, "step-up:solve"); // spec §3: the unfamiliar module, looked up and used
          profileWrite(() => p.setSetting(`stepup-passed:${lang}`, JSON.stringify({ band: s.band, at: Date.now() }))); // final review M12
          ctx.ui.notify(`you passed the step-up (${line}): when you want the ${next?.name ?? "next"} band, /tutor-level ${next?.level ?? ""}; or keep going here`, "info");
        } else {
          profileWrite(() => p.setSetting(`stepup-wait:${lang}`, "3"));
          ctx.ui.notify(`not yet (${line}): practise ${r.practise.join(", ")}; the step-up can be taken again after 3 more tasks`, "info");
        }
        saveStepUp(null);
        return;
      }
      let wait = 0;
      profileWrite(() => { wait = Number(p.setting(`stepup-wait:${lang}`) ?? "0") || 0; });
      if (wait > 0) { ctx.ui.notify(`the step-up can be taken again after ${wait} more task(s)`, "info"); return; }
      if (band === "pro") { ctx.ui.notify("you are at the top band; there is no step-up above pro", "info"); return; }
      if (exam) { ctx.ui.notify("the step-up waits until the exam is over (/tutor-submit)", "info"); return; }
      if (!STEP_UP_LANGUAGES.has(lang)) { ctx.ui.notify(`the step-up is not ready for ${lang} yet (Python, Lua, Rust and Go for now)`, "info"); return; }
      if (band === "intermediate" && !ADVANCED_STEP_UP_LANGUAGES.has(lang)) { ctx.ui.notify(`the intermediate step-up measures code and is ready for Python only for now, not ${lang}`, "info"); return; }
      let events: ReturnType<Profile["habitEvents"]> = [];
      profileWrite(() => { events = p.habitEvents(); });
      const missing = missingForStepUp(band, (h) => solidIn(events.filter((e) => e.habit === h), lang));
      if (missing.length) { ctx.ui.notify(`not yet: these habits are still growing: ${missing.map((h) => HABIT_LABEL[h]).join(", ")} (/tutor-progress shows the evidence)`, "info"); return; }
      if (stepUp) { ctx.ui.notify(`a step-up is already running (${stepUp.stage})`, "info"); return; }
      const proj = project, root = proj.path, frozen = { model: ctx.model, modelRegistry: ctx.modelRegistry } as ExtensionContext;
      stepUpModel = frozen;
      const module = unfamiliarModule(lang, importedModules(projectSources(root), lang));
      const prep: StepUpState = { stage: "preparing", language: lang, band, talkTask: "", solveTask: "", module, talkRef: "", talkChecks: [], started: Date.now() };
      saveStepUp(prep);
      ctx.ui.notify("the step-up is being prepared: a talking test, then a coding test", "info");
      void (async () => {
        try {
          const complete = rawComplete(frozen, AbortSignal.timeout(SPEC_JOB_TIMEOUT_MS));
          const raw = await complete(systemText("step-up"), `Language: ${lang}. Band: ${band}.${module ? ` The solve problem must need the module \`${module}\`.` : ""}`);
          const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { talk?: unknown; solve?: unknown; fix?: unknown };
          if (typeof json.talk !== "string" || typeof json.solve !== "string") throw new Error("the problems came back incomplete");
          const entry = projectRun(root, lang).entry ?? "src/main.py";
          const ref = await writeMilestoneChecks({ complete, exec: (c, a, o) => pi.exec(c, a, o), sandbox: sandboxHost(), language: lang, tasksMd: `## Milestone 1: step-up\n- [ ] P1.T1 ${json.talk}\n`, milestone: 1, entry, runCmd: null, root, retry: false });
          const given = typeof (json as { improve?: unknown }).improve === "string" ? (json as { improve: string }).improve.trim() : "";
          // Phase 8 A8, option C: no improve-it problem from the model is a ready-made one's task, not a failed setup.
          const improveTask = band === "intermediate" ? given || pickFallback(lastFallback()).task : undefined;
          saveStepUp({ ...prep, stage: "talk", talkTask: json.talk, solveTask: json.solve, fixTask: typeof json.fix === "string" ? json.fix : json.solve, talkRef: ref.reference, talkChecks: ref.checks, ...(improveTask ? { improveTask } : {}) });
          showStepUp(`Step-up, part 1: the talking test.\n\n${json.talk}\n\nTalk it through in your own words: what the program needs, the steps, and which pieces you would use. No code yet.`);
        } catch (e) {
          saveStepUp(null);
          ui?.notify(`the step-up could not be prepared: ${e instanceof Error ? e.message : String(e)}; try /tutor-step-up again`, "warning");
        }
      })();
    },
  });

  pi.registerCommand("tutor-fix", {
    description: describeCmd("/tutor-fix"),
    handler: async (_args, ctx) => {
      if (!episode || !roleNamed(activeRole).ladder) { ctx.ui.notify("nothing to fix: run your program first", "info"); return; }
      if (bandFor(level()) !== "pro") { ctx.ui.notify("the fix comes after a few tries on the same spot", "info"); return; }
      episode = { ...episode, fixAsked: true };
      pi.appendEntry("tutor_episode", episode);
      // Phase 1 minor M1: at pro the fix still waits for the question step; say how many tries that is.
      const ep = episode;
      let more = 0;
      while (more < 20 && stepFor({ ...ep, climbs: (ep.climbs ?? 0) + more }, { exam: exam !== null }) !== "fix") more++;
      if (exam) { ctx.ui.notify("during an exam the tutor never gives the fix (spec §11a); it stays noted for after", "info"); return; }
      ctx.ui.notify(more === 0 ? "the next reply shows the fix for this spot" : `noted: the fix comes after ${more} more ${more === 1 ? "ask" : "asks"} (<leader>ts after trying something)`, "info");
    },
  });

  pi.registerCommand("tutor-level", {
    description: describeCmd("/tutor-level"),
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
      if (project && profile) {
        const p = profile, lang = project.language;
        let events: ReturnType<Profile["habitEvents"]> = [];
        profileWrite(() => { events = p.habitEvents(); });
        const solidNow = bandProgress(events, bandFor(n), lang).solid;
        profileWrite(() => { p.setLevel(lang, n); p.setSetting(`level-hand:${lang}`, String(solidNow)); });
      }
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
    description: describeCmd("/tutor-docs"),
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
  /** The project README's title and first paragraph (front matter skipped): its own words before a plan exists. */
  function projectAbout(root: string): string | null {
    let text: string;
    try { text = readFileSync(join(root, "README.md"), "utf8"); } catch { return null; }
    const body = text.replace(/^---\n[\s\S]*?\n---\n/, "");
    const paras = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    return paras.length ? paras.slice(0, 2).join("\n") : null;
  }
  /**
   * Spec §2: nothing known yet — onboarding never written (a finished one is saved as ""), no project here, no
   * language in the profile.
   */
  function firstRun(): boolean {
    if (onboarding || project || !profile) return false;
    let none = false;
    const p = profile;
    profileWrite(() => { none = p.setting("onboarding") === null && p.languages().length === 0; });
    return none;
  }
  function loadOnboarding(): Onboarding | null {
    let o: Onboarding | null = null;
    if (profile) { const p = profile; profileWrite(() => { const raw = p.setting("onboarding"); if (raw) { try { o = JSON.parse(raw) as Onboarding; } catch { o = null; } } }); }
    return o;
  }
  function saveOnboarding(o: Onboarding | null) {
    onboarding = o;
    if (profile) { const p = profile; profileWrite(() => p.setSetting("onboarding", o ? JSON.stringify(o) : "")); }
  }
  const NOTES_REMINDER = "[tutor-reply] This reply is notes only, not the bold parts: at most three lines, each `path:line: one sentence` on design or naming, "
    + "then the ```tutor-judgment block. No code and no fix.";
  /**
   * Task 16 (spec 2026-10-21 §8): after a scored tick, remember the score; three far from the level suggest one
   * (the learner decides; the tutor never moves it); and, unless /tutor-notes off, ask the tutor for notes on
   * design and naming that carry no points.
   */
  function afterProTick(ctx: ExtensionContext, id: string, score: number, judged: boolean) {
    if (!profile || !project) return;
    try { if (!openTaskIds(readFileSync(join(project.path, "spec", "tasks.md"), "utf8")).every((t) => t !== id)) return; } catch { return; }
    const p = profile, key = `proscores:${project.language}`;
    let scores: number[] = [];
    // Side-agent note: a task ticked without an own test is not judged for a level.
    if (!judged) { notesAfter(ctx, id, score); return; }
    profileWrite(() => { try { scores = JSON.parse(p.setting(key) ?? "[]"); } catch { scores = []; } scores = [...scores, score].slice(-5); });
    const to = levelSuggestion(scores, level());
    if (to !== null) {
      const recent = scores.slice(-3), avg = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
      ui?.notify(`your last 3 pro scores average ${avg}; /tutor-level ${to} if you want ${to > level() ? "harder" : "easier"} work (you decide)`, "info");
      scores = [];
    }
    profileWrite(() => p.setSetting(key, JSON.stringify(scores)));
    notesAfter(ctx, id, score);
  }
  function notesAfter(ctx: ExtensionContext, id: string, score: number) {
    if (profile?.setting("pro-notes") === "off") return;
    // Phase 5 live run: name each function's line, so a weak model has real lines to point at.
    let where = "";
    if (project) {
      const { entry } = projectRun(project.path, project.language);
      try {
        if (entry) where = readFileSync(join(project.path, entry), "utf8").split("\n")
          .flatMap((l, k) => { const d = /^\s*(?:async\s+)?(?:def|fn|func|function)\s+(\w+)/.exec(l); return d ? [`${entry}:${k + 1} ${d[1]}`] : []; }).join(", ");
      } catch { where = ""; }
    }
    customWhenIdle(ctx, "tutor_notes", `[tutor] ${id} is ticked; code scored it ${score}/100 from its checks and the learner's tests. `
      + `Give at most three notes on design or naming in the code for ${id}, each starting with path:line and one sentence long. `
      + "Notes carry no points and do not change the level. No code and no fix; if nothing is worth a note, say so in one line."
      + (where ? ` The functions: ${where}.` : ""));
  }
  function customWhenIdle(ctx: ExtensionContext, customType: string, text: string, tries = 0) {
    if (closing) return;
    if (ctx.isIdle() || tries >= 600) { pi.sendMessage({ customType, content: text, display: false }, { triggerTurn: true }); return; }
    setTimeout(() => customWhenIdle(ctx, customType, text, tries + 1), 50).unref?.();
  }
  /**
   * Live check 2026-10-19: a message queued while a run is still ending (from agent_end) runs as a follow-up
   * in that loop with no before_agent_start, so the model never gets the onboarding or lesson section.
   * Sent once Pi is idle, it starts a fresh run.
   */
  function rewriteWhenIdle(ctx: ExtensionContext, text: string, tries = 0, token = rewriteToken) {
    if (closing || token !== rewriteToken) return; // third review M1: the learner sent a new message meanwhile
    if (ctx.isIdle() || tries >= 600) { pi.sendMessage({ customType: "tutor_rewrite", content: text, display: false }, { triggerTurn: true }); return; }
    setTimeout(() => rewriteWhenIdle(ctx, text, tries + 1, token), 50).unref?.();
  }
  /**
   * Wayfinding spec §9.1: the tutor's own line to the model ("[tutor] …"), sent as a hidden custom message once Pi
   * is idle, so it starts a fresh turn and never shows as the learner's message or in Pi's follow-up queue.
   * Pi gives the model a custom message as user text (dist/core/messages.js); before_agent_start reads it back.
   */
  function sendNudge(ctx: ExtensionContext, text: string, tries = 0) {
    if (closing) return;
    if (ctx.isIdle() || tries >= 600) {
      pi.sendMessage({ customType: "tutor_nudge", content: text, display: false }, { triggerTurn: true });
      return;
    }
    setTimeout(() => sendNudge(ctx, text, tries + 1), 50).unref?.();
  }
  /** Start the model's next onboarding turn (only the TUI may start a turn, as for /tutor-plan). */
  function kick(ctx: ExtensionContext, what: string) {
    if (ctx.hasUI) sendNudge(ctx, `${TUTOR_PREFIX} onboarding: ${what}`);
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
      // Wayfinding spec §9.3: the accepted level shows at once (it was only saved when the project folder was made).
      setLevel(level);
      const lang = o.fields.target, p = profile;
      if (lang) profileWrite(() => { if (p.language(lang)) p.setLevel(lang, level); });
      paint();
    }
    if (o.stage === "project" && !o.project) {
      try {
        // Wayfinding spec §9.2: the learner's idea is the project until they ask for something else.
        const idea = o.ideaDropped ? null : o.fields.idea ?? null;
        const lvl = o.level ?? levelFrom(o);
        const s = await suggestOne({ profile, complete: modelComplete(ctx, () => "tutor: finding a project for you…") }, { language: o.fields.target!, level: lvl, about: aboutOf(o), exclude: o.shown, idea });
        o = { ...o, project: { title: s.title, summary: s.summary, concepts: s.concepts, ...(s.slug ? { slug: s.slug } : {}) }, shown: [...o.shown, s.title], presented: "project" };
        saveOnboarding(o);
        if (s.tooBig) kick(ctx, `say their idea "${idea}" is too big for level ${lvl} as it is, and offer this smaller version of it: "${s.title}" — ${s.summary}; they can ask for something else`);
        else kick(ctx, `suggest this one project and say why it suits them: "${s.title}" — ${s.summary}; they can ask for something else`);
      } catch (e) {
        // Final review I3: an idea the model could not keep (no smaller version, or a project that ignores it) is let go,
        // so the next try suggests something else; a malformed reply keeps the idea (review 2026-11-09 #3).
        const unscalable = !o.ideaDropped && !!o.fields.idea && e instanceof IdeaError;
        saveOnboarding(unscalable ? { ...o, ideaDropped: true } : o);
        ctx.ui.notify(e instanceof Cancelled ? "cancelled; /tutor-start picks up where we left off"
          : unscalable ? `${e.message.split(";")[0]}; /tutor-start suggests a project for your level instead`
          : `no project suggestion: ${e instanceof Error ? e.message : String(e)}; /tutor-start tries again`, e instanceof Cancelled ? "info" : "error");
      }
      return;
    }
    if (o.stage === "project" && o.project && o.presented === "project") {
      const pick = await ctx.ui.select(`Project: ${o.project.title}`, ["Start this project", "Show me something else"]);
      if (pick === undefined) { saveOnboarding(o); return; }
      if (pick === "Show me something else") { onboarding = { ...o, project: null, presented: null, ideaDropped: true }; return onboardStep(ctx); }
      const lang = o.fields.target!, def = defaultProjectDir(homedir(), lang, o.project.title, o.project.slug);
      const answer = await ctx.ui.input(`Project folder (Enter for ${def})`, def);
      if (answer === undefined) { saveOnboarding(o); return; }
      let dir: string;
      const lua = await luaRuntimeFor(lang);
      try {
        dir = createProject(profile, { language: lang, level: o.level ?? levelFrom(o), project: { ...o.project, size: "small" }, dir: resolve(expandHome(answer.trim() || def, homedir())), about: aboutOf(o), now: Date.now(), luaRuntime: lua }).dir;
        { const p = profile; profileWrite(() => writeProjectsFile(p)); }
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
  function ensureChecks(ctx: ExtensionContext) {
    if (!project || !profile || checksRunning.has(project.path) || specRunning.has(project.path)) return;
    const proj = project, p = profile, key = `checks:${proj.path}`, mine = generation;
    let tasksMd: string;
    try { tasksMd = readFileSync(join(proj.path, "spec", "tasks.md"), "utf8"); } catch { return; }
    const current = currentMilestone(tasksMd, lesson);
    let state: ChecksState = { milestones: {} };
    profileWrite(() => { state = readChecksState(p.setting(key)); });
    // A record with no reference holds only the learner's Examples rows (phase 1 live check): still to write.
    const todo = Array.from({ length: current }, (_, i) => i + 1).filter((k) => !state.milestones[k]?.reference);
    if (todo.length === 0) return;
    const { runCmd, entry } = projectRun(proj.path, proj.language);
    const frozen = { model: ctx.model, modelRegistry: ctx.modelRegistry } as ExtensionContext;
    checksRunning.add(proj.path);
    void (async () => {
      try {
        for (const k of todo) {
          const m = await writeMilestoneChecks({
            complete: rawComplete(frozen, jobSignal()), exec: (c, a, o) => pi.exec(c, a, o), sandbox: sandboxHost(),
            language: proj.language, tasksMd, milestone: k, entry, runCmd, root: proj.path,
          });
          // Examples rows saved before this milestone had a reference are kept, cross-checked on the new one.
          let earlier: ChecksState = { milestones: {} };
          withProfile((pr) => { earlier = readChecksState(pr.setting(key)); });
          const rows = (earlier.milestones[k]?.checks ?? []).filter((c) => !m.checks.some((x) => x.kind === c.kind && x.expr === c.expr && x.stdin === c.stdin));
          const kept = rows.length ? await crossCheckOnReference({ exec: (c, a, o) => pi.exec(c, a, o), sandbox: sandboxHost(), language: proj.language, entry, runCmd, reference: m.reference, checks: rows, root: proj.path }) : [];
          let saved: ChecksState = { milestones: {} };
          withProfile((pr) => { saved = readChecksState(pr.setting(key)); saved.milestones[k] = { ...m, checks: [...m.checks, ...kept] }; pr.setSetting(key, JSON.stringify(saved)); });
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
    try { writeInRoot(root, "spec/checks.md", renderChecksMd(liveChecks(all, current), tickedIds(tasksMd), { note, how: state.ticks, weak: new Set(Object.values(state.milestones).flatMap((m) => m.weak ?? [])) })); } catch { /* spec/ is gone or points outside the project: nothing to show */ }
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
    if (l?.building) autoRecipe(session); // final review I1b: building a milestone starts its first task's recipe
  }
  /** Where the lesson is: building a milestone, a concept with no exercise, or its exercise not yet written / written. */
  function lessonStep(l: LessonState): "get" | "write" | "none" | "build" {
    if (l.building) return "build";
    const ex = project ? lessonOf(project.language, l.concept)?.exercises[l.exercise] : undefined;
    if (!ex) return "none";
    return existsSync(join(project!.path, exerciseDir(l, ex))) ? "write" : "get";
  }
  /** The hidden lesson section: the rules, the vendored lesson text, the exercise, and a step back after two fails (Q17). */
  function lessonSection(l: LessonState, lang: string): string {
    if (l.building) return `[lesson] Round ${l.round + 1} is done: the learner is building Milestone ${l.round + 1} in spec/tasks.md with ${l.rounds[l.round].join(", ")}. Coach as usual; /tutor-lesson next starts the next round.`;
    const les = lessonOf(lang, l.concept), ex = les?.exercises[l.exercise];
    const parts = [systemText("lesson"), `[lesson] concept: ${l.concept} (round ${l.round + 1} of ${l.rounds.length}), source: ${les?.source ?? "?"}`];
    if (les) parts.push(`Lesson text:\n${les.text}`);
    if (ex) parts.push(`Exercise ${l.exercise + 1}/${les!.exercises.length} (learn/${l.concept}/${ex.id}/):\n${ex.instructions}`);
    // Live 2026-11-09: "try writing it on your own" left the learner looking for how to make a .py file.
    if (ex && lessonStep(l) === "get") parts.push("The exercise file does not exist yet. When you set the exercise, tell the learner to type `/tutor-lesson next` in this pane: it writes the exercise file and opens its instructions in the editor. Never ask them to create a file themselves, and set this exercise, not one of your own.");
    else if (ex) parts.push(`The learner's exercise file is ${exerciseDir(l, ex)}/${layout(lang)?.stub ?? "the stub"} (instructions.md beside it): they write their code there and run \`/tutor-lesson check\` in this pane. Name that file when they ask where to write.`);
    if (l.stepBack) parts.push("The learner failed this exercise twice: take a smaller step (one part of the idea, another small example) and say so in one line.");
    return parts.join("\n\n");
  }
  function lessonKick(ctx: ExtensionContext, what: string) {
    if (ctx.hasUI) sendNudge(ctx, `${TUTOR_PREFIX} lesson: ${what}`);
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
        if (generation === mine) {
          specStatus = null;
          ui?.notify("the project plan is ready: spec/tasks.md", "info");
          // Wayfinding spec §9.4: the README the learner has open shows the plan's version (with its run: line).
          if (link) await refreshPlanBuffers(link, proj.path, (m) => ui?.notify(m, "warning"));
        }
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
      if (written && generation === mine) autoRecipe(session); // final review I1b: a new plan's first task
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
    else if (path === "build" && ctx.hasUI) sendNudge(ctx, `${TUTOR_PREFIX} project: talk through what "${o.project.title}" involves (${o.project.summary}) and its first small step, while the plan is being written`);
    else if (path === "learn") ctx.ui.notify("no prepared lessons cover this project's ideas yet; we build and learn as we go", "info");
  }

  const exerciseDir = (l: LessonState, ex: { id: string }) => `learn/${l.concept}/${ex.id}`;
  /** Final review I1: a finished review returns exactly to the saved place (it is not part of any round). */
  const backFromReview = (l: LessonState): LessonState => ({ ...l, ...l.resume!, fails: 0, stepBack: false, resume: null });

  pi.registerCommand("tutor-lesson", {
    description: describeCmd("/tutor-lesson"),
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
    if (pendingEmpty) {
      pendingEmpty = false;
      if (!pendingRewrite) rewriteWhenIdle(ctx, "Your last reply had no text for the learner: your answer was only in your thinking. Write your answer to the learner now, following this turn's instruction.");
      // Author 2026-11-09: getting-started's own step (the note, the next question or dialog) runs after the retry.
      if (onboardWaits && !pendingRewrite) return;
    }
    onboardWaits = false;
    if (pendingRewrite) {
      const issues = pendingRewrite;
      pendingRewrite = null;
      // A fresh run from a hidden message (live check 2026-10-21: a typed "[tutor] rewrite:" showed the machinery
      // in the learner's chat); before_agent_start builds its context; started once Pi is idle (2026-10-19).
      rewriteWhenIdle(ctx, `Your last reply broke this turn's rules (${issues.join(", ")}). Write it again, following this turn's instruction.`);
    }
    if (!onboardingActive() || !onboarding) return;
    // Third review I1/M2: what the blank reply recorded stays; the retry's (or the learner's next) note adds to it.
    const note = waitNote ? { ...waitNote, ...(intake ?? {}) } : intake;
    intake = undefined; waitNote = null;
    saveOnboarding(applyTurn(onboarding, note === undefined ? null : note));
    try { await onboardStep(ctx); } catch (e) { ctx.ui.notify(`onboarding: ${e instanceof Error ? e.message : String(e)}`, "error"); }
    paint();
  });

  pi.registerCommand("tutor-start", {
    description: describeCmd("/tutor-start"),
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
    description: describeCmd("/tutor-learn"),
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

  pi.registerCommand("tutor-help", {
    description: describeCmd("/tutor-help"),
    handler: async (_args, ctx) => {
      if (!link || !(await link.openHelp())) { ctx.ui.notify("help opens in Neovim: :TutorHelp (or <leader>t?) in the editor", "info"); return; }
    },
  });

  pi.registerCommand("tutor-status", {
    description: describeCmd("/tutor-status"),
    handler: async (_args, ctx) => {
      ctx.ui.notify(renderWidget(state).join(" | "), "info");
    },
  });
}
