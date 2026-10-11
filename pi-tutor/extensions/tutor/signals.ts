export const SIGNAL_PREFIX = "@@tutor-signal ";

export type Signal = { type: string; [k: string]: unknown };

export type ParseResult =
  | { kind: "not_signal" }
  | { kind: "signal"; signal: Signal }
  | { kind: "malformed"; error: string };

export type InputEventResult =
  | { action: "continue" }
  | { action: "transform"; text: string }
  | { action: "handled" };

export type AppendEntry = (customType: string, data?: unknown) => void;

export function parseSignalEnvelope(text: string): ParseResult {
  if (!text.startsWith(SIGNAL_PREFIX)) return { kind: "not_signal" };
  const body = text.slice(SIGNAL_PREFIX.length);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    return { kind: "malformed", error: `invalid JSON: ${(e as Error).message}` };
  }
  if (typeof parsed !== "object" || parsed === null || typeof (parsed as Signal).type !== "string") {
    return { kind: "malformed", error: "envelope must be an object with a string `type`" };
  }
  return { kind: "signal", signal: parsed as Signal };
}

export function handleInput(text: string, appendEntry: AppendEntry): InputEventResult {
  const r = parseSignalEnvelope(text);
  switch (r.kind) {
    case "not_signal":
      return { action: "continue" };
    case "signal":
      appendEntry("tutor_status", { kind: "signal_received", signal: r.signal });
      return { action: "handled" };
    case "malformed":
      appendEntry("tutor_status", { kind: "signal_malformed", error: r.error });
      return { action: "handled" };
  }
}
