import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { NvimLink, type EditorSnapshot, type TutorPayload } from "./nvim.js";
import { renderWidget, renderStatus, type TutorState } from "./ui.js";
import { bandFor, startRung, thresholds, DEFAULT_LEVEL } from "./policy.js";
import { tutorPrompt, systemText } from "./prompts.js";
import { parseJudgment, toJudgment, isJudgmentTool, type Judgment } from "./judgment.js";
import { formatEditorContext, formatEpisodeContext } from "./context.js";
import { guardJudgment, checkReply, formatCheck, replyReminder, scrubInternals, diagramCols, type Issue } from "./compliance.js";
import { DEFAULT_ROLE, roleNamed, rolePrompt } from "./roles.js";
import { parseThinkingMode, thinkingHidden, THINKING_LABEL, type ThinkingMode } from "./thinking.js";
import { rememberTool, recallTool, memorySnapshot, memoryLine } from "./memory.js";
import { STEPS, TASK_ID, startWorkflow, advance, workflowLabel, formatWorkflowContext, findTask, type Workflow } from "./workflow.js";
import { StuckDetector, type StuckEvent } from "./stuck.js";
import { easeStart, episodeScore, yieldsTo, openEpisode, applyJudgment, closeEpisode, rebandEpisode, describeTrigger, rungCap, type CloseReason, type Episode, type Trigger } from "./ladder.js";
import { guardToolCall, skillDirs } from "./guard.js";
import { Profile, type FeedbackKind, type ProjectRow } from "./profile.js";
import { FEEDBACK_KINDS, activeFeedback, feedbackRung, formatFeedback } from "./feedback.js";
import { runStart } from "./start.js";
import { completeJson, type Complete } from "./llm.js";
import { withLoader, Cancelled, MODEL_TIMEOUT_MS, type CustomUi } from "./progress.js";
import { lastClosedEpisode, transcript, learnPrompt, checkLearned, renderLearned, parseSkillHeader, saveSkill, type Learned } from "./learn.js";
import { fetchReference, referenceInfo, skillsRoot } from "./knowledge/reference.js";
import { loadPack, normalizeTags, vocabOf, cookbookIndex, remapConcepts, type IndexEntry } from "./packs.js";
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
  let ep: Episode | undefined;
  for (const e of ctx.sessionManager.getBranch()) {
    if (e.type === "custom" && e.customType === "tutor_episode") ep = e.data as Episode;
  }
  return ep && typeof ep.rung === "number" && ep.trigger && ep.closed === undefined ? ep : null;
}

function realCwd(cwd: string): string {
  try { return realpathSync(cwd); } catch { return cwd; }
}


