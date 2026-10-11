import { describe, it, expect } from "vitest";
import { parseSignalEnvelope, handleInput, SIGNAL_PREFIX } from "../extensions/tutor/signals.js";

describe("parseSignalEnvelope", () => {
  it("returns not_signal for ordinary chat", () => {
    expect(parseSignalEnvelope("how do I use a for loop")).toEqual({ kind: "not_signal" });
  });
  it("parses a valid envelope", () => {
    const r = parseSignalEnvelope(SIGNAL_PREFIX + '{"type":"ping","n":1}');
    expect(r).toEqual({ kind: "signal", signal: { type: "ping", n: 1 } });
  });
  it("rejects an envelope with no type field", () => {
    const r = parseSignalEnvelope(SIGNAL_PREFIX + '{"n":1}');
    expect(r.kind).toBe("malformed");
  });
  it("rejects invalid JSON", () => {
    const r = parseSignalEnvelope(SIGNAL_PREFIX + "{not json");
    expect(r.kind).toBe("malformed");
  });
  it("does not treat a prefix in the middle of text as a signal", () => {
    expect(parseSignalEnvelope("hello " + SIGNAL_PREFIX + "{}")).toEqual({ kind: "not_signal" });
  });
});

describe("handleInput", () => {
  it("continues for ordinary chat without appending entries", () => {
    const entries: unknown[] = [];
    const r = handleInput("hello", (t, d) => entries.push([t, d]));
    expect(r).toEqual({ action: "continue" });
    expect(entries).toEqual([]);
  });
  it("marks a valid signal handled and records it", () => {
    const entries: [string, unknown][] = [];
    const r = handleInput(SIGNAL_PREFIX + '{"type":"ping"}', (t, d) => entries.push([t, d]));
    expect(r).toEqual({ action: "handled" });
    expect(entries).toEqual([["tutor_status", { kind: "signal_received", signal: { type: "ping" } }]]);
  });
  it("marks a malformed envelope handled and records the error, never continuing", () => {
    const entries: [string, unknown][] = [];
    const r = handleInput(SIGNAL_PREFIX + "{bad", (t, d) => entries.push([t, d]));
    expect(r).toEqual({ action: "handled" });
    expect(entries[0][0]).toBe("tutor_status");
    expect((entries[0][1] as { kind: string }).kind).toBe("signal_malformed");
  });
});
