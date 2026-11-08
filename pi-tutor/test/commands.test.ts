import { describe, it, expect } from "vitest";
import { fakePi } from "./fake-pi.js";
import extension from "../extensions/tutor/index.js";
import { loadCommands, describe as describeCmd, commandNote } from "../extensions/tutor/commands.js";

// Wayfinding spec §6: one list describes every command; a command registered but missing (or the reverse) fails here.
describe("the command list", () => {
  const live = () => loadCommands().filter((c) => !c.planned);

  it("every Pi command is in the list and the list names no unknown one", () => {
    const { pi, commands } = fakePi();
    extension(pi as never);
    const listed = live().filter((c) => c.where === "pane" && !c.builtin).map((c) => c.name.slice(1)).sort();
    expect(Object.keys(commands).sort()).toEqual(listed);
  });

  it("every description comes from the list", () => {
    const { pi, commands } = fakePi();
    extension(pi as never);
    for (const [name, def] of Object.entries(commands)) {
      expect((def as unknown as { description: string }).description).toBe(describeCmd(`/${name}`));
    }
  });

  it("an unknown name throws, so a typo fails at load", () => {
    expect(() => describeCmd("/tutor-nope")).toThrow(/tutor-nope/);
  });

  it("every entry says what it is for and explains itself in full", () => {
    for (const c of loadCommands()) {
      expect(c.for.length, c.name).toBeGreaterThan(5);
      expect(c.help.length, c.name).toBeGreaterThan(c.for.length - 1);
    }
  });

  it("commandNote names where each command is typed", () => {
    const note = commandNote("stuck");
    expect(note).toMatch(/:TutorRun[^\n]*editor/);
    expect(commandNote("project")).toMatch(/\/tutor-plan[^\n]*tutor pane/);
    expect(commandNote("recipe")).toMatch(/"skip"[^\n]*`off` to stop/);
  });
});

describe("the README", () => {
  it("names every command and key in the list (wayfinding spec §6)", async () => {
    const { readFileSync } = await import("node:fs");
    const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
    const missing = loadCommands().filter((c) => !readme.includes(`\`${c.name}`)).map((c) => c.name);
    expect(missing).toEqual([]);
  });
});