/** Pi's model as a plain JSON-call function bound to one abort signal. */
function rawComplete(ctx: ExtensionContext, signal: AbortSignal): Complete {
  return async (system, user) => {
    const model = ctx.model;
    if (!model) throw new Error("no model selected");
    const r = await ctx.modelRegistry.complete(model, { systemPrompt: system, messages: [{ role: "user", content: [{ type: "text", text: user }], timestamp: Date.now() }] }, { signal });
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
   * and then writes the fence must not move the rung twice.
   */
  /** `episodeId`: the episode a ladder-role run answers, `null` when it started without one (M6c M6). */
  let run: { prompt: string; rung: number | null; judged: boolean; episodeId?: string | null } | null = null;
  /** Messages typed mid-reply that Pi has queued (steer or followUp) but not yet delivered to the model. */
  let pendingSteers = 0;
  /** Rule breaks in the last reply (spec 2026-10-13 §7 #2), quoted to the model on the next turn. */
  let lastIssues: Issue[] = [];
  /** Markdown width Pi last rendered a reply at; undefined until the TUI draws one (print mode never does). */
  let paneWidth: number | undefined;
  /** Thinking visibility (learner setting, kept in the profile): auto hides it only at the pro band. */
  let thinking: ThinkingMode = "auto";
  /** Toolchain per language+root (spec §5.1): versions re-checked every few minutes, the constraint every turn. */
  const toolchainOf = toolchainCache((command, args, options) => pi.exec(command, args, options));
  /** Active role (spec 2026-10-13 §3), persisted as `tutor_role` entries. */
  let activeRole = DEFAULT_ROLE;
  /** Design-recipe workflow in progress (spec 2026-10-13 §4), persisted as `tutor_workflow` entries. */
  let workflow: Workflow | null = null;
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

  function paint() {
    state.rung = episode ? episode.rung : startRung(bandFor(level()));
    state.state = episode ? `stuck: ${describeTrigger(episode.trigger)}` : signal;
    const r = roleNamed(activeRole);
    state.role = r.name === DEFAULT_ROLE ? undefined : r.name;
    if (!r.ladder) state.rung = undefined;
    state.task = workflow ? workflowLabel(workflow) : undefined;
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
      episode = rebandEpisode(episode, bandFor(n));
      pi.appendEntry("tutor_episode", episode);
    }
  }

  function openEp(trigger: Trigger, nudge: boolean) {
    // Spec 2026-10-13 §7 #4: a failed run is the learner's explicit check; it replaces any episode and nudges without the gap.
    const run = trigger.kind === "run";
    // Final review I1: re-running a still-failing program keeps the hint level; only the trace is new.
    if (run && episode?.trigger.kind === "run") {
      episode = { ...episode, trigger };
      pi.appendEntry("tutor_episode", episode);
      nudgeFor(trigger, nudge, true);
      return;
    }
    if (episode) {
      // Chat, idle and churn episodes may never close on their own; editor triggers must not be lost behind them.
      if (!nudge || !(run || yieldsTo(episode))) return;
      closeEp("superseded");
    }
    episode = openEpisode(trigger, bandFor(level()), Date.now());
    pi.appendEntry("tutor_episode", episode);
    nudgeFor(trigger, nudge, run);
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
    const score = episodeScore(closed);
    if (score === null) return;
    const p = profile, proj = project, closedAt = closed.closed;
    profileWrite(() => p.recordEpisode({
      language: proj.language,
      project: proj.path,
      concept_tags: closed.concept_tags,
      rungs_used: Math.max(1, closed.rung - startRung(closed.band) + 1), // M5 #40: an eased start can sit below the band's
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
      else if (e.type === "run_passed") closeEp("run_passed");
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
    if (profile) { const p = profile; profileWrite(() => { thinking = parseThinkingMode(p.setting("thinking") ?? "") ?? "auto"; }); }
    memoryNote = null;
    if (profile) { const p = profile; profileWrite(() => { memoryNote = memorySnapshot(p.memories({ language: project?.language ?? null, limit: 40 })); }); }
    feedbackHistory = [];
    if (project && profile) { const p = profile, lang = project.language; profileWrite(() => { feedbackHistory = p.feedback(lang).map((f) => f.kind); }); }
    else for (const e of ctx.sessionManager.getBranch()) {
      if (e.type === "custom" && e.customType === "tutor_feedback") feedbackHistory.push((e.data as { kind: FeedbackKind }).kind);
    }
    episode = restoreEpisode(ctx);
    activeRole = restoreRole(ctx);
    workflow = restoreWorkflow(ctx);
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
    paint();
  });

  pi.on("session_shutdown", async () => {
    closing = true;
    if (tick) clearInterval(tick);
    tick = null;
    profile?.close();
    profile = null;
    await link?.close();
    link = null;
    state.connected = false;
  });

  // Spec §4/§5: band prompt section, then the per-turn hidden context (episode + editor snapshot).
  pi.on("before_agent_start", async (event) => {
    const band = bandFor(level());
    const role = roleNamed(activeRole);
    event.systemPromptOptions.sections["tutor"] = tutorPrompt(band, { role: rolePrompt(role), ladder: role.ladder });
    if (memoryNote) event.systemPromptOptions.sections["tutor_memory"] = memoryNote;
    // A learner's chat message opens an episode; our own [tutor] nudges and non-ladder roles do not.
    if (role.ladder && !episode && !event.prompt.startsWith(TUTOR_PREFIX)) { openEp({ kind: "chat" }, false); paint(); }
    pendingSteers = 0;
    run = { prompt: event.prompt, rung: role.ladder && episode ? episode.rung : null, judged: false, episodeId: role.ladder ? episode?.id ?? null : undefined };
    let snap: EditorSnapshot | null = null;
    if (link) {
      try { snap = await link.snapshot(band === "beginner" ? "full" : "window"); } catch { snap = null; }
    }
    if (snap?.filetype) { state.language = snap.filetype; paint(); }
    // Spec §5, §5.4: the project's (or, outside one, the editor's) language card, and the editor card.
    const lang = project?.language ?? editorLanguage();
    const pack = lang ? loadPack(lang) : null;
    const editorPack = loadPack("editor");
    const cards: string[] = [];
    if (lang && pack) {
      const root = project?.path ?? session?.cwd ?? process.cwd();
      let knows: string[] = [];
      if (profile) { const p = profile; profileWrite(() => { knows = p.languages(); }); }
      cards.push(renderCard(pack, { tc: await toolchainOf(lang, root), ref: referenceInfo(skillsRoot(), lang), knows, skills: packSkills(lang), skillsDir: SKILLS_DIR }));
    }
    if (editorPack) cards.push(renderEditorCard(editorPack));
    if (cards.length) event.systemPromptOptions.sections["tutor_lang"] = cards.join("\n\n");
    const parts: string[] = [];
    if (episode && role.ladder) parts.push(formatEpisodeContext(episode));
    // The architect suspends the recipe (M6a minor): no step context for a role that must not write code.
    if (workflow && role.ladder) parts.push(formatWorkflowContext(workflow, band));
    // Option 2: the idiom index only at the recipe's Map step or on a how-do-I question, this turn only.
    const mapStep = workflow !== null && role.ladder && STEPS[workflow.step - 1] === "Map";
    if (lang && pack && role.ladder && indexWanted({ prompt: event.prompt, mapStep })) {
      const index = packIndex(lang);
      if (index) parts.push(index);
    }
    if (lastIssues.length) parts.push(formatCheck(lastIssues, diagramCols(paneWidth)));
    const fb = formatFeedback(activeFeedback(feedbackHistory));
    if (fb) parts.push(fb);
    parts.push(replyReminder(run.rung, workflow !== null && role.ladder));
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
  function applyTurnJudgment(raw: Judgment, episodeId?: string | null) {
    // Spec §5.4 (gap #5): tags from the card's vocabulary (aliases mapped, unknown dropped), plus the
    // editor pack's; a language with no pack keeps its tags, only normalized.
    const lang = project?.language ?? editorLanguage();
    const pack = lang ? loadPack(lang) : null;
    const j: Judgment = { ...raw, concept_tags: normalizeTags(raw.concept_tags, pack ? vocabOf(pack, loadPack("editor")) : null) };
    state.last = j.judgment;
    pi.appendEntry("tutor_judgment", j);
    const ladder = roleNamed(activeRole).ladder;
    const inRecipe = workflow !== null && ladder;
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
      episode = easeStart(episode, j.concept_tags, (t) => known.get(t));
    }
    const rung = episode.rung;
    episode = applyJudgment(episode, j, Date.now());
    // Spec §4: in the design recipe the learner writes every artifact; good step answers must not
    // climb the ladder toward reveal (final review I2: the rung went 3 → 5 in the live walk).
    if (inRecipe) episode = { ...episode, rung };
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
  pi.registerMarkdownTransformer((md, c) => {
    if (c.messageType === "assistant-thinking") return thinkingHidden(thinking, bandFor(level())) ? THINKING_LABEL : md;
    if (c.messageType !== "assistant") return md;
    paneWidth = c.availableWidth;
    return scrubInternals(md);
  });
  pi.on("message_end", (event) => {
    const m = event.message;
    if (m.role !== "assistant") return;
    let changed = false;
    const content = m.content.map((c) => {
      if (c.type !== "text") return c;
      const text = scrubInternals(c.text);
      if (text === c.text) return c;
      changed = true;
      return { ...c, text };
    });
    return changed ? { message: { ...m, content } } : undefined;
  });

  // Spec §5: take the judgment (fence, fallback, or invented tool call) and apply it once per run.
  pi.on("turn_end", async (event) => {
    const m = event.message;
    if (m.role !== "assistant") return;
    // Aborted, errored and truncated turns carry no judgment.
    if (m.stopReason !== "stop" && m.stopReason !== "toolUse") return; // pending, deferred, aborted, error, length carry no judgment
    const cur = run ?? (run = { prompt: "", rung: episode ? episode.rung : null, judged: false });
    let callArgs: unknown;
    for (const c of m.content) if (c.type === "toolCall" && isJudgmentTool(c.name)) callArgs = c.arguments;
    const final = m.stopReason === "stop" && !m.content.some((c) => c.type === "toolCall");
    const text = m.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("\n");
    // A judgment may come in a tool-use turn's text too (live check); the first one in the run counts.
    const j = callArgs !== undefined ? toJudgment(callArgs) : parseJudgment(text);
    if (j && !cur.judged) { cur.judged = true; applyTurnJudgment(guardJudgment(j, cur.prompt), cur.episodeId); }
    if (final) {
      if (!cur.judged) state.last = "missing";
      lastIssues = checkReply(text, { band: bandFor(level()), rung: cur.rung, judged: cur.judged, noCode: bandFor(level()) === "pro" || !roleNamed(activeRole).ladder, cols: diagramCols(paneWidth) });
      if (lastIssues.length) pi.appendEntry("tutor_check", { issues: lastIssues });
    }
    paint();
  });

  // Spec §8 tool fence: read-only tools inside the project root. Defence in depth behind `--tools`.
  // Plus the folders of skills Pi loaded (spec §7): skills load through `read`.
  pi.on("tool_call", (event, ctx) => guardToolCall(event.toolName, event.input as Record<string, unknown>, ctx.cwd, skillDirs(pi.getCommands())));

  // Spec §3.4/§4: every turn carries one hidden tutor_editor message. Keep only
  // the newest so stale snapshots do not pile up in the model's context.
  pi.on("context", (event) => {
    const msgs = event.messages;
    let last = -1;
    msgs.forEach((m, i) => { if (m.role === "custom" && m.customType === "tutor_editor") last = i; });
    if (last < 0) return;
    const pruned = msgs.filter((m, i) => !(m.role === "custom" && m.customType === "tutor_editor" && i !== last));
    return pruned.length === msgs.length ? undefined : { messages: pruned };
  });

  pi.registerCommand("tutor-architect", {
    description: "Architecture professor: components, data flow, trade-offs; /tutor-architect off to return",
    handler: async (args, ctx) => {
      const q = args.trim();
      if (q === "off") { setRole(DEFAULT_ROLE); paint(); ctx.ui.notify("back to the coding tutor", "info"); return; }
      setRole("architect");
      paint();
      // Only the TUI may start a turn: in print/RPC mode a fire-and-forget turn races the caller's next prompt.
      if (q && ctx.hasUI) pi.sendUserMessage(q);
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
          pi.sendUserMessage(`${TUTOR_PREFIX} the learner moved on to step ${moved.step} (${STEPS[moved.step - 1]}) of the design recipe for ${moved.task}.`);
        }
        return;
      }
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
      if (ctx.hasUI) pi.sendUserMessage(kickoff);
      else ctx.ui.notify(`design recipe started for ${id}; send a message to begin step 1`, "info");
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
      const rung = episode ? episode.rung : null;
      if (episode && roleNamed(activeRole).ladder) {
        const next = feedbackRung(kind, episode.rung, rungCap(episode.band));
        if (next !== episode.rung) { episode = { ...episode, rung: next }; pi.appendEntry("tutor_episode", episode); }
      }
      feedbackHistory.push(kind);
      pi.appendEntry("tutor_feedback", { kind, rung });
      if (project && profile) { const p = profile, proj = project; profileWrite(() => p.recordFeedback({ kind, language: proj.language, project: proj.path, rung }, Date.now())); }
      paint();
      ctx.ui.notify(kind === "good" ? "thanks — the tutor keeps going like this" : `noted: ${kind}; the tutor adjusts from the next reply`, "info");
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

  pi.registerCommand("tutor-start", {
    description: "Pick a language, get three project ideas, scaffold one (spec/ + AGENTS.md)",
    handler: async (args, ctx) => {
      if (!profile) { ctx.ui.notify("tutor profile unavailable; see the earlier warning", "error"); return; }
      if (!ctx.model) { ctx.ui.notify("no model selected; pick one with /model first", "error"); return; }
      let label = "tutor: asking the model…";
      const r = await runStart(args, {
        ui: {
          select: (t, o) => ctx.ui.select(t, o),
          input: (t, p) => ctx.ui.input(t, p),
          notify: (m, l) => ctx.ui.notify(m, l),
          working: (m) => { label = m ?? label; ctx.ui.setWorkingMessage(m); },
        },
        profile, complete: modelComplete(ctx, () => label), now: Date.now, home: homedir(),
      });
      if (!r) return;
      // Spec §6 last step: fetch the language's knowledge if not cached; the switched Pi loads it.
      await fetchDocs(ctx, r.language, false); // cached unless missing or a newer DevDocs build
      if (link) {
        ctx.ui.notify(`scaffolded ${r.title} in ${r.dir}; switching the editor and tutor there…`, "info");
        await link.switchProject(r.dir, "spec/tasks.md");
      } else {
        ctx.ui.notify(`scaffolded ${r.title} in ${r.dir}. Continue with: cd ${r.dir} && pi`, "info");
      }
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
