import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { countLines } from "./solution.ts";

const file = (text: string) => { const p = join(mkdtempSync(join(tmpdir(), "cl-")), "f.txt"); writeFileSync(p, text); return p; };
test("three lines", () => { assert.strictEqual(countLines(file("a\nb\nc\n")), 3); });
test("empty file", () => { assert.strictEqual(countLines(file("")), 0); });
