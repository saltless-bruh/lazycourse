import { describe, it, expect } from "vitest";
import { whereOf, nextStep, sessionCard, type WayInput, type Where } from "../extensions/tutor/wayfinding.js";
import { describe as describeCmd } from "../extensions/tutor/commands.js";

// Wayfinding spec 2026-11-08 §7: the next step is worked out by code from the extension's state.
const none: WayInput = { firstRun: false, tour: null, onboarding: null, spec: null, project: false, recipe: null, stuck: false, passingTask: null, lesson: null, exam: false, stepUp: false };
const ob = (o: Partial<NonNullable<WayInput["onboarding"]>>) => ({ stage: "talk" as const, paused: false, levelTaskOpen: false, dialog: false, elsewhere: null, ...o });

const rows: [string, Partial<WayInput>, Where, RegExp][] = [
  ["fresh", { firstRun: true }, "fresh", /:TutorTour/],
  ["tour", { firstRun: true, tour: { step: 4, total: 18, title: "Delete with x" } }, "tour", /4\/18.*Delete with x/],
  ["onboarding talk", { onboarding: ob({}) }, "onboarding-talk", /answer the tutor/],
  ["level task", { onboarding: ob({ stage: "check", levelTaskOpen: true }) }, "level-task", /\/tutor-start check/],
  ["dialog", { onboarding: ob({ stage: "read", dialog: true }) }, "onboarding-dialog", /dialog/],
  ["elsewhere", { onboarding: ob({ stage: "choose", elsewhere: "/home/x/p" }) }, "project-elsewhere", /\/home\/x\/p/],
  ["paused", { onboarding: ob({ paused: true }) }, "onboarding-paused", /\/tutor-start/],
  // Live check 2026-11-09: in the new project folder the tutor asks build-or-learn; the line said /tutor-plan.
  ["choose here", { project: true, onboarding: ob({ stage: "choose" }) }, "onboarding-talk", /answer the tutor/],
  ["plan writing", { project: true, spec: "writing" }, "plan-writing", /plan is being written/],
  ["plan failed", { project: true, spec: "failed" }, "plan-failed", /\/tutor-start spec/],
  ["project", { project: true }, "project", /\/tutor-plan/],
  ["recipe", { project: true, recipe: { task: "P1.T1", step: 2, action: "the examples" } }, "recipe", /step 2.*skip/],
  ["stuck", { project: true, stuck: true }, "stuck", /:TutorRun test.*<leader>ts/],
  ["checks pass", { project: true, passingTask: "P1.T2" }, "checks-pass", /:TutorDone P1\.T2/],
  // Live 2026-11-09: "next: /tutor-lesson next, or check" while no exercise file existed; the learner did not know
  // the tutor writes it and looked for a way to make a .py file. One step at a time, the one that comes next.
  ["lesson, no exercise yet", { project: true, lesson: { step: "get" } }, "lesson", /\/tutor-lesson next.*exercise/],
  ["lesson, exercise written", { project: true, lesson: { step: "write" } }, "lesson", /\/tutor-lesson check/],
  ["lesson, concept without exercise", { project: true, lesson: { step: "none" } }, "lesson", /\/tutor-lesson skip/],
  ["lesson, building", { project: true, lesson: { step: "build" } }, "lesson", /\/tutor-lesson next/],
  ["exam", { project: true, exam: true, stuck: true }, "exam", /\/tutor-submit/],
  ["step-up", { project: true, stepUp: true }, "step-up", /\/tutor-step-up/],
];

describe("next step per state", () => {
  it.each(rows)("%s", (_n, input, where, text) => {
    const i = { ...none, ...input };
    expect(whereOf(i)).toBe(where);
    expect(nextStep(i)).toMatch(/^next: /);
    expect(nextStep(i)).toMatch(text);
  });

  it("a lesson's line names one command, never two", () => {
    expect(nextStep({ ...none, project: true, lesson: { step: "get" } })).not.toMatch(/check/);
    expect(nextStep({ ...none, project: true, lesson: { step: "write" } })).not.toMatch(/lesson next/);
  });

  it("fits the widget's 44 columns, so the command is never clipped", () => {
    for (const [n, input] of rows) if (n !== "elsewhere" && n !== "tour") expect(nextStep({ ...none, ...input }).length, n).toBeLessThanOrEqual(44);
  });

  it("every command nextStep names is in the list", () => {
    for (const [, input] of rows) {
      for (const m of nextStep({ ...none, ...input }).match(/\/tutor-[\w-]+|:Tutor\w*|<leader>\S+/g) ?? []) {
        expect(() => describeCmd(m.replace(/[.,;)]+$/, "")), m).not.toThrow();
      }
    }
  });
});

describe("session card", () => {
  it("has three lines: where, next, help", () => {
    for (const input of [{ firstRun: true }, { onboarding: ob({}) }, { project: true }] as Partial<WayInput>[]) {
      const lines = sessionCard({ ...none, ...input }, { tourOffered: false }).split("\n");
      expect(lines).toHaveLength(3);
      expect(lines[0]).toMatch(/^Where you are: /);
      expect(lines[1]).toMatch(/^Next: /);
      expect(lines[2]).toMatch(/^Help: <leader>t\? in the editor · \/tutor-help in this pane · :TutorTour/);
    }
  });
  it("names the project, task and level when known", () => {
    expect(sessionCard({ ...none, project: true }, { project: "Guess Number", task: "P1.T2", level: 14, tourOffered: false })).toMatch(/Where you are: project Guess Number · task P1\.T2 · level 14/);
  });
  it("a first run offers the tour", () => {
    expect(sessionCard({ ...none, firstRun: true }, { tourOffered: true }).split("\n")[0]).toMatch(/new here — :TutorTour teaches Neovim and the tutor, or just tell me what you'd like to learn/);
  });
  it("onboarding says its stage", () => {
    expect(sessionCard({ ...none, onboarding: ob({ stage: "check", levelTaskOpen: true }) }, { tourOffered: false })).toMatch(/Where you are: onboarding \(check\)/);
  });
});
