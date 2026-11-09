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

import { editorCommandOf } from "../extensions/tutor/commands.js";
describe("editorCommandOf (2026-11-09: :TutorTour typed into the pane reached the model)", () => {
  it.each([
    [":TutorTour", { name: "TutorTour", args: [] }],
    ["  :TutorRun test  ", { name: "TutorRun", args: ["test"] }],
    [":TutorDone P1.T2 anyway", { name: "TutorDone", args: ["P1.T2", "anyway"] }],
    [":TutorStart python", { name: "TutorStart", args: ["python"] }],
    [":TutorLevel 40", { name: "TutorLevel", args: ["40"] }],
    [":TutorExam small", { name: "TutorExam", args: ["small"] }],
    [":TutorExam sandbox on", { name: "TutorExam", args: ["sandbox", "on"] }],
    [":TutorArchitect off", { name: "TutorArchitect", args: ["off"] }],
    // Review 2026-11-09 #1: words the command does not take make the line a question for the tutor.
    [":TutorExam what is this for?", null],
    [":TutorStart over please", null],
    [":TutorDone says it's not done, why?", null],
    [":TutorLevel 400", null],
    [":TutorArchitect what about caching", null],
    [":TutorTour restart | let g:bad = 1", null],
    [":TutorHelp foo", null],
    [":TutorBogus", null],
    [":w", null],
    ["what does :TutorRun do?", null],
    ["/tutor-start", null],
  ])("%j", (text, want) => expect(editorCommandOf(text)).toEqual(want));
});

describe("the pane's input handler (review 2026-11-09 #1)", () => {
  it("only a line the learner typed runs as a Neovim command; text from an extension or rpc goes on", async () => {
    const { pi, events } = fakePi() as unknown as { pi: unknown; events: Record<string, (e: unknown, c: unknown) => Promise<unknown>> };
    extension(pi as never);
    const notes: string[] = [];
    const ctx = { ui: { notify: (m: string) => notes.push(m) } };
    for (const source of ["extension", "rpc"]) expect(await events["input"]({ type: "input", text: ":TutorTour", source }, ctx)).toBeUndefined();
    expect(await events["input"]({ type: "input", text: ":TutorTour", source: "interactive" }, ctx)).toEqual({ action: "handled" });
    expect(notes.at(-1)).toMatch(/Neovim command/);
  });
});
