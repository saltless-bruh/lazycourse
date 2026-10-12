import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { NvimLink, type TutorPayload } from "./nvim.js";
import { renderWidget, renderStatus, type TutorState } from "./ui.js";
import { bandFor, startRung, DEFAULT_LEVEL } from "./policy.js";
import { bandPrompt } from "./prompts.js";
import { parseJudgment } from "./judgment.js";
import { formatEditorContext } from "./context.js";

type Ui = ExtensionContext["ui"];

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

export default function (pi: ExtensionAPI): void {
  const state: TutorState = { state: "idle", connected: false };
  let link: NvimLink | null = null;
  let ui: Ui | null = null;

  function paint() {
    if (!ui) return;
    ui.setWidget("tutor", renderWidget(state));
    ui.setStatus("tutor", renderStatus(state));
  }

  function setLevel(level: number) {
    state.level = level;
    state.rung = startRung(bandFor(level));
  }

  function onPayload(p: TutorPayload) {
    // M3 replaces this with the stuck detector; for now reflect the latest signal.
    switch (p.kind) {
      case "diagnostics":
        state.state = p.errors > 0 ? `error: ${p.first?.msg ?? ""}` : p.warnings > 0 ? `${p.warnings} warning(s)` : "clean";
        break;
      case "idle": state.state = `idle ${Math.round(p.since_ms / 1000)}s`; break;
      case "churn": state.state = `churning lines ${p.region[0]}-${p.region[1]}`; break;
      case "run_output": state.state = p.code === 0 ? "run passed" : `run failed (exit ${p.code})`; break;
    }
    pi.appendEntry("tutor_signal", p);
    paint();
  }

  pi.on("session_start", async (_event, ctx) => {
    ui = ctx.hasUI ? ctx.ui : null;
    setLevel(restoreLevel(ctx) ?? DEFAULT_LEVEL);
    if (!link) {
      link = await NvimLink.connect({
        root: ctx.cwd,
        onPayload,
        onDisconnect: () => { state.connected = false; link = null; paint(); },
      });
      state.connected = link !== null;
    }
    paint();
  });

  pi.on("session_shutdown", async () => {
    await link?.close();
    link = null;
    state.connected = false;
  });

  // Spec §4: select the band prompt section and pull band-scoped editor context for this turn.
  pi.on("before_agent_start", async (event) => {
    const band = bandFor(state.level ?? DEFAULT_LEVEL);
    event.systemPromptOptions.sections["tutor"] = bandPrompt(band);
    if (!link) return;
    let snap = null;
    try { snap = await link.snapshot(band === "beginner" ? "full" : "window"); } catch { snap = null; }
    if (!snap) return;
    if (snap.filetype) { state.language = snap.filetype; paint(); }
    return { message: { customType: "tutor_editor", content: formatEditorContext(snap), display: false, details: { band, path: snap.path } } };
  });

  // Spec §5: parse the trailing tutor-judgment block. Ladder application lands in M3.
  pi.on("turn_end", async (event) => {
    const m = event.message;
    if (m.role !== "assistant") return;
    if (m.content.some((c) => c.type === "toolCall")) return;
    const text = m.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("\n");
    const j = parseJudgment(text);
    state.last = j ? j.judgment : "missing";
    if (j) pi.appendEntry("tutor_judgment", j);
    paint();
  });

  pi.registerCommand("tutor-level", {
    description: "Set the tutor level 0-100 (beginner → pro)",
    handler: async (args, ctx) => {
      const n = Number(args.trim());
      if (!Number.isInteger(n) || n < 0 || n > 100) {
        ctx.ui.notify("usage: /tutor-level <0-100>", "warning");
        return;
      }
      setLevel(n);
      pi.appendEntry("tutor_level", { level: n });
      paint();
      ctx.ui.notify(`tutor level set to ${n} (${bandFor(n)})`, "info");
    },
  });

  pi.registerCommand("tutor-status", {
    description: "Show the tutor's current state",
    handler: async (_args, ctx) => {
      ctx.ui.notify(renderWidget(state).join(" | "), "info");
    },
  });
}
