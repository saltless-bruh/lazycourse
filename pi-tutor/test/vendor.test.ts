import { describe, it, expect } from "vitest";
import { pythonTests, jestToNodeTest, bustedToHarness } from "../scripts/vendor-lessons.js";

describe("vendor converters (spec 2026-10-19 §7a, Q26)", () => {
  it("python: drops pytest, renames the exercise module to solution, keeps unittest", () => {
    const src = [
      "import unittest", "import pytest", "", "try:", "    from lasagna import (EXPECTED_BAKE_TIME,", "                         bake_time_remaining)",
      "except ImportError as e:", "    raise ImportError(\"In your 'lasagna.py' file\") from None", "",
      "class LasagnaTest(unittest.TestCase):", "    @pytest.mark.task(taskno=1)", "    def test_x(self):",
      "        with pytest.raises(ValueError):", "            bake_time_remaining(-1)", "",
    ].join("\n");
    const out = pythonTests(src, "lasagna");
    expect(out).not.toMatch(/pytest/);
    expect(out).toContain("from solution import (EXPECTED_BAKE_TIME,");
    expect(out).toContain("'solution.py'");
    expect(out).toContain("with self.assertRaises(ValueError):");
    expect(out).toContain("class LasagnaTest(unittest.TestCase):");
    expect(out).toContain("    def test_x(self):");
  });
  it("python: `import <module>` keeps working under the new file name", () => {
    expect(pythonTests("import lasagna\n", "lasagna")).toBe("import solution as lasagna\n");
  });
  it("jest: describe/test/expect become node:test + node:assert/strict", () => {
    const src = [
      "import { describe, expect, test, xtest } from '@jest/globals';", "import { cook, LIMIT } from './lasagna';", "",
      "describe('cook', () => {", "  test('a', () => { expect(cook(1, [2, 3])).toBe(5); });",
      "  xtest('b', () => {", "    expect(cook(0)).toEqual({ ok: true });", "    expect(LIMIT).not.toBe(0);",
      "    expect(() => cook(-1)).toThrow();", "    expect(0.1 + 0.2).toBeCloseTo(0.3);", "  });", "});", "",
    ].join("\n");
    const out = jestToNodeTest(src, "lasagna", "js")!;
    expect(out).toContain('import { describe, test } from "node:test";');
    expect(out).toContain('import assert from "node:assert/strict";');
    expect(out).toContain("from './solution.js';");
    expect(out).toContain("assert.strictEqual(cook(1, [2, 3]), 5);");
    expect(out).toContain("assert.deepStrictEqual(cook(0), { ok: true });");
    expect(out).toContain("assert.notStrictEqual(LIMIT, 0);");
    expect(out).toContain("assert.throws(() => cook(-1));");
    expect(out).toMatch(/assert\.ok\(Math\.abs\(\(0\.1 \+ 0\.2\) - \(0\.3\)\) < /);
    expect(out).toContain("test('b', () => {");
    expect(out).not.toMatch(/expect\(|xtest|@jest/);
  });
  it("jest: Prettier's trailing commas inside expect(...) and the matcher do not leak into the assert call", () => {
    const out = jestToNodeTest("test('x', () => {\n  expect(\n    canSpy(true, false),\n  ).toBe(\n    true,\n  );\n});\n", "m", "js")!;
    expect(out).toContain("assert.strictEqual(canSpy(true, false), true);");
  });
  it("jest: a typescript test imports ./solution.ts", () => {
    expect(jestToNodeTest("import { f } from './leap';\ntest('x', () => { expect(f()).toBe(1); });\n", "leap", "ts")).toContain("from './solution.ts';");
  });
  it("jest: unsupported features give null, so the exercise is skipped and listed", () => {
    expect(jestToNodeTest("test('x', () => { const s = jest.fn(); });", "m", "js")).toBeNull();
    expect(jestToNodeTest("beforeEach(() => {});", "m", "js")).toBeNull();
    expect(jestToNodeTest("test('x', async () => { await expect(p).resolves.toBe(1); });", "m", "js")).toBeNull();
    expect(jestToNodeTest("test('x', () => { expect(a).toMatchSnapshot(); });", "m", "js")).toBeNull();
  });
  it("busted: the spec runs under plain lua through a shim onto check(); require goes to solution", () => {
    const out = bustedToHarness("local leap = require('leap')\n\ndescribe('leap', function()\n  it('x', function()\n    assert.is_true(leap(2000))\n  end)\nend)\n", "leap")!;
    expect(out).toContain("local leap = solution");
    expect(out).toMatch(/function it\(name, f\)[\s\S]*check\(/);
    expect(out).not.toMatch(/require\('leap'\)/);
  });
  it("busted: spies, mocks and before_each are unsupported", () => {
    expect(bustedToHarness("local s = spy.new(function() end)", "m")).toBeNull();
    expect(bustedToHarness("before_each(function() end)", "m")).toBeNull();
  });
});
