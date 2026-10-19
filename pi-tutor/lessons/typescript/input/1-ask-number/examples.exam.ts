import { test } from "node:test";
import assert from "node:assert/strict";
import { askNumber } from "./solution.ts";

const typed = (...answers: string[]) => async () => answers.shift() ?? "";

test("first try", async () => { assert.strictEqual(await askNumber(typed("7")), 7); });
test("keeps asking", async () => { assert.strictEqual(await askNumber(typed("seven", "", "12")), 12); });
