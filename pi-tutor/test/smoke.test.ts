import { describe, it, expect } from "vitest";
import extension from "../extensions/tutor/index.js";

describe("extension factory", () => {
  it("registers an input handler and a session_start handler", () => {
    const events: string[] = [];
    const fakePi = {
      on: (name: string, _h: unknown) => { events.push(name); return () => {}; },
      appendEntry: () => {},
    };
    extension(fakePi as never);
    expect(events).toContain("input");
    expect(events).toContain("session_start");
  });
});
