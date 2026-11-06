import { describe, it, expect } from "vitest";
import { questionTask, directionEvent, questionEvent, readsErrorEvent, smallRunEvent, ownFixEvent, stepsFirstEvent, ideasToCodeEvent, looksUpEvent, changedLines } from "../extensions/tutor/habit-events.js";

describe("habit detectors (spec 2026-10-26 §3): good, miss, or nothing", () => {
  it("right direction: more checks pass, or a crash becomes a wrong value", () => {
    expect(directionEvent({ passed: 0, total: 2, crashed: false }, { passed: 1, total: 2, crashed: false })).toBe(true);
    expect(directionEvent({ passed: 0, total: 2, crashed: true }, { passed: 0, total: 2, crashed: false })).toBe(true);
    expect(directionEvent({ passed: 1, total: 2, crashed: false }, { passed: 0, total: 2, crashed: false })).toBe(false);
    expect(directionEvent({ passed: 1, total: 2, crashed: false }, { passed: 0, total: 2, crashed: true })).toBe(false);
    expect(directionEvent({ passed: 1, total: 2, crashed: false }, { passed: 1, total: 2, crashed: false })).toBeNull();
  });
  it("right question: judged by the next try on that spot; a repeat is a miss", () => {
    expect(questionEvent({ closer: true }, false)).toBe(true);
    expect(questionEvent({ closer: false }, false)).toBe(false);
    expect(questionEvent(null, true)).toBe(false);
    expect(questionEvent(null, false)).toBeNull();
  });
  it("reads errors: the right-click ask after the error was on screen ≥ 5 s; a chat question with an error open is a miss", () => {
    expect(readsErrorEvent({ shownMs: 8000 }, false)).toBe(true);
    expect(readsErrorEvent({ shownMs: 1200 }, false)).toBe(false);
    expect(readsErrorEvent({ shownMs: null }, false)).toBe(false);
    expect(readsErrorEvent(null, true)).toBe(false);
    expect(readsErrorEvent(null, false)).toBeNull();
  });
  it("small runs: 15 changed lines or fewer between runs", () => {
    expect(smallRunEvent(3)).toBe(true);
    expect(smallRunEvent(15)).toBe(true);
    expect(smallRunEvent(40)).toBe(false);
    expect(smallRunEvent(0)).toBeNull();
  });
  it("changedLines counts lines added, removed or edited", () => {
    expect(changedLines("a\nb\nc\n", "a\nB\nc\n")).toBe(1);
    expect(changedLines("a\n", "a\nb\nc\n")).toBe(2);
    expect(changedLines("", "x\ny\n")).toBe(2);
    expect(changedLines("same\n", "same\n")).toBe(0);
  });
  it("own fixes, steps first, ideas to code, looks up", () => {
    expect(ownFixEvent("checks")).toBe(true);
    expect(ownFixEvent("fix-step")).toBe(false);
    expect(stepsFirstEvent(3)).toBe(true);
    expect(stepsFirstEvent(1)).toBe(false);
    expect(ideasToCodeEvent(true, true)).toBe(true);
    expect(ideasToCodeEvent(true, false)).toBe(false);
    expect(ideasToCodeEvent(false, true)).toBeNull();
    expect(looksUpEvent(true)).toBe(true);
    expect(looksUpEvent(false)).toBeNull();
  });
});

describe("final review I2: right direction compares only the same checks", () => {
  it("a different set of checks resets the comparison", () => {
    expect(directionEvent({ passed: 0, total: 1, crashed: false, key: "a" }, { passed: 2, total: 4, crashed: false, key: "a|b|c|d" })).toBeNull();
    expect(directionEvent({ passed: 0, total: 2, crashed: false, key: "a|b" }, { passed: 1, total: 2, crashed: false, key: "a|b" })).toBe(true);
  });
});

describe("questionTask (Phase 8 A12): which task a question is about", () => {
  const fns = new Map([["split_amount", ["P2.T2"]], ["print_total", ["P2.T3"]], ["shared", ["P2.T2", "P2.T3"]]]);
  const open = new Set(["P2.T2", "P2.T3"]);
  it("the episode's task, unless the question names another open task or only its functions", () => {
    expect(questionTask("why does split_amount give 144?", "P2.T2", open, fns)).toBe("P2.T2");
    expect(questionTask("how do I start P2.T3?", "P2.T2", open, fns)).toBe("P2.T3");
    expect(questionTask("what should print_total print?", "P2.T2", open, fns)).toBe("P2.T3");
    expect(questionTask("does print_total call split_amount?", "P2.T2", open, fns)).toBe("P2.T2");
    expect(questionTask("is shared right?", "P2.T2", open, fns)).toBe("P2.T2");
    expect(questionTask("what about P9.T9?", "P2.T2", open, fns)).toBeNull(); // a task that is not open: no credit anywhere
    expect(questionTask("I think it works.", "P2.T2", open, fns)).toBeNull(); // no question
    expect(questionTask("why?", null, open, fns)).toBeNull();
  });
});
