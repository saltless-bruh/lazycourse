import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnPi, type PiHandle } from "./rpc-harness.js";
import { SIGNAL_PREFIX } from "../extensions/tutor/signals.js";

const T = 30000;
let pi: PiHandle | undefined;
afterEach(() => pi?.close());

describe("pi-tutor RPC contract", () => {
  it("answers get_state once started (readiness signal for the Neovim side)", async () => {
    pi = spawnPi(mkdtempSync(join(tmpdir(), "pitutor-")));
    pi.send({ id: "g1", type: "get_state" });
    const resp = await pi.waitFor((r) => r.type === "response" && r.id === "g1", T);
    expect(resp.success).toBe(true);
    expect(typeof (resp.data as { model?: unknown }).model).toBe("object");
  }, T);

  it("handles a signal envelope without starting a run", async () => {
    pi = spawnPi(mkdtempSync(join(tmpdir(), "pitutor-")));
    pi.send({ id: "s1", type: "prompt", message: SIGNAL_PREFIX + '{"type":"ping"}' });
    const resp = await pi.waitFor((r) => r.type === "response" && r.id === "s1", T);
    expect(resp.success).toBe(true);
    expect((resp.data as { disposition: string }).disposition).toBe("handled");
    const e = await pi.waitFor((r) => r.type === "entry_appended"
      && (r.entry as { data?: { kind?: string } }).data?.kind === "signal_received", T);
    expect((e.entry as { data: { signal: { type: string } } }).data.signal.type).toBe("ping");
    expect(pi.received.some((r) => r.type === "agent_start")).toBe(false);
  }, T);

  it("records a malformed envelope as handled without a run", async () => {
    pi = spawnPi(mkdtempSync(join(tmpdir(), "pitutor-")));
    pi.send({ id: "m1", type: "prompt", message: SIGNAL_PREFIX + "{bad" });
    const resp = await pi.waitFor((r) => r.type === "response" && r.id === "m1", T);
    expect((resp.data as { disposition: string }).disposition).toBe("handled");
    const e = await pi.waitFor((r) => r.type === "entry_appended"
      && (r.entry as { data?: { kind?: string } }).data?.kind === "signal_malformed", T);
    expect(e).toBeDefined();
    expect(pi.received.some((r) => r.type === "agent_start")).toBe(false);
  }, T);
});
