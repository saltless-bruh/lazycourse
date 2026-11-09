import { describe, it, expect } from "vitest";
import { parseQuiet, quietLeft, quietLabel, QUIET_KEY, QUIET_CHOICES } from "../extensions/tutor/quiet.js";

// Ask-first spec 2026-11-09: notices off for 1m/5m/10m/1h, or until turned on.
describe("quiet mode", () => {
  it("parses the six choices and nothing else", () => {
    expect(QUIET_KEY).toBe("quiet");
    expect([...QUIET_CHOICES]).toEqual(["1m", "5m", "10m", "1h", "off", "on"]);
    expect(parseQuiet("1m", 0)).toEqual({ until: 60_000 });
    expect(parseQuiet("5m", 0)).toEqual({ until: 300_000 });
    expect(parseQuiet("10m", 1000)).toEqual({ until: 601_000 });
    expect(parseQuiet("1h", 0)).toEqual({ until: 3_600_000 });
    expect(parseQuiet("off", 0)).toEqual({ always: true });
    expect(parseQuiet(" ON ", 0)).toBe("on");
    expect(parseQuiet("7m", 0)).toBeNull();
    expect(parseQuiet("", 0)).toBeNull();
  });
  it("time left: until the end, always, or on", () => {
    expect(quietLeft('{"until":300000}', 60_000)).toBe(240_000);
    expect(quietLeft('{"until":300000}', 300_000)).toBeNull();
    expect(quietLeft('{"always":true}', 9e12)).toBe("always");
    expect(quietLeft(undefined, 0)).toBeNull();
    expect(quietLeft("junk", 0)).toBeNull();
  });
  it("labels round minutes up", () => {
    expect(quietLabel(240_000)).toBe("notices off 4m");
    expect(quietLabel(1)).toBe("notices off 1m");
    expect(quietLabel("always")).toBe("notices off");
  });
});
