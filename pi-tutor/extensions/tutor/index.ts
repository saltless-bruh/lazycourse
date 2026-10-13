import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { NvimLink, type EditorSnapshot, type TutorPayload } from "./nvim.js";
import { renderWidget, renderStatus, type TutorState } from "./ui.js";
import { bandFor, startRung, thresholds, DEFAULT_LEVEL } from "./policy.js";
import { tutorPrompt, systemText } from "./prompts.js";
import { parseJudgment, toJudgment, isJudgmentTool, type Judgment } from "./judgment.js";
import { formatEditorContext, formatEpisodeContext } from "./context.js";
import { guardJudgment, checkReply, formatCheck, type Issue } from "./compliance.js";
import { StuckDetector, type StuckEvent } from "./stuck.js";
import { easeStart, episodeScore, yieldsTo, openEpisode, applyJudgment, closeEpisode, rebandEpisode, describeTrigger, type CloseReason, type Episode, type Trigger } from "./ladder.js";
import { guardToolCall, skillDirs } from "./guard.js";
import { Profile, type ProjectRow } from "./profile.js";
import { runStart } from "./start.js";
import { completeJson, type Complete } from "./llm.js";
import { withLoader, Cancelled, MODEL_TIMEOUT_MS, type CustomUi } from "./progress.js";
import { lastClosedEpisode, transcript, learnPrompt, checkLearned, renderLearned, parseSkillHeader, saveSkill, type Learned } from "./learn.js";
import { fetchReference, skillsRoot } from "./knowledge/reference.js";
import { overrideFor } from "./knowledge/sources.js";
import { LANGS, detectVersion } from "./knowledge/versions.js";

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
      if (typeof l === "number") level = l;
    }
  }
  return level;
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
async function withProgress<T>(ctx: ExtensionContext, label: string, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (ctx.mode !== "tui" || typeof ctx.ui.custom !== "function") return run(AbortSignal.timeout(MODEL_TIMEOUT_MS));
  const { BorderedLoader } = await import("@earendil-works/pi-coding-agent");
  const make = (tui: unknown, theme: unknown, message: string) => new BorderedLoader(tui as never, theme as never, message, { cancellable: true });
  return withLoader(ctx.ui.custom.bind(ctx.ui) as unknown as CustomUi, make, label, run, MODEL_TIMEOUT_MS);
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
  let profile: Profile | null = null;
  /** The recorded project this Pi runs in (cwd), if any: the source of the profile language. */
  let project: ProjectRow | null = null;
  /**
   * The agent run in flight (before_agent_start → turn_end…): the learner message it answers and
   * whether a judgment was already applied. One judgment per run: a model that "calls" tutor-judgment
   * and then writes the fence must not move the rung twice.
   */
  let run: { prompt: string; rung: number | null; judged: boolean } | null = null;
  /** Rule breaks in the last reply (spec 2026-10-13 §7 #2), quoted to the model on the next turn. */
  let lastIssues: Issue[] = [];
  const level = () => state.level ?? DEFAULT_LEVEL;
  // An editor trigger may open an episode when none is open, or replace one that yields (ladder.yieldsTo).
  const detector = new StuckDetector(() => thresholds(level()), () => yieldsTo(episode));

  function paint() {
    state.rung = episode ? episode.rung : startRung(bandFor(level()));
    state.state = episode ? `stuck: ${describeTrigger(episode.trigger)}` : signal;
    if (!ui) return;
    ui.setWidget("tutor", renderWidget(state));
    ui.setStatus("tutor", renderStatus(state));
  }

  function setLevel(n: number) {
    state.level = n;
    if (episode) {
      episode = rebandEpisode(episode, bandFor(n));
      pi.appendEntry("tutor_episode", episode);
    }
  }

  function openEp(trigger: Trigger, nudge: boolean) {
    if (episode) {
      // Chat, idle and churn episodes may never close on their own; editor triggers must not be lost behind them.
      if (!nudge || !yieldsTo(episode)) return;
      closeEp("superseded");
    }
    const now = Date.now();
    episode = openEpisode(trigger, bandFor(level()), now);
    pi.appendEntry("tutor_episode", episode);
    // Spec §4 "Intervenes": one nudge per editor-triggered episode, never on top of a running
    // reply, and at most one per NUDGE_GAP_MS so a run of changing errors is not a run of turns.
    if (nudge && session?.isIdle() && now - lastNudge >= NUDGE_GAP_MS) {
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
      rungs_used: closed.rung - startRung(closed.band) + 1,
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
    session = ctx;
    ui = ctx.hasUI ? ctx.ui : null;
    if (!profile) {
      try { profile = Profile.open(); } catch (e) { ctx.ui.notify(`tutor profile unavailable: ${e instanceof Error ? e.message : String(e)}`, "warning"); }
    }
    const proj = profile?.projectAt(realCwd(ctx.cwd));
    project = proj ?? null;
    if (proj) state.language = proj.language;
    state.level = restoreLevel(ctx) ?? (proj ? profile?.language(proj.language)?.level : undefined) ?? DEFAULT_LEVEL;
    episode = restoreEpisode(ctx);
    if (episode) detector.adopt(episode.trigger, Date.now());
    if (!link) {
      link = await NvimLink.connect({
        root: ctx.cwd,
        onPayload,
        onDisconnect: () => { state.connected = false; link = null; paint(); },
      });
      state.connected = link !== null;
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
    event.systemPromptOptions.sections["tutor"] = tutorPrompt(band);
    // A learner's chat message opens an episode; our own [tutor] nudges do not.
    if (!episode && !event.prompt.startsWith(TUTOR_PREFIX)) { openEp({ kind: "chat" }, false); paint(); }
    run = { prompt: event.prompt, rung: episode ? episode.rung : null, judged: false };
    let snap: EditorSnapshot | null = null;
    if (link) {
      try { snap = await link.snapshot(band === "beginner" ? "full" : "window"); } catch { snap = null; }
    }
    if (snap?.filetype) { state.language = snap.filetype; paint(); }
    const parts: string[] = [];
    if (episode) parts.push(formatEpisodeContext(episode));
    if (lastIssues.length) parts.push(formatCheck(lastIssues));
    if (snap) parts.push(formatEditorContext(snap));
    if (parts.length === 0) return;
    return { message: { customType: "tutor_editor", content: parts.join("\n\n"), display: false, details: { band, path: snap?.path, episode: episode?.id } } };
  });

  /** Apply one accepted judgment to the episode and the profile (spec §5). */
  function applyTurnJudgment(j: Judgment) {
    state.last = j.judgment;
    pi.appendEntry("tutor_judgment", j);
    if (!episode) return;
    if (episode.turns === 0 && project && profile) {
      let known = new Map<string, number>();
      const p = profile, lang = project.language;
      profileWrite(() => { known = new Map(p.concepts(lang).map((c) => [c.tag, c.ease])); });
      episode = easeStart(episode, j.concept_tags, (t) => known.get(t));
    }
    episode = applyJudgment(episode, j, Date.now());
    pi.appendEntry("tutor_episode", episode);
    if (episode.closed !== undefined) { mirror(episode); episode = null; signal = "episode closed (judged)"; }
  }

  // Spec §5: take the judgment (fence, fallback, or invented tool call) and apply it once per run.
  pi.on("turn_end", async (event) => {
    const m = event.message;
    if (m.role !== "assistant") return;
    // Aborted, errored and truncated turns carry no judgment.
    if (m.stopReason === "aborted" || m.stopReason === "error" || m.stopReason === "length") return;
    const cur = run ?? (run = { prompt: "", rung: episode ? episode.rung : null, judged: false });
    let callArgs: unknown;
    for (const c of m.content) if (c.type === "toolCall" && isJudgmentTool(c.name)) callArgs = c.arguments;
    const final = m.stopReason === "stop" && !m.content.some((c) => c.type === "toolCall");
    const text = m.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("\n");
    const j = callArgs !== undefined ? toJudgment(callArgs) : final ? parseJudgment(text) : null;
    if (j && !cur.judged) { cur.judged = true; applyTurnJudgment(guardJudgment(j, cur.prompt)); }
    if (final) {
      if (!cur.judged) state.last = "missing";
      lastIssues = checkReply(text, { band: bandFor(level()), rung: cur.rung, judged: cur.judged, noCode: bandFor(level()) === "pro" });
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
        fetchReference(language, { fetch, root: skillsRoot(), installed, devdocsType: spec.devdocsType, override: overrideFor(language), force, signal }));
      const note = r.meta.note ? ` — ${r.meta.note}` : "";
      ctx.ui.notify(r.status === "cached"
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
      const language = (args.trim() || project?.language || state.language || "").toLowerCase();
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
      const language = project?.language ?? (state.language && /^[a-z0-9]+$/.test(state.language) ? state.language : "general");
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
