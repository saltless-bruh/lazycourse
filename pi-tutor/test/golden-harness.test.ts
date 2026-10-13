import { describe, it, expect } from "vitest";
import { repliesOf, runsOf } from "../golden/harness.js";

// Event shapes recorded from `pi -p --mode json` 1.1.0 (2026-10-13).
const ev = (o: unknown) => JSON.stringify(o);
const text = (t: string) => ev({ type: "message_end", message: { role: "assistant", content: [{ type: "thinking", thinking: "…" }, { type: "text", text: t }] } });
const call = (name: string, args: unknown = {}) => ev({ type: "message_end", message: { role: "assistant", content: [{ type: "toolCall", name, arguments: args }] } });

describe("golden harness", () => {
  it("repliesOf: the last non-empty assistant text of each run", () => {
    const out = [ev({ type: "agent_start" }), text("reading"), call("read"), text("first"), ev({ type: "agent_end" }), "not json", text("second"), ev({ type: "agent_end" })].join("\n");
    expect(repliesOf(out)).toEqual(["first", "second"]);
  });
  it("a run without text yields an empty reply, not the previous one", () => {
    expect(repliesOf([text("a"), ev({ type: "agent_end" }), ev({ type: "agent_end" })].join("\n"))).toEqual(["a", ""]);
  });
  it("runsOf: tools called and the first judgment in the run, as production takes it", () => {
    const fence = "```tutor-judgment\n{\"judgment\":\"partial\"}\n```";
    const out = [text("look\n" + fence), call("tutor_remember", { type: "learner", text: "x" }), text("done"), ev({ type: "agent_end" })].join("\n");
    expect(runsOf(out)).toEqual([{ reply: "done", judgment: expect.objectContaining({ judgment: "partial" }), tools: ["tutor_remember"] }]);
  });
});
