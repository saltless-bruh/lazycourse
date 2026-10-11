import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { NvimLink, type TutorPayload } from "./nvim.js";
import { renderWidget, renderStatus, type TutorState } from "./ui.js";

type Ui = ExtensionContext["ui"];

export default function (pi: ExtensionAPI): void {
  const state: TutorState = { state: "idle", connected: false };
  let link: NvimLink | null = null;
  let ui: Ui | null = null;

  function paint() {
    if (!ui) return;
    ui.setWidget("tutor", renderWidget(state));
    ui.setStatus("tutor", renderStatus(state));
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

  pi.registerCommand("tutor-level", {
    description: "Set the tutor level 0-100 (beginner → pro)",
    handler: async (args, ctx) => {
      const n = Number(args.trim());
      if (!Number.isInteger(n) || n < 0 || n > 100) {
        ctx.ui.notify("usage: /tutor-level <0-100>", "warning");
        return;
      }
      state.level = n;
      paint();
      ctx.ui.notify(`tutor level set to ${n}`, "info");
    },
  });

  pi.registerCommand("tutor-status", {
    description: "Show the tutor's current state",
    handler: async (_args, ctx) => {
      ctx.ui.notify(renderWidget(state).join(" | "), "info");
    },
  });
}
