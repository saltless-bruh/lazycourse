import { describe, it, expect } from "vitest";
import { repliesOf } from "../golden/harness.js";

// Event shapes recorded from `pi -p --mode json` 1.1.0 (2026-10-13).
const ev = (o: unknown) => JSON.stringify(o);
const text = (t: string) => ev({ type: "message_end", message: { role: "assistant", content: [{ type: "thinking", thinking: "…" }, { type: "text", text: t }] } });

describe("golden harness: repliesOf", () => {
  it("takes the last non-empty assistant text of each agent run", () => {
    const out = [
      ev({ type: "session" }), ev({ type: "agent_start" }),
      ev({ type: "message_end", message: { role: "user", content: [{ type: "text", text: "q" }] } }),
      text("reading the file"), ev({ type: "message_end", message: { role: "assistant", content: [{ type: "toolCall", name: "read" }] } }),
      text("first reply"), ev({ type: "agent_end" }),
      "not json", ev({ type: "agent_start" }), text("second reply"), ev({ type: "agent_end" }),
    ].join("\n");
    expect(repliesOf(out)).toEqual(["first reply", "second reply"]);
  });
  it("a run without assistant text yields an empty reply, not the previous one", () => {
    expect(repliesOf([text("a"), ev({ type: "agent_end" }), ev({ type: "agent_end" })].join("\n"))).toEqual(["a", ""]);
  });
});
