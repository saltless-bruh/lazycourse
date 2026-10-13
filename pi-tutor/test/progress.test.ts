import { describe, it, expect } from "vitest";
import { withLoader, Cancelled, MODEL_TIMEOUT_MS, type LoaderLike, type CustomUi } from "../extensions/tutor/progress.js";

describe("MODEL_TIMEOUT_MS", () => {
  it("allows 10 minutes: the live scaffold call on z-ai/glm-5.3-flash ran past 180 s (2026-10-12); Esc still cancels", () => {
    expect(MODEL_TIMEOUT_MS).toBe(600_000);
  });
});

/** A ctx.ui.custom stand-in: runs the factory, keeps the component, records done(). */
function fakeCustom() {
  const state: { loader?: FakeLoader; done: number } = { done: 0 };
  const custom: CustomUi = (factory) => new Promise((resolve) => {
    state.loader = factory({}, {}, {}, (r) => { state.done++; resolve(r); }) as FakeLoader;
  });
  return { custom, state };
}
class FakeLoader implements LoaderLike {
  private ctl = new AbortController();
  onAbort?: () => void;
  constructor(readonly message: string) {}
  get signal() { return this.ctl.signal; }
  /** What Pi's CancellableLoader does on Esc. */
  esc() { this.ctl.abort(); this.onAbort?.(); }
}
const make = (_tui: unknown, _theme: unknown, message: string) => new FakeLoader(message);

describe("withLoader (final review I1)", () => {
  it("shows the message, returns the run result and dismisses the loader", async () => {
    const { custom, state } = fakeCustom();
    expect(await withLoader(custom, make, "tutor: writing the spec…", async () => "ok", 1000)).toBe("ok");
    expect(state.loader?.message).toBe("tutor: writing the spec… (Esc cancels)");
    expect(state.done).toBe(1);
  });
  it("Esc aborts the run's signal and rejects with Cancelled", async () => {
    const { custom, state } = fakeCustom();
    let seen: AbortSignal | undefined;
    const p = withLoader(custom, make, "m", (signal) => { seen = signal; return new Promise<string>(() => {}); }, 10_000);
    await new Promise((r) => setTimeout(r, 0));
    state.loader!.esc();
    await expect(p).rejects.toBeInstanceOf(Cancelled);
    expect(seen?.aborted).toBe(true);
    expect(state.done).toBe(1);
  });
  it("times out a call that never returns", async () => {
    const { custom, state } = fakeCustom();
    const p = withLoader(custom, make, "m", (signal) => new Promise<string>((_, rej) => signal.addEventListener("abort", () => rej(new Error("aborted")))), 30);
    await expect(p).rejects.toThrow(/timed out/);
    expect(state.done).toBe(1);
  });
  it("rejects instead of hanging when the loader cannot be built", async () => {
    const { custom } = fakeCustom();
    const broken = () => { throw new Error("Theme not initialized"); };
    await expect(withLoader(custom, broken, "m", async () => "never", 1000)).rejects.toThrow("Theme not initialized");
  });
  it("passes a run's own error through", async () => {
    const { custom } = fakeCustom();
    await expect(withLoader(custom, make, "m", async () => { throw new Error("401 unauthorized"); }, 1000)).rejects.toThrow("401 unauthorized");
  });
});

describe("M6c: timeout wording (M5 #41)", () => {
  it("names what timed out", async () => {
    const { custom } = fakeCustom();
    const p = withLoader(custom, make, "m", (signal) => new Promise<string>((_, rej) => signal.addEventListener("abort", () => rej(new Error("aborted")))), 1000, "docs download");
    await expect(p).rejects.toThrow("docs download timed out after 1s");
  });
});
