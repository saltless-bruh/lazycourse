import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { basename, dirname } from "node:path";

// The /tmp leak (deferred minor, 2026-11-04: 222 sandbox caches of 66 MB filled /tmp): every test's temp folder
// goes under one folder per run, which the global teardown removes (test/global-tmp.ts).
describe("test temp folders", () => {
  it("live in this run's own folder under the system temp folder", () => {
    expect(basename(tmpdir())).toMatch(/^lazycourse-test-\d+$/);
    expect(dirname(tmpdir())).toBe(process.env.LAZYCOURSE_SYSTEM_TMP);
  });
});
