import { describe, it, expect } from "vitest";
import extension from "../extensions/tutor/index.js";

describe("extension factory", () => {
  it("registers session_start and session_shutdown handlers and no input handler", () => {
    const events: string[] = [];
    const fakePi = {
      on: (name: string, _h: unknown) => { events.push(name); return () => {}; },
      registerCommand: () => {},
      appendEntry: () => {},
    };
    extension(fakePi as never);
    expect(events).toContain("session_start");
    expect(events).toContain("session_shutdown");
    expect(events).not.toContain("input");
  });
});
