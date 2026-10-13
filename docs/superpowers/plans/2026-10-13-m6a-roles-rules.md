# nvim-tutor M6a: roles & rules

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tutor teach in one clear structure (diagram → why → example → what to try → in short), play two roles (coding tutor, architecture professor), and walk a task through the six-step design recipe (`:TutorPlan P1.T1`). The extension enforces the rules the model broke in live checks, and a golden-transcript check measures how well a given model follows them.

**Architecture:**
- The tutor system section is assembled per turn in this order: role prompt (`agents/<role>.md`), teaching style (`prompts/system/style.md`), band, ladder (only for roles that use it), turn protocol (`judgment.md`). A budget test keeps it small (spec §7 #2).
- `judgment.ts` also accepts the judgment as unfenced JSON, a `json` fence, or a tool call the model invents (`tutor-judgment`). `index.ts` accepts one judgment per agent run.
- `compliance.ts`:
  - `guardJudgment` downgrades a `correct` judgment when the learner's message holds no reasoning;
  - `checkReply` lists rule breaks (missing judgment, code above the rung, diagram wider than 40 columns, internals mentioned, long reply without "In short");
  - the breaks are saved as a `tutor_check` entry and fed back to the model on the next turn as a `[tutor-check]` line.
- `roles.ts` loads `agents/*.md`. The active role is a `tutor_role` session entry. `/tutor-architect [question|off]` switches roles.
- `workflow.ts` holds the design-recipe state (`tutor_workflow` entry):
  - `/tutor-plan <task id>` starts it;
  - each turn carries a `[workflow]` context line;
  - the judgment's new `step_done` field advances it;
  - the widget shows `plan k/6`.
- Bundled skills `tutor-teaching-style` and `tutor-design-recipe` (in `pi-tutor/skills/`, already listed in `package.json` `pi.skills`) hold the full rules and worked examples.
- The Lua plugin gets `:TutorPlan` and `:TutorArchitect`.
- `npm run golden` drives the real `pi -p --mode json` with the extension, against the configured model, and checks the replies with `checkReply`.

**Tech Stack:** TypeScript, Pi 1.1.0 extension API, vitest (unit + a separate golden config), Lua/plenary for nvim-tutor.

**Spec:** `docs/superpowers/specs/2026-10-13-tutor-roles-packs-exams-design.md` §2, §3, §4, §7 #2, §9 row M6. The other M6 items (tutor memory §7.1, runtime-error episodes §7 #4, `/tutor-feedback` §7 #7, M3–M5 minors §7 #13) are **M6b**, a separate plan.

## Global Constraints

- Pi `^1.0`; the extension does nothing unless `PI_TUTOR=1`; nothing writes to stdout or stderr inside Pi.
- Every new Pi API is verified in `pi-tutor/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` and recorded in `pi-tutor/PI_SURFACE.md`. Verified for this plan (2026-10-13):
  - `ExtensionCommandContext.hasUI` (used to decide whether a command may start a turn).
  - `pi.sendUserMessage` is fire-and-forget (`agent-session.js:2712`). In print mode the next caller prompt throws "Agent is already processing" (`agent-session.js:1552`). So commands start a turn only when `ctx.hasUI`.
  - A tool the model invents never reaches `tool_call` (`pi-agent-core/dist/agent-loop.js:486`, "Tool X not found"). It does appear in `turn_end` as `{ type: "toolCall", id, name, arguments }` (pi-ai `ToolCall`).
  - Print mode runs extension commands passed as messages (`session.prompt` → `_tryExecuteExtensionCommand`, `agent-session.js:1527`).
  - `pi -p --mode json` prints one JSON event per line. An assistant reply ends with `{"type":"message_end","message":{"role":"assistant","content":[…{"type":"text","text":…}]}}`, and a run ends with `{"type":"agent_end"}`. Verified with a live call.
  - CLI flags `-ne` (no extension discovery; explicit `-e` still works), `-e <path>`, `--skill <path>`, `--no-session`, `--tools`, `--model`.
- Teaching style (spec §2), verbatim:
  - structure: `1 What's happening`, `2 Why`, `3 Example`, `4 What to try`, `5 In short`;
  - rules: Complete, Organized, Plain, No padding, Narrow diagrams **≤ 40 columns, laid out vertically**.
- Pro gets no code in Example; beginner gets the fullest Why.
- Roles (spec §3): coding tutor (default, chat) and architecture professor (`:TutorArchitect [question]`, no code, active until `:TutorArchitect off` or another role command). The exam roles are M8.
- Design recipe (spec §4), verbatim steps: `1 Find`, `2 Shape`, `3 Examples`, `4 Steps`, `5 Map`, `6 Build`.
- The design recipe's band table:
  - beginner: half-filled models, plus an unrelated mini example per construct at step 5;
  - intermediate: one question per step;
  - pro: names the steps only.
- Prompt budget (spec §7 #2): role ≤ ~600 tokens, style ≤ ~600 tokens. Tokens are estimated as `ceil(chars / 4)`.
- The guard is unchanged. Roles write nothing.
- TDD: run the owning suite after each change.
  - `cd pi-tutor && npm test && npm run typecheck`
  - `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`

## Plan decisions (rulings)

- **M6 is split.** M6a is roles and rules (this plan). M6b is memory and signals. The spec's M6 done-when ("a beginner `:TutorPlan P1.T1` walks all six steps in the tmux check, with replies in the structure") belongs to M6a.
- **Compliance is enforced in code where it can be, and reported back where it can't.**
  - The extension can override the judgment (`correct` → `none` when there is no reasoning) and the workflow step (`step_done` ignored on `[tutor]` nudges).
  - It cannot un-write a reply. Style breaks are recorded (`tutor_check`) and quoted to the model on the next turn, so it corrects itself.
- **"Reasoning" is a heuristic.** A message counts as reasoning when it holds a reasoning marker (because, I think, should, the fix is, …), or when it is a statement of 4 or more words that is not a question. A bare question or a `[tutor]` nudge never counts. The cost if this is wrong: a real `correct` is logged as `none` and the rung stays put for one turn. That is the safe direction.
- **Code above the rung**:
  - rungs 4–5 allow code blocks;
  - at rungs 1–3 the beginner may show a block of ≤ 3 non-blank lines, and the intermediate shows none;
  - pro and the architect never show code blocks.
  - Untagged or `text` fences are diagrams (width-checked), not code.
- **One judgment per agent run.** A run that calls the invented `tutor-judgment` tool, gets "not found", and then writes a fenced block must not move the rung twice.
- **Commands start a turn only in the TUI** (`ctx.hasUI`). In print or RPC mode the caller drives turns, and a fire-and-forget turn would race the caller's next prompt.
- **The golden check is evidence, not a CI gate.** It needs the network and a model, so it runs with `npm run golden` and is never part of `npm test`. Its result for the default model (nemotron-3.5-lightning) is recorded in the ledger. Failures lead to prompt fixes, at most two rounds, and anything left is reported.
- **Skills are written following `/skill-creator`'s conventions.** Load the skill-creator skill before Task 4 and follow its frontmatter and description rules. The content is given in full below.

## Review Focus

1. **A learner asks a plain question and the model judges `correct`.** The rung must not move. Test: `compliance.test.ts` "a bare question never yields correct", plus the smoke test "a correct judgment on a bare question does not advance the rung" (Task 3).
2. **The model writes the judgment twice in one run (tool call, then a fence).** The rung moves once. Test: smoke "one judgment per run" (Task 2).
3. **`/tutor-plan` with an id that is not in `spec/tasks.md`, or with no `spec/` at all.** The learner gets a warning; no workflow starts and no turn is sent. Test: `workflow-cmd` cases (Task 6).
4. **The session is resumed mid-workflow or in the architect role.** The role and the `plan k/6` step come back. Test: smoke "restores role and workflow from the branch" (Tasks 5 and 6).
5. **The architect role while a stuck episode is open.** Architect turns must not move the rung or close the episode, and the ladder text is absent from the prompt. Test: smoke "architect turns leave the episode alone" (Task 5).

---

## File map

```
pi-tutor/
  agents/coding-tutor.md          NEW  role: default tutor (ladder on)
  agents/architect.md             NEW  role: architecture professor (ladder off)
  prompts/system/style.md         NEW  always-on teaching-style section
  prompts/system/judgment.md      MOD  turn protocol: no "keep short", step_done, no tool
  prompts/system/ladder.md        MOD  never write the fix below rung 5
  extensions/tutor/prompts.ts     MOD  tutorPrompt(band, {role, ladder}), estimateTokens
  extensions/tutor/judgment.ts    MOD  fallbacks, toJudgment, isJudgmentTool, step_done
  extensions/tutor/compliance.ts  NEW  hasReasoning, guardJudgment, checkReply, formatCheck
  extensions/tutor/roles.ts       NEW  parseRole, roles(), roleNamed, rolePrompt
  extensions/tutor/workflow.ts    NEW  design-recipe state + context + findTask
  extensions/tutor/ui.ts          MOD  role label on the widget
  extensions/tutor/index.ts       MOD  run state, role, workflow, check feedback, 2 commands
  skills/tutor-teaching-style/SKILL.md   NEW
  skills/tutor-design-recipe/SKILL.md    NEW
  golden/harness.ts, golden/tutor.golden.ts, vitest.golden.config.ts   NEW
  test/{prompts,judgment,compliance,roles,workflow,skills,ui,smoke}.test.ts
  PI_SURFACE.md                   MOD
nvim-tutor/lua/tutor/init.lua     MOD  :TutorPlan, :TutorArchitect
nvim-tutor/tests/init_spec.lua    MOD
README.md, docs/superpowers/specs/2026-10-07-nvim-tutor-design.md (rev 9 note)   MOD
```

---

### Task 1: Teaching-style section, turn protocol, prompt assembly and budget

**Files:**
- Create: `pi-tutor/prompts/system/style.md`
- Modify: `pi-tutor/prompts/system/judgment.md`, `pi-tutor/prompts/system/ladder.md`, `pi-tutor/extensions/tutor/prompts.ts`
- Modify: `pi-tutor/extensions/tutor/index.ts:7,237` (call site only)
- Test: `pi-tutor/test/prompts.test.ts`, `pi-tutor/test/smoke.test.ts:51,59`

**Interfaces:**
- Produces: `tutorPrompt(band: Band, opts?: { role?: string; ladder?: boolean }): string`, `estimateTokens(text: string): number`, `systemText(name)` (unchanged). `bandPrompt` is removed.

- [ ] **Step 1: Write the failing tests.** Replace `pi-tutor/test/prompts.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { tutorPrompt, systemText, estimateTokens } from "../extensions/tutor/prompts.js";

const BANDS = ["beginner", "intermediate", "pro"] as const;

describe("tutorPrompt", () => {
  it("orders role, style, band, ladder, turn protocol", () => {
    for (const b of BANDS) {
      const p = tutorPrompt(b, { role: "# Role: test role", ladder: true });
      const at = ["# Role: test role", "## Teaching style", `# Tutor band: ${b}`, "## Hint ladder", "## Turn protocol"].map((s) => p.indexOf(s));
      expect(at.every((i) => i >= 0)).toBe(true);
      expect([...at].sort((x, y) => x - y)).toEqual(at);
    }
  });
  it("leaves the ladder out for roles that do not use it", () => {
    const p = tutorPrompt("intermediate", { role: "# Role: x", ladder: false });
    expect(p).not.toContain("## Hint ladder");
    expect(p).toContain("## Turn protocol");
  });
  it("defaults to no role text and the ladder on", () => {
    expect(tutorPrompt("pro").startsWith("## Teaching style")).toBe(true);
    expect(tutorPrompt("pro")).toContain("## Hint ladder");
  });
  it("gives each band a distinct voice", () => {
    expect(new Set(BANDS.map((b) => tutorPrompt(b))).size).toBe(3);
    expect(tutorPrompt("pro")).toMatch(/never write code/i);
    expect(tutorPrompt("beginner")).toMatch(/why each part exists/i);
  });
  it("tells the model to load and cite a tutor-<lang>-* skill for a rung 3 pointer (spec §7)", () => {
    expect(tutorPrompt("beginner")).toMatch(/tutor-<lang>-\*/);
    expect(tutorPrompt("beginner")).toMatch(/cite the skill('s)? name/i);
  });
});

describe("teaching style (spec 2026-10-13 §2)", () => {
  const style = systemText("style");
  it("names the five parts in order", () => {
    const at = ["What's happening", "Why", "Example", "What to try", "In short"].map((s) => style.indexOf(`**${s}**`));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
  });
  it("states the rules, the 40-column diagram limit and the no-internals rule", () => {
    for (const w of ["Complete", "Organized", "Plain", "No padding", "40"]) expect(style).toContain(w);
    expect(style).toMatch(/INDEX\.md/);
    expect(style).toContain("tutor-teaching-style");
  });
});

describe("turn protocol (live findings 2026-10-13)", () => {
  const j = systemText("judgment");
  it("no longer asks for short replies", () => {
    expect(j).not.toMatch(/keep replies short|6-12 short lines/i);
  });
  it("says the judgment is text, not a tool, and has step_done", () => {
    expect(j).toMatch(/not a tool/i);
    expect(j).toContain('"step_done"');
    expect(j).toMatch(/`correct` only when/);
  });
  it("its example judgment is none, so a copied example never advances the rung", () => {
    expect(j).toContain('{"judgment":"none"');
  });
  it("the ladder forbids writing the fix below rung 5", () => {
    expect(systemText("ladder")).toMatch(/below rung 5, never write the corrected line/i);
  });
});

describe("prompt budget (spec §7 #2)", () => {
  it("estimates tokens as ceil(chars / 4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcde")).toBe(2);
  });
  it("keeps the style section within 600 tokens and the whole tutor section within 2400", () => {
    expect(estimateTokens(systemText("style"))).toBeLessThanOrEqual(600);
    const role = "x".repeat(600 * 4); // a role at its full budget
    for (const b of BANDS) expect(estimateTokens(tutorPrompt(b, { role, ladder: true }))).toBeLessThanOrEqual(2400);
  });
});
```

In `pi-tutor/test/smoke.test.ts`, the test "before_agent_start sets the band section…" changes its two section assertions (lines 51 and 59) to:

```ts
    expect(opts.sections["tutor"]).toContain("# Tutor band: intermediate\n");
    expect(opts.sections["tutor"]).toContain("## Teaching style");
```
and
```ts
    expect(opts.sections["tutor"]).toContain("# Tutor band: beginner\n");
```

- [ ] **Step 2: Run them and watch them fail.**
Run: `cd pi-tutor && npx vitest run test/prompts.test.ts test/smoke.test.ts`
Expected: FAIL, because `tutorPrompt` and `estimateTokens` are not exported and `style.md` is missing.

- [ ] **Step 3: Write `pi-tutor/prompts/system/style.md`:**

```markdown
## Teaching style

Write every teaching reply in this order, with these bold labels. Leave a part out only when it does not apply: a one-line question at rung 1 needs only the last two parts.

**What's happening**: a diagram of the real mechanism when it has a shape (data flow, call order, control flow, memory).
**Why**: the concept in plain words, with every detail the learner needs to understand it.
**Example**: something concrete, either the learner's own code (`path:line`) or a small unrelated one-off.
**What to try**: the next step, at the current rung.
**In short**: one or two plain sentences.

Rules:
- Complete: include every detail and piece of context needed. Never cut an answer short to save space.
- Organized: the labels keep a long answer scannable.
- Plain: define a term the first time you use it. No jargon as decoration.
- No padding: do not repeat yourself or restate the question.
- Narrow diagrams: the pane is about 45 columns wide. Draw diagrams in a plain ``` block with no language tag. Keep every line at most 40 characters, and stack boxes top to bottom with arrows going down.
- Talk about the learner's code and the concept, never about the tutor's machinery. Do not mention rungs, episodes, the judgment block, INDEX.md, SKILL.md, or line numbers inside skill files.

The `tutor-teaching-style` skill has worked examples for each band. Load it when you are unsure how a reply should look.
```

- [ ] **Step 4: Replace `pi-tutor/prompts/system/judgment.md` with:**

````markdown
## Turn protocol

You are a tutor inside the learner's editor. You have read-only tools and never edit files. The learner writes all the code. When you point at code, cite it as `path:line` from the editor context you were given.

End EVERY reply with exactly one fenced block tagged `tutor-judgment` that holds one JSON object, and write nothing after it. The block is plain text in your reply, not a tool. There is no tutor-judgment tool, so never call one.

```tutor-judgment
{"judgment":"none","concept_tags":["example-tag"],"task_done_ids":[],"episode_closed":false,"step_done":false}
```

- `judgment`: how the learner's latest message holds up. `correct` only when the message states an answer or a reason and it is right. `partial` or `wrong` when the reasoning is incomplete or wrong. `none` when they asked something without reasoning, or when the message starts with `[tutor]`.
- `concept_tags`: 1-3 short kebab-case tags for the concepts in play (e.g. `borrow-checker`, `list-comprehension`).
- `task_done_ids`: ids like `P1.T2.S3` from `spec/tasks.md` that the learner clearly completed this turn, else `[]`.
- `episode_closed`: `true` only when the problem the learner was stuck on is resolved.
- `step_done`: `true` only during a design-recipe workflow (a `[workflow]` line is in your context), when the learner finished the current step's artifact.
````

- [ ] **Step 5: In `pi-tutor/prompts/system/ladder.md`**, after the line "Never go above the current rung, even if asked: …", add this sentence to the end of that paragraph:

```
Below rung 5, never write the corrected line(s), not even as an "example" or "something like": a pointer names the place and the idea, pseudocode is the shape in words.
```

- [ ] **Step 6: Replace `pi-tutor/extensions/tutor/prompts.ts` with:**

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Band } from "./policy.js";

// prompts/system/*.md (spec §4, §9; spec 2026-10-13 §2, §7 #2). Read lazily and cached; files are tiny.
const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "prompts", "system");
const cache = new Map<string, string>();

function read(name: string): string {
  let text = cache.get(name);
  if (text === undefined) {
    text = readFileSync(join(DIR, `${name}.md`), "utf8").trimEnd();
    cache.set(name, text);
  }
  return text;
}

/** Rough token count for the prompt budget: about four characters per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** The tutor system section: role, teaching style, band, ladder (when the role uses it), turn protocol. */
export function tutorPrompt(band: Band, opts: { role?: string; ladder?: boolean } = {}): string {
  const parts = [opts.role?.trim(), read("style"), read(band), opts.ladder === false ? undefined : read("ladder"), read("judgment")];
  return `${parts.filter((p): p is string => !!p).join("\n\n")}\n`;
}

/** Any other prompt in prompts/system (suggest, scaffold, learn, style). */
export function systemText(name: string): string {
  return read(name);
}
```

- [ ] **Step 7: Update the call site** in `pi-tutor/extensions/tutor/index.ts`. The import at line 7 becomes `import { tutorPrompt, systemText } from "./prompts.js";`. Line 237 becomes `event.systemPromptOptions.sections["tutor"] = tutorPrompt(band);`. Task 5 passes the role.

- [ ] **Step 8: Run and pass.**
Run: `cd pi-tutor && npm test && npm run typecheck`
Expected: all pass. If the 2400 budget fails, shorten `style.md` and keep its wording. Do not raise the limit.

- [ ] **Step 9: Commit.**

```bash
git add pi-tutor/prompts/system pi-tutor/extensions/tutor/prompts.ts pi-tutor/extensions/tutor/index.ts pi-tutor/test/prompts.test.ts pi-tutor/test/smoke.test.ts
git commit -m "feat(pi-tutor): teaching-style section, turn protocol without length cap, prompt budget"
```

---

### Task 2: Judgment fallbacks, `step_done`, one judgment per run

**Files:**
- Modify: `pi-tutor/extensions/tutor/judgment.ts`, `pi-tutor/extensions/tutor/index.ts` (turn_end, before_agent_start)
- Modify: `pi-tutor/test/fake-pi.ts` (add the `turn` helper)
- Test: `pi-tutor/test/judgment.test.ts`, `pi-tutor/test/smoke.test.ts`

**Interfaces:**
- Produces:
  - `Judgment` gains `step_done: boolean`;
  - `toJudgment(raw: unknown): Judgment | null`;
  - `isJudgmentTool(name: string): boolean`;
  - `parseJudgment(text)` gains fallbacks.
- Produces (index.ts, internal): `run: { prompt: string; rung: number | null; judged: boolean } | null`, set in `before_agent_start`.

- [ ] **Step 1: Write the failing tests.** Append to `pi-tutor/test/judgment.test.ts`:

```ts
import { toJudgment, isJudgmentTool } from "../extensions/tutor/judgment.js";

describe("judgment fallbacks (live findings: nemotron)", () => {
  it("reads step_done, defaulting to false", () => {
    expect(parseJudgment(block('{"judgment":"none","step_done":true}'))?.step_done).toBe(true);
    expect(parseJudgment(block('{"judgment":"none"}'))?.step_done).toBe(false);
  });
  it("accepts a json fence or an untagged fence holding the judgment object", () => {
    expect(parseJudgment('hint\n```json\n{"judgment":"partial","concept_tags":["a"]}\n```')?.judgment).toBe("partial");
    expect(parseJudgment('hint\n```\n{"judgment":"wrong"}\n```')?.judgment).toBe("wrong");
  });
  it("accepts a bare trailing JSON object with a judgment key", () => {
    expect(parseJudgment('Try printing x.\n{"judgment":"none","concept_tags":["debugging"]}\n')?.concept_tags).toEqual(["debugging"]);
  });
  it("prefers the tagged fence over the fallbacks, and ignores unrelated JSON", () => {
    expect(parseJudgment('```json\n{"judgment":"wrong"}\n```\n' + block('{"judgment":"none"}'))?.judgment).toBe("none");
    expect(parseJudgment('```json\n{"name":"x"}\n```')).toBeNull();
    expect(parseJudgment('a dict like {"a": 1} in prose')).toBeNull();
  });
  it("turns a tool call's arguments into a judgment", () => {
    expect(isJudgmentTool("tutor-judgment")).toBe(true);
    expect(isJudgmentTool("tutor_judgment")).toBe(true);
    expect(isJudgmentTool("read")).toBe(false);
    expect(toJudgment({ judgment: "partial", concept_tags: ["x"] })).toEqual({ judgment: "partial", concept_tags: ["x"], task_done_ids: [], episode_closed: false, step_done: false });
    expect(toJudgment({ judgment: "great" })).toBeNull();
  });
});
```

In the same file, every existing `toEqual` on a full judgment object gains `step_done: false`. Do the same for `pi-tutor/test/smoke.test.ts:65`.

Add to `pi-tutor/test/fake-pi.ts`:

```ts
/** A learner message that states reasoning, so a `correct` judgment stands (compliance.hasReasoning). */
export const REASONED = "I think the loop stops early because range excludes the end";

/** One agent run as Pi drives it: before_agent_start for `prompt`, then the given assistant turn(s). */
export async function turn(events: Record<string, Handler>, ctx: unknown, prompt: string, ...messages: unknown[]) {
  const opts = { sections: {} as Record<string, string> };
  const r = (await events["before_agent_start"]({ type: "before_agent_start", prompt, systemPromptOptions: opts }, ctx)) as { message?: { content: string } } | undefined;
  for (const message of messages) await events["turn_end"]({ type: "turn_end", message }, ctx);
  return Object.assign(opts, { message: r?.message }); // sections + the hidden per-turn context
}
```

Append to `pi-tutor/test/smoke.test.ts` (import `turn`, `REASONED`, `episodes`):

```ts
describe("one judgment per run", () => {
  it("a tool-call judgment followed by a fenced one moves the rung once", async () => {
    const b = await boot();
    const call = { role: "assistant", stopReason: "toolUse", content: [{ type: "toolCall", id: "1", name: "tutor-judgment", arguments: { judgment: "correct", concept_tags: ["loops"] } }] };
    await turn(b.events, b.ctx, REASONED, call, judged("correct"));
    const eps = episodes(b.entries);
    expect(eps.at(-1)?.rung).toBe(3); // intermediate starts at 2; one step
    expect(b.entries.filter((e) => e.type === "tutor_judgment")).toHaveLength(1);
  });
  it("a turn_end without a before_agent_start still applies (Pi always sends one; defensive)", async () => {
    const b = await boot();
    await b.events["turn_end"]({ type: "turn_end", message: judged("none") }, b.ctx);
    expect(b.entries.some((e) => e.type === "tutor_judgment")).toBe(true);
  });
});
```

- [ ] **Step 2: Run and watch it fail.**
Run: `cd pi-tutor && npx vitest run test/judgment.test.ts test/smoke.test.ts`
Expected: FAIL (`toJudgment` is missing, `step_done` is missing, and the rung moves twice).

- [ ] **Step 3: Replace `pi-tutor/extensions/tutor/judgment.ts` with:**

```ts
// Parses the judgment the turn protocol asks the model to end every reply with (spec §5).
// Fallbacks for live findings (2026-10-13): models also emit it as a `json`/untagged fence,
// as a bare trailing object, or as a call to a tool that does not exist.
export type JudgmentValue = "correct" | "partial" | "wrong" | "none";

export interface Judgment {
  judgment: JudgmentValue;
  concept_tags: string[];
  task_done_ids: string[];
  episode_closed: boolean;
  /** Design-recipe workflow: the learner finished the current step's artifact (spec 2026-10-13 §4). */
  step_done: boolean;
}

const VALUES: readonly JudgmentValue[] = ["correct", "partial", "wrong", "none"];
const TAGGED = /```tutor-judgment[ \t]*\r?\n([\s\S]*?)```/g;
const LOOSE = /```(?:json)?[ \t]*\r?\n([\s\S]*?)```/g;
const BARE = /\{[^{}]*"judgment"[^{}]*\}\s*$/;

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function toJudgment(raw: unknown): Judgment | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (!VALUES.includes(o.judgment as JudgmentValue)) return null;
  return {
    judgment: o.judgment as JudgmentValue,
    concept_tags: strings(o.concept_tags),
    task_done_ids: strings(o.task_done_ids),
    episode_closed: o.episode_closed === true,
    step_done: o.step_done === true,
  };
}

function fromJson(body: string): Judgment | null {
  try { return toJudgment(JSON.parse(body.trim())); } catch { return null; }
}

function lastOf(text: string, re: RegExp, accept: (body: string) => boolean = () => true): string | null {
  let body: string | null = null;
  for (const m of text.matchAll(re)) if (accept(m[1])) body = m[1];
  return body;
}

export function parseJudgment(text: string): Judgment | null {
  const tagged = lastOf(text, TAGGED);
  if (tagged !== null) return fromJson(tagged);
  const loose = lastOf(text, LOOSE, (b) => b.includes('"judgment"'));
  if (loose !== null) return fromJson(loose);
  const bare = BARE.exec(text);
  return bare ? fromJson(bare[0]) : null;
}

/** The model sometimes "calls" the judgment block as a tool; Pi answers "not found", we keep the arguments. */
export function isJudgmentTool(name: string): boolean {
  return /^tutor[-_ ]?judgment$/i.test(name);
}
```

- [ ] **Step 4: Rewire `turn_end` and `before_agent_start` in `index.ts`.** Add `toJudgment, isJudgmentTool` to the judgment import. Under `let project …` add:

```ts
  /** The agent run in flight (before_agent_start → turn_end…): the learner message it answers and
   * whether a judgment was already applied. One judgment per run: a model that "calls" tutor-judgment
   * and then writes the fence must not move the rung twice. */
  let run: { prompt: string; rung: number | null; judged: boolean } | null = null;
```

At the top of the `before_agent_start` handler body (after `const band = …`), and before the episode is opened, record the run. After `openEp` (so the rung is the one the model answers at), set:

```ts
    run = { prompt: event.prompt, rung: episode ? episode.rung : null, judged: false };
```

Replace the whole `turn_end` handler with:

```ts
  /** Apply one accepted judgment to the episode and the profile (spec §5). */
  function applyTurnJudgment(j: Judgment) {
    state.last = j.judgment;
    pi.appendEntry("tutor_judgment", j);
    if (!episode) return;
    if (episode.turns === 0 && project && profile) {
      let known = new Map<string, number>();
      const p = profile, lang = project.language;
      profileWrite(() => { known = new Map(p.concepts(lang).map((c) => [c.tag, c.ease])); });
      episode = easeStart(episode, j.concept_tags, (t) => known.get(t));
    }
    episode = applyJudgment(episode, j, Date.now());
    pi.appendEntry("tutor_episode", episode);
    if (episode.closed !== undefined) { mirror(episode); episode = null; signal = "episode closed (judged)"; }
  }

  // Spec §5: take the judgment (fence, fallback, or invented tool call) and apply it once per run.
  pi.on("turn_end", async (event) => {
    const m = event.message;
    if (m.role !== "assistant") return;
    if (m.stopReason === "aborted" || m.stopReason === "error" || m.stopReason === "length") return;
    const cur = run ?? (run = { prompt: "", rung: episode ? episode.rung : null, judged: false });
    const call = m.content.find((c): c is { type: "toolCall"; name: string; arguments: Record<string, unknown> } => c.type === "toolCall" && isJudgmentTool(c.name));
    const final = m.stopReason === "stop" && !m.content.some((c) => c.type === "toolCall");
    const text = m.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("\n");
    const j = call ? toJudgment(call.arguments) : final ? parseJudgment(text) : null;
    if (j && !cur.judged) { cur.judged = true; applyTurnJudgment(j); }
    if (final && !cur.judged) state.last = "missing";
    paint();
  });
```

Add `type Judgment` to the judgment import. Check the existing stopReason values in pi-ai's `StopReason` type (`grep -n "StopReason" node_modules/@earendil-works/pi-ai/dist/types.d.ts`) and use only the values that exist. The old guard `m.stopReason !== "stop"` is now covered by `final`.

- [ ] **Step 5: Run and pass.**
Run: `cd pi-tutor && npm test && npm run typecheck`
Expected: PASS. If any existing smoke test called `turn_end` several times in a row expecting one rung step per call (smoke.test.ts:160), give each call its own `turn(...)`. Each call is a separate agent run in real Pi.

- [ ] **Step 6: Commit.**

```bash
git add pi-tutor/extensions/tutor/judgment.ts pi-tutor/extensions/tutor/index.ts pi-tutor/test
git commit -m "feat(pi-tutor): judgment fallbacks (json/bare/tool call), step_done, one judgment per run"
```

---

### Task 3: Compliance: guard the judgment, check the reply, feed breaks back

**Files:**
- Create: `pi-tutor/extensions/tutor/compliance.ts`
- Modify: `pi-tutor/extensions/tutor/index.ts`
- Test: `pi-tutor/test/compliance.test.ts`, `pi-tutor/test/smoke.test.ts`

**Interfaces:**
- Consumes: `Judgment` (Task 2), `Band`.
- Produces:
  - `type Issue = "missing-judgment" | "code-above-rung" | "wide-diagram" | "internals" | "no-summary"`;
  - `DIAGRAM_COLS = 40`;
  - `hasReasoning(prompt: string): boolean`;
  - `guardJudgment(j: Judgment, prompt: string): Judgment`;
  - `checkReply(text: string, o: { band: Band; rung: number | null; judged: boolean; noCode: boolean }): Issue[]`;
  - `formatCheck(issues: Issue[]): string`.

- [ ] **Step 1: Write the failing tests.** Create `pi-tutor/test/compliance.test.ts`:

````ts
import { describe, it, expect } from "vitest";
import { hasReasoning, guardJudgment, checkReply, formatCheck, DIAGRAM_COLS } from "../extensions/tutor/compliance.js";
import type { Judgment } from "../extensions/tutor/judgment.js";

const j = (judgment: Judgment["judgment"], step_done = false): Judgment => ({ judgment, concept_tags: ["t"], task_done_ids: [], episode_closed: false, step_done });
const fence = (tag: string, lines: string[]) => "```" + tag + "\n" + lines.join("\n") + "\n```";
const JUDGED = fence("tutor-judgment", ['{"judgment":"none"}']);
const ok = { band: "intermediate" as const, rung: 2, judged: true, noCode: false };

describe("hasReasoning", () => {
  it("a bare question or a [tutor] nudge is not reasoning", () => {
    for (const t of ["what does KeyError mean?", "why?", "[tutor] stuck signal: idle at a.py:3", "", "help"]) expect(hasReasoning(t)).toBe(false);
  });
  it("a reason or a statement is reasoning", () => {
    for (const t of ["I think range stops one early", "it fails because x is None", "the fix is to check the key first", "x is a string not an int"]) expect(hasReasoning(t)).toBe(true);
  });
});

describe("guardJudgment", () => {
  it("a bare question never yields correct (live: rung jumped on a plain question)", () => {
    expect(guardJudgment(j("correct"), "what does this error mean?").judgment).toBe("none");
    expect(guardJudgment(j("correct"), "I think the key is missing because the dict is empty").judgment).toBe("correct");
  });
  it("partial, wrong and none pass through", () => {
    for (const v of ["partial", "wrong", "none"] as const) expect(guardJudgment(j(v), "huh?").judgment).toBe(v);
  });
  it("a [tutor] nudge never finishes a workflow step", () => {
    expect(guardJudgment(j("none", true), "[tutor] design recipe started").step_done).toBe(false);
    expect(guardJudgment(j("none", true), "inputs: a list of strings, output: a Command").step_done).toBe(true);
  });
});

describe("checkReply", () => {
  it("a clean structured reply has no issues", () => {
    const text = ["**What's happening**", fence("", ["argv", " │", " ▼", "parse() ──▶ Command"]), "**Why**", "x", "**What to try**", "y", "**In short**", "z", JUDGED].join("\n");
    expect(checkReply(text, ok)).toEqual([]);
  });
  it("flags a missing judgment", () => {
    expect(checkReply("**In short** hi", { ...ok, judged: false })).toContain("missing-judgment");
  });
  it("flags a diagram line wider than 40 columns, not a wide code line", () => {
    expect(checkReply(fence("", ["a".repeat(DIAGRAM_COLS + 1)]) + JUDGED, ok)).toContain("wide-diagram");
    expect(checkReply(fence("text", ["┌" + "─".repeat(DIAGRAM_COLS - 2) + "┐"]) + JUDGED, ok)).not.toContain("wide-diagram");
    expect(checkReply(fence("python", ["x = " + "1".repeat(50)]) + JUDGED, { ...ok, rung: 5 })).not.toContain("wide-diagram");
  });
  it("code above the rung: none for pro or architect, ≤3 lines for a beginner below rung 4, any at 4-5", () => {
    const code3 = fence("python", ["a = 1", "b = 2", "c = 3"]) + JUDGED;
    const code4 = fence("python", ["a = 1", "b = 2", "c = 3", "d = 4"]) + JUDGED;
    expect(checkReply(code3, { ...ok, band: "beginner", rung: 3 })).not.toContain("code-above-rung");
    expect(checkReply(code4, { ...ok, band: "beginner", rung: 3 })).toContain("code-above-rung");
    expect(checkReply(code3, { ...ok, rung: 3 })).toContain("code-above-rung");
    expect(checkReply(code4, { ...ok, rung: 4 })).not.toContain("code-above-rung");
    expect(checkReply(code3, { ...ok, band: "pro", rung: 4, noCode: true })).toContain("code-above-rung");
    expect(checkReply(code3, { ...ok, rung: null, noCode: true })).toContain("code-above-rung");
  });
  it("flags internals in prose (live: 'line 4597 in INDEX.md')", () => {
    expect(checkReply("See line 4597 in INDEX.md.\n" + JUDGED, ok)).toContain("internals");
    expect(checkReply("You are on rung 3 now.\n" + JUDGED, ok)).toContain("internals");
    expect(checkReply("The index of a list starts at 0.\n" + JUDGED, ok)).not.toContain("internals");
  });
  it("flags a long reply with no In short line", () => {
    const long = Array.from({ length: 8 }, (_, i) => `line ${i}`).join("\n") + "\n" + JUDGED;
    expect(checkReply(long, ok)).toContain("no-summary");
    expect(checkReply("one line\n" + JUDGED, ok)).not.toContain("no-summary");
  });
});

describe("formatCheck", () => {
  it("is a [tutor-check] block naming each break", () => {
    const t = formatCheck(["wide-diagram", "missing-judgment"]);
    expect(t.startsWith("[tutor-check]")).toBe(true);
    expect(t).toMatch(/40 characters/);
    expect(t).toMatch(/tutor-judgment/);
  });
});
````

Append to `pi-tutor/test/smoke.test.ts`:

```ts
describe("compliance in the turn loop", () => {
  it("a correct judgment on a bare question does not advance the rung", async () => {
    const b = await boot();
    await turn(b.events, b.ctx, "what does KeyError mean?", judged("correct"));
    expect(episodes(b.entries).at(-1)?.rung).toBe(2);
    expect(b.widgets["tutor"]?.[1]).toContain("judged none");
  });
  it("records rule breaks and quotes them to the model on the next turn", async () => {
    const b = await boot();
    await turn(b.events, b.ctx, "hi", assistant("See INDEX.md line 40.\n```\n" + "x".repeat(60) + "\n```"));
    const check = b.entries.filter((e) => e.type === "tutor_check").at(-1)?.data as { issues: string[] };
    expect(check.issues).toEqual(expect.arrayContaining(["missing-judgment", "wide-diagram", "internals"]));
    const opts = { sections: {} as Record<string, string> };
    const r = (await b.events["before_agent_start"]({ type: "before_agent_start", prompt: "ok", systemPromptOptions: opts }, b.ctx)) as { message: { content: string } };
    expect(r.message.content).toContain("[tutor-check]");
    // a clean reply clears it
    await b.events["turn_end"]({ type: "turn_end", message: judged("none") }, b.ctx);
    const r2 = (await b.events["before_agent_start"]({ type: "before_agent_start", prompt: "ok", systemPromptOptions: opts }, b.ctx)) as { message: { content: string } };
    expect(r2.message.content).not.toContain("[tutor-check]");
  });
});
```

The existing smoke test "turn_end parses the judgment…" (line 62) asserted `entries.length` was unchanged after a reply without a block. That reply now intentionally adds a `tutor_check` entry. Change its last assertion to:

```ts
    expect(entries.slice(n).map((e) => e.type)).toEqual(["tutor_check"]); // a missing block is recorded as a rule break, not as a judgment
```

Both of that test's `turn_end` calls become separate runs: `await turn(events, ctx, REASONED, assistant('ok\n```tutor-judgment…'))` and, after `const n = entries.length;`, `await turn(events, ctx, "hi", assistant("no block here"))`. A `correct` with no learner prompt would now be guarded to `none`, and a second reply in the same run would count as already judged. Apply the same treatment to the other bare `turn_end` calls with `judged("correct"…)` at smoke.test.ts:119, 123, 142, 160, 222 and 274. Each is a learner run whose learner gave reasoning, so `turn(…, REASONED, …)` is the faithful replay.

- [ ] **Step 2: Run and watch it fail.**
Run: `cd pi-tutor && npx vitest run test/compliance.test.ts test/smoke.test.ts`
Expected: FAIL (the module is missing).

- [ ] **Step 3: Create `pi-tutor/extensions/tutor/compliance.ts`:**

```ts
import type { Band } from "./policy.js";
import type { Judgment } from "./judgment.js";

// Rules the extension enforces or reports (spec 2026-10-13 §2, §7 #2; live findings with nemotron).
export type Issue = "missing-judgment" | "code-above-rung" | "wide-diagram" | "internals" | "no-summary";

/** Spec §2 "Narrow diagrams": Pi's pane is ~45 columns. */
export const DIAGRAM_COLS = 40;
/** Replies longer than this many non-blank prose lines need an **In short** line. */
const SUMMARY_AFTER = 6;
const TUTOR_PREFIX = "[tutor]";

const REASONING = /\b(because|since|so that|therefore|i think|i guess|i believe|maybe|probably|should|must|means|the (?:fix|problem|issue|bug|error|cause) is|it'?s|that'?s|i'?ll|i would|i'd)\b/i;

/** Whether the learner's message states a reason or an answer the tutor can judge. */
export function hasReasoning(prompt: string): boolean {
  const t = prompt.trim();
  if (!t || t.startsWith(TUTOR_PREFIX)) return false;
  if (REASONING.test(t)) return true;
  return !t.includes("?") && t.split(/\s+/).length >= 4;
}

/** Only reasoning can be `correct`; only the learner (not a [tutor] nudge) finishes a workflow step. */
export function guardJudgment(j: Judgment, prompt: string): Judgment {
  const judgment = j.judgment === "correct" && !hasReasoning(prompt) ? "none" : j.judgment;
  const step_done = j.step_done && !prompt.trimStart().startsWith(TUTOR_PREFIX);
  return judgment === j.judgment && step_done === j.step_done ? j : { ...j, judgment, step_done };
}

const FENCES = /```([^\n`]*)\r?\n([\s\S]*?)```/g;
const INTERNALS = /(INDEX\.md|SKILL\.md|\.devdocs\.json|tutor-judgment|\[episode\]|\brung \d)/i;

function codeAllowed(o: { band: Band; rung: number | null; noCode: boolean }, lines: number): boolean {
  if (o.noCode) return false;
  const rung = o.rung ?? 1;
  if (rung >= 4) return true;
  return o.band === "beginner" && lines <= 3;
}

export function checkReply(text: string, o: { band: Band; rung: number | null; judged: boolean; noCode: boolean }): Issue[] {
  const issues = new Set<Issue>();
  if (!o.judged) issues.add("missing-judgment");
  for (const m of text.matchAll(FENCES)) {
    const tag = m[1].trim().toLowerCase();
    const body = m[2].replace(/\r?\n$/, "").split(/\r?\n/);
    if (tag === "tutor-judgment" || m[2].includes('"judgment"')) continue;
    if (tag === "" || tag === "text") {
      if (body.some((l) => Array.from(l).length > DIAGRAM_COLS)) issues.add("wide-diagram");
      continue;
    }
    if (!codeAllowed(o, body.filter((l) => l.trim()).length)) issues.add("code-above-rung");
  }
  const prose = text.replace(FENCES, "");
  if (INTERNALS.test(prose)) issues.add("internals");
  const proseLines = prose.split(/\r?\n/).filter((l) => l.trim()).length;
  if (proseLines > SUMMARY_AFTER && !/in short/i.test(prose)) issues.add("no-summary");
  return [...issues];
}

const FIX: Record<Issue, string> = {
  "missing-judgment": "it did not end with the fenced tutor-judgment block (plain text, not a tool call)",
  "code-above-rung": "it showed code the current rung does not allow; point and explain instead",
  "wide-diagram": `a diagram line was wider than ${DIAGRAM_COLS} characters; stack it vertically`,
  "internals": "it mentioned the tutor's machinery (rungs, INDEX.md, SKILL.md, the judgment block); talk about the code and the concept",
  "no-summary": "a long reply had no **In short** line",
};

/** Hidden next-turn note so the model corrects itself (the extension cannot un-write a reply). */
export function formatCheck(issues: Issue[]): string {
  return ["[tutor-check] your last reply broke these rules; follow them in this one:", ...issues.map((i) => `- ${FIX[i]}`)].join("\n");
}
```

- [ ] **Step 4: Wire it into `index.ts`.**
  - Import: `import { guardJudgment, checkReply, formatCheck, type Issue } from "./compliance.js";`.
  - Under `let run …` add `let lastIssues: Issue[] = [];`.
  - In `turn_end`, change `if (j && !cur.judged) { cur.judged = true; applyTurnJudgment(j); }` to apply `guardJudgment(j, cur.prompt)`.
  - Replace `if (final && !cur.judged) state.last = "missing";` with:

```ts
    if (final) {
      if (!cur.judged) state.last = "missing";
      lastIssues = checkReply(text, { band: bandFor(level()), rung: cur.rung, judged: cur.judged, noCode: bandFor(level()) === "pro" });
      if (lastIssues.length) pi.appendEntry("tutor_check", { issues: lastIssues });
    }
```

In `before_agent_start`, after `if (episode) parts.push(formatEpisodeContext(episode));`, add:

```ts
    if (lastIssues.length) parts.push(formatCheck(lastIssues));
```

Task 5 replaces `noCode` with the role-aware version.

- [ ] **Step 5: Run and pass.**
Run: `cd pi-tutor && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add pi-tutor/extensions/tutor/compliance.ts pi-tutor/extensions/tutor/index.ts pi-tutor/test
git commit -m "feat(pi-tutor): compliance — guard correct without reasoning, check replies, feed breaks back"
```

---

### Task 4: Bundled skills `tutor-teaching-style` and `tutor-design-recipe`

**Files:**
- Create: `pi-tutor/skills/tutor-teaching-style/SKILL.md`, `pi-tutor/skills/tutor-design-recipe/SKILL.md`
- Delete: `pi-tutor/skills/.gitkeep`
- Test: `pi-tutor/test/skills.test.ts`

**Interfaces:**
- Consumes: `parseSkillHeader` (learn.ts), `DIAGRAM_COLS` (Task 3).
- Produces: skill names `tutor-teaching-style` and `tutor-design-recipe`. Roles (Task 5) list them, and the workflow context (Task 6) names the second.

- [ ] **Step 1: Load `/skill-creator`.** Read its SKILL.md and apply its frontmatter and description rules (a third-person "Use when…" trigger, specific keywords). Keep the content below and change only what its rules require.

- [ ] **Step 2: Write the failing test.** Create `pi-tutor/test/skills.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseSkillHeader } from "../extensions/tutor/learn.js";
import { DIAGRAM_COLS } from "../extensions/tutor/compliance.js";

const SKILLS = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");
const read = (name: string) => readFileSync(join(SKILLS, name, "SKILL.md"), "utf8");
/** Lines inside untagged/text fences: the diagrams. Fences are paired from the top, like compliance.checkReply. */
const diagramLines = (t: string) => [...t.matchAll(/```([^\n`]*)\r?\n([\s\S]*?)```/g)]
  .filter((m) => ["", "text"].includes(m[1].trim())).flatMap((m) => m[2].split("\n"));

describe("bundled skills", () => {
  for (const name of ["tutor-teaching-style", "tutor-design-recipe"]) {
    it(`${name} loads in Pi (name matches folder, description ≤ 1024)`, () => {
      const h = parseSkillHeader(read(name));
      expect(h.name).toBe(name);
      expect(h.description).toMatch(/use when/i);
    });
    it(`${name} practises what it teaches: every diagram line ≤ ${DIAGRAM_COLS} columns`, () => {
      for (const l of diagramLines(read(name))) expect(Array.from(l).length).toBeLessThanOrEqual(DIAGRAM_COLS);
    });
  }
  it("tutor-teaching-style covers the five parts and a worked example per band", () => {
    const t = read("tutor-teaching-style");
    for (const s of ["What's happening", "Why", "Example", "What to try", "In short", "## Beginner", "## Intermediate", "## Pro"]) expect(t).toContain(s);
  });
  it("tutor-design-recipe covers the six steps and the band table", () => {
    const t = read("tutor-design-recipe");
    for (const s of ["1. Find", "2. Shape", "3. Examples", "4. Steps", "5. Map", "6. Build", "beginner", "intermediate", "pro", "step_done"]) expect(t).toContain(s);
  });
});
```

- [ ] **Step 3: Run and watch it fail.**
Run: `cd pi-tutor && npx vitest run test/skills.test.ts`
Expected: FAIL (ENOENT).

- [ ] **Step 4: Write `pi-tutor/skills/tutor-teaching-style/SKILL.md`:**

````markdown
---
name: tutor-teaching-style
description: "How the lazycourse tutor shapes a teaching reply: the five-part structure (What's happening, Why, Example, What to try, In short), narrow diagrams for a 45-column pane, and a worked example per band. Use when writing or checking any tutor reply, or when unsure how much to show at the current hint rung."
---
# Teaching style

A reply teaches one thing completely and stays easy to scan. The learner reads it in a pane about 45 columns wide, next to their code.

## The five parts

Use the bold labels, in this order. Leave a part out only when it does not apply.

1. **What's happening**: a diagram of the real mechanism (data flow, call order, control flow, memory). Skip it when the subject has no shape.
2. **Why**: the concept in plain words, with every detail needed. Define each term the first time it appears.
3. **Example**: something concrete, either the learner's own code (`path:line`) or a small unrelated one-off. Never their solution.
4. **What to try**: the next step, at the current hint rung.
5. **In short**: one or two plain sentences.

## Rules

| Rule | Meaning |
|---|---|
| Complete | every detail needed; never truncate to look short |
| Organized | the labels keep a long answer scannable |
| Plain | define terms; no jargon as decoration |
| No padding | no repetition, no restating the question |
| Narrow diagrams | ≤ 40 columns, top to bottom |

Never mention the tutor's machinery: rungs, episodes, the judgment block, INDEX.md, SKILL.md, or line numbers inside skill files. Cite a skill by its name only.

## Narrow diagrams

Put diagrams in a plain fence with no language tag. Stack the steps vertically:

```
argv  ["add", "milk"]
  │
  ▼
parse_args()
  │  splits verb / rest
  ▼
Command(verb="add",
        text="milk")
```

Don't draw a wide horizontal chain like `argv ──▶ parse_args() ──▶ Command(verb, text) ──▶ run()`. It wraps in the pane and the arrows break.

## Beginner

The fullest **Why**. Name each construct, say what it does and why it is there. A snippet of 1-3 lines may illustrate syntax, on an unrelated example.

> Learner: `KeyError: 'name'` on line 3 of app.py. What does that mean?

**What's happening**

```
user = {"id": 7}
  │
  ▼
user["name"]
  │  looks up the key "name"
  ▼
not in the dict
  │
  ▼
KeyError: 'name'
```

**Why**: a dict maps keys to values. `d[key]` asks for the value stored under `key`. If that key was never stored, Python stops with a `KeyError`, naming the missing key.

**Example**: an unrelated one:

```python
ages = {"ann": 31}
ages["bob"]   # KeyError: 'bob'
```

**What to try**: print `user` on the line before line 3. Which keys does it really have?

**In short**: the dict has no `"name"` key at that moment. Find out what it does hold.

## Intermediate

Name the concept, define it in one sentence, and point at the place (`path:line`). Ask one question. No code blocks below the pseudocode rung.

> **Why**: `dict[key]` raises when the key is absent. `dict.get(key)` returns `None` instead. Which one fits depends on whether a missing name is a bug or a normal case.
> **What to try**: at `app.py:3`, decide which case yours is.
> **In short**: decide whether "no name" is an error or a valid state.

## Pro

Hints and knowledge only, with no code at all. Contrast with languages they know, and name the idiom.

> **Why**: unlike JS objects, a missing key in a Python dict raises. The idiom is `.get` with a default, or `in` before indexing (EAFP vs LBYL).
> **In short**: choose EAFP or LBYL at `app.py:3`.
````

- [ ] **Step 5: Write `pi-tutor/skills/tutor-design-recipe/SKILL.md`:**

````markdown
---
name: tutor-design-recipe
description: "The six-step design recipe the lazycourse tutor uses to take a task from written requirements to working code with the learner doing every step: Find, Shape, Examples, Steps, Map, Build, with what the tutor does per band. Use when a [workflow] line is in context, when the learner runs :TutorPlan, or when they do not know how to start a task."
---
# Design recipe

The learner turns a written task into code one artifact at a time. The tutor asks, checks and hints, and the learner produces every artifact.

```
1 Find
  task + requirements + blueprint
  │
  ▼
2 Shape
  inputs → outputs (types)
  │
  ▼
3 Examples
  2-3 concrete cases
  │
  ▼
4 Steps
  the job in plain words
  │
  ▼
5 Map
  each step → a construct
  │
  ▼
6 Build
  one step at a time, run it
```

## The steps

1. Find: locate the task line in `spec/tasks.md`, its requirements, and its box in the blueprint. The artifact is a small map diagram: this task, what feeds it, what uses it.
2. Shape: name the inputs and outputs with their types. Artifact: one line such as `argv: list[str] → Command`.
3. Examples: 2-3 concrete input → output cases, including one edge case. They become runnable checks in step 6.
4. Steps: the job as a numbered list of plain sentences, with no code.
5. Map: for each step, the language construct that does it (loop, dict lookup, `match`, …). Use the language's cookbook skill when one is listed.
6. Build: the learner writes one step, runs it, and compares with the examples. Then the next step.

Finish a step only when the learner has produced its artifact. Then set `step_done` to true in the judgment block. The extension moves the workflow to the next step, and the next `[workflow]` line names it.

## Per band

| Band | Tutor | Learner |
|---|---|---|
| beginner | half-fills each artifact as a model; at step 5 shows an unrelated mini example per construct | completes each artifact |
| intermediate | asks one question per step and checks the answer | writes each artifact in full |
| pro | names the step only | does everything; the tutor reviews |

## Example (beginner, step 2 Shape)

Task: "P1.T1 Parse the command line into a Command".

> **What to try**: fill in the blanks of the shape:
> `parse(argv: ____) → ____`
> Look at how `main` calls it in `spec/blueprint.md`.
> **In short**: name what goes in and what comes out.

The tutor never fills in the learner's real types. It shows the form on the task's own function and leaves the learner to supply the content.
````

- [ ] **Step 6: Delete `.gitkeep`, then run and pass.**
Run: `git rm pi-tutor/skills/.gitkeep && cd pi-tutor && npm test`
Expected: PASS. If a diagram line exceeds 40 columns, shorten the line. Don't loosen the test.

- [ ] **Step 7: Commit.**

```bash
git add pi-tutor/skills pi-tutor/test/skills.test.ts
git commit -m "feat(pi-tutor): bundled skills tutor-teaching-style and tutor-design-recipe"
```

---

### Task 5: Roles: files, injection, `tutor_role`, `/tutor-architect`

**Files:**
- Create: `pi-tutor/agents/coding-tutor.md`, `pi-tutor/agents/architect.md`, `pi-tutor/extensions/tutor/roles.ts`
- Modify: `pi-tutor/extensions/tutor/index.ts`, `pi-tutor/extensions/tutor/ui.ts`
- Test: `pi-tutor/test/roles.test.ts`, `pi-tutor/test/ui.test.ts`, `pi-tutor/test/smoke.test.ts`

**Interfaces:**
- Consumes: `tutorPrompt(band, { role, ladder })` (Task 1), `checkReply(... noCode)` (Task 3), `parseFrontmatter` from `@earendil-works/pi-coding-agent` (already used in learn.ts).
- Produces:
  - `interface Role { name: string; command: string; ladder: boolean; skills: string[]; prompt: string }`;
  - `DEFAULT_ROLE = "coding-tutor"`;
  - `parseRole(text: string): Role`, `roles(): Map<string, Role>`, `roleNamed(name: string): Role`, `rolePrompt(r: Role): string`;
  - `TutorState.role?: string`;
  - index.ts `setRole(name: string)`, used by Task 6.

- [ ] **Step 1: Write the failing tests.** Create `pi-tutor/test/roles.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseRole, roles, roleNamed, rolePrompt, DEFAULT_ROLE } from "../extensions/tutor/roles.js";
import { estimateTokens } from "../extensions/tutor/prompts.js";

describe("roles", () => {
  it("parses frontmatter name, command, ladder, skills and the body", () => {
    const r = parseRole("---\nname: x\ncommand: tutor-x\nladder: false\nskills: [a, b]\n---\n# Role: x\n\nbody\n");
    expect(r).toEqual({ name: "x", command: "tutor-x", ladder: false, skills: ["a", "b"], prompt: "# Role: x\n\nbody" });
  });
  it("defaults ladder to true and skills to []; rejects a file without name or command", () => {
    expect(parseRole("---\nname: y\ncommand: chat\n---\nbody").ladder).toBe(true);
    expect(() => parseRole("---\nname: y\n---\nbody")).toThrow(/command/);
    expect(() => parseRole("no frontmatter")).toThrow(/name/);
  });
  it("ships the coding tutor (ladder) and the architect (no ladder, no code)", () => {
    const all = roles();
    expect([...all.keys()].sort()).toEqual(["architect", "coding-tutor"]);
    expect(roleNamed(DEFAULT_ROLE).ladder).toBe(true);
    const a = roleNamed("architect");
    expect(a.ladder).toBe(false);
    expect(a.command).toBe("tutor-architect");
    expect(a.prompt).toMatch(/never write code/i);
  });
  it("falls back to the coding tutor for an unknown name", () => {
    expect(roleNamed("nope").name).toBe(DEFAULT_ROLE);
  });
  it("names preferred skills and stays within the 600-token role budget (spec §7 #2)", () => {
    for (const r of roles().values()) {
      const p = rolePrompt(r);
      expect(estimateTokens(p)).toBeLessThanOrEqual(600);
      for (const s of r.skills) expect(p).toContain(`\`${s}\``);
    }
  });
});
```

Append to `pi-tutor/test/ui.test.ts` inside `describe("renderWidget"…)`:

```ts
  it("shows a non-default role first on line 1", () => {
    expect(renderWidget({ role: "architect", language: "python", level: 30, state: "idle", connected: true })[0]).toBe("tutor  architect · python · lvl 30");
  });
```

Append to `pi-tutor/test/smoke.test.ts`:

```ts
describe("roles in the turn loop", () => {
  it("/tutor-architect switches the prompt, records tutor_role, and off switches back", async () => {
    const b = await boot();
    await b.commands["tutor-architect"].handler("", b.ctx);
    expect(b.entries.at(-1)).toEqual({ type: "tutor_role", data: { role: "architect" } });
    const opts = await turn(b.events, b.ctx, "how should I split modules?", judged("none"));
    expect(opts.sections["tutor"]).toContain("# Role: architecture professor");
    expect(opts.sections["tutor"]).not.toContain("## Hint ladder");
    expect(b.widgets["tutor"]?.[0]).toContain("architect");
    await b.commands["tutor-architect"].handler("off", b.ctx);
    const back = await turn(b.events, b.ctx, "hi", judged("none"));
    expect(back.sections["tutor"]).toContain("# Role: coding tutor");
    expect(back.sections["tutor"]).toContain("## Hint ladder");
  });
  it("with a question, the TUI sends it as the learner's message; without a UI it only switches", async () => {
    const b = await boot();
    await b.commands["tutor-architect"].handler("how do layers talk?", b.ctx);
    expect(b.sent.at(-1)?.text).toBe("how do layers talk?");
    const n = b.sent.length;
    await b.commands["tutor-architect"].handler("another?", { ...b.ctx, hasUI: false });
    expect(b.sent.length).toBe(n);
  });
  it("architect turns leave the episode alone and never open one", async () => {
    const b = await boot();
    await turn(b.events, b.ctx, REASONED, judged("none")); // opens a chat episode at rung 2
    const before = episodes(b.entries).length;
    await b.commands["tutor-architect"].handler("", b.ctx);
    const opts = await turn(b.events, b.ctx, REASONED, judged("correct", true));
    expect(episodes(b.entries).length).toBe(before);
    expect(opts.message?.content ?? "").not.toContain("[episode]");
  });
  it("restores the role from the branch", async () => {
    const b = await boot({ branch: [{ type: "custom", customType: "tutor_role", data: { role: "architect" } }] });
    const opts = await turn(b.events, b.ctx, "hi", judged("none"));
    expect(opts.sections["tutor"]).toContain("# Role: architecture professor");
  });
});
```

In that test, write the `[episode]` assertion as `expect(opts.message?.content ?? "").not.toContain("[episode]")`. The `turn` helper from Task 2 returns the hidden message.

- [ ] **Step 2: Run and watch it fail.**
Run: `cd pi-tutor && npx vitest run test/roles.test.ts test/ui.test.ts test/smoke.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the role files.** `pi-tutor/agents/coding-tutor.md`:

```markdown
---
name: coding-tutor
command: chat
ladder: true
skills: [tutor-teaching-style, tutor-design-recipe]
---
# Role: coding tutor

You are the learner's coding tutor. You help them write their own code: you ask, check, and hint at the current rung of the ladder below, and you never write their solution. When a `tutor-<lang>-*` skill fits the question, load it before you answer.
```

`pi-tutor/agents/architect.md`:

```markdown
---
name: architect
command: tutor-architect
ladder: false
skills: [tutor-teaching-style]
---
# Role: architecture professor

You teach software architecture for the learner's project: the components, how data flows between them, and the trade-offs of each choice. Draw components and data flow as narrow vertical diagrams. Never write code, not even pseudocode: name the patterns and constructs instead. Read `spec/` and the project files to ground your answer in this project. Answer the question, then ask one question that makes the learner weigh a trade-off. Judge the learner's design reasoning the same way you would judge code reasoning.
```

- [ ] **Step 4: Create `pi-tutor/extensions/tutor/roles.ts`:**

```ts
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";

// Roles (spec 2026-10-13 §3): pi-tutor/agents/<role>.md, frontmatter + a short role prompt.
const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "agents");

export interface Role { name: string; command: string; ladder: boolean; skills: string[]; prompt: string }
export const DEFAULT_ROLE = "coding-tutor";

export function parseRole(text: string): Role {
  let fm: Record<string, unknown> = {};
  let body = text;
  try { const p = parseFrontmatter(text); fm = p.frontmatter as Record<string, unknown>; body = p.body; } catch { /* reported below */ }
  const name = typeof fm.name === "string" ? fm.name : "";
  if (!name) throw new Error("role file needs a name in its frontmatter");
  const command = typeof fm.command === "string" ? fm.command : "";
  if (!command) throw new Error(`role ${name} needs a command in its frontmatter`);
  const skills = Array.isArray(fm.skills) ? fm.skills.filter((s): s is string => typeof s === "string") : [];
  return { name, command, ladder: fm.ladder !== false, skills, prompt: body.trim() };
}

let cache: Map<string, Role> | null = null;

export function roles(): Map<string, Role> {
  if (!cache) {
    cache = new Map();
    for (const f of readdirSync(DIR).filter((f) => f.endsWith(".md")).sort()) {
      const r = parseRole(readFileSync(join(DIR, f), "utf8"));
      cache.set(r.name, r);
    }
  }
  return cache;
}

export function roleNamed(name: string): Role {
  const all = roles();
  return all.get(name) ?? all.get(DEFAULT_ROLE)!;
}

/** The role section of the tutor prompt: its text plus the skills it prefers (spec §5.4). */
export function rolePrompt(r: Role): string {
  return r.skills.length ? `${r.prompt}\n\nPrefer these skills when they fit: ${r.skills.map((s) => `\`${s}\``).join(", ")}.` : r.prompt;
}
```

Check `parseFrontmatter`'s return shape in `node_modules/@earendil-works/pi-coding-agent/dist` (`grep -rn "export declare function parseFrontmatter" -A4`). If the body field has a different name, use that name, and record the function in PI_SURFACE.md under "Pi exports".

- [ ] **Step 5: Show the role in `ui.ts`.** Add `role?: string;` to `TutorState`. In `renderWidget`, put `if (s.role) parts.push(s.role);` as the first push.

- [ ] **Step 6: Wire roles into `index.ts`.**
  - Import: `import { DEFAULT_ROLE, roleNamed, rolePrompt } from "./roles.js";`.
  - Add a restore helper next to `restoreLevel`:

```ts
/** Last `tutor_role` entry on the active branch (spec 2026-10-13 §3). */
function restoreRole(ctx: ExtensionContext): string {
  let role = DEFAULT_ROLE;
  for (const e of ctx.sessionManager.getBranch()) {
    if (e.type === "custom" && e.customType === "tutor_role") {
      const r = (e.data as { role?: unknown } | undefined)?.role;
      if (typeof r === "string") role = r;
    }
  }
  return role;
}
```

  - State: `let activeRole = DEFAULT_ROLE;`, plus:

```ts
  function setRole(name: string) {
    if (name === activeRole) return;
    activeRole = name;
    pi.appendEntry("tutor_role", { role: name });
  }
```

  - `paint()`: before `if (!ui) return;` add:

```ts
    const r = roleNamed(activeRole);
    state.role = r.name === DEFAULT_ROLE ? undefined : r.name;
    if (!r.ladder) state.rung = undefined;
```

  - `session_start`: after `episode = restoreEpisode(ctx);` add `activeRole = restoreRole(ctx);`.
  - `before_agent_start`: replace the section line and the chat-episode line with:

```ts
    const role = roleNamed(activeRole);
    event.systemPromptOptions.sections["tutor"] = tutorPrompt(band, { role: rolePrompt(role), ladder: role.ladder });
    // A learner's chat message opens an episode; our own [tutor] nudges and non-ladder roles do not.
    if (role.ladder && !episode && !event.prompt.startsWith(TUTOR_PREFIX)) { openEp({ kind: "chat" }, false); paint(); }
```

    and make the episode line role-aware: `if (episode && role.ladder) parts.push(formatEpisodeContext(episode));`. Set `run` with `rung: role.ladder && episode ? episode.rung : null`.
  - `applyTurnJudgment`: after `pi.appendEntry("tutor_judgment", j);` add `if (!roleNamed(activeRole).ladder) return;`, so the architect records tags but never moves the ladder.
  - `turn_end` `checkReply` option: `noCode: bandFor(level()) === "pro" || !roleNamed(activeRole).ladder`.
  - The command:

```ts
  pi.registerCommand("tutor-architect", {
    description: "Architecture professor: components, data flow, trade-offs; /tutor-architect off to return",
    handler: async (args, ctx) => {
      const q = args.trim();
      if (q === "off") { setRole(DEFAULT_ROLE); paint(); ctx.ui.notify("back to the coding tutor", "info"); return; }
      setRole("architect");
      paint();
      // Only the TUI may start a turn: in print/RPC mode a fire-and-forget turn races the caller's next prompt.
      if (q && ctx.hasUI) pi.sendUserMessage(q);
      else ctx.ui.notify("architecture professor: ask about components, data flow or trade-offs", "info");
    },
  });
```

  - In `fake-pi.ts`, `fakeCtx` already has `hasUI: true`, so nothing changes there.

- [ ] **Step 7: Run and pass.**
Run: `cd pi-tutor && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit.**

```bash
git add pi-tutor/agents pi-tutor/extensions/tutor/roles.ts pi-tutor/extensions/tutor/ui.ts pi-tutor/extensions/tutor/index.ts pi-tutor/test
git commit -m "feat(pi-tutor): roles from agents/*.md, tutor_role entry, /tutor-architect"
```

---

### Task 6: Design-recipe workflow and `/tutor-plan`

**Files:**
- Create: `pi-tutor/extensions/tutor/workflow.ts`
- Modify: `pi-tutor/extensions/tutor/index.ts`
- Test: `pi-tutor/test/workflow.test.ts`, `pi-tutor/test/smoke.test.ts`

**Interfaces:**
- Consumes: `Judgment.step_done` (Task 2), guarded by `guardJudgment` (Task 3); `setRole`, `DEFAULT_ROLE` (Task 5); `TutorState.task` (exists).
- Produces:
  - `STEPS`, `interface Workflow { task: string; step: number; started: number; done?: number }`, `TASK_ID: RegExp`;
  - `startWorkflow(task, now)`, `advance(w, stepDone, now)`;
  - `workflowLabel(w): string`, `formatWorkflowContext(w, band): string`, `findTask(tasksMd, id): string | null`.

- [ ] **Step 1: Write the failing tests.** Create `pi-tutor/test/workflow.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { STEPS, TASK_ID, startWorkflow, advance, workflowLabel, formatWorkflowContext, findTask } from "../extensions/tutor/workflow.js";

describe("design-recipe workflow (spec 2026-10-13 §4)", () => {
  it("has the six steps in order", () => {
    expect(STEPS).toEqual(["Find", "Shape", "Examples", "Steps", "Map", "Build"]);
  });
  it("advances one step per step_done and finishes after Build", () => {
    let w = startWorkflow("P1.T1", 1);
    expect(workflowLabel(w)).toBe("plan 1/6");
    w = advance(w, false, 2);
    expect(w.step).toBe(1);
    for (let i = 0; i < 5; i++) w = advance(w, true, 3);
    expect(workflowLabel(w)).toBe("plan 6/6");
    w = advance(w, true, 9);
    expect(w.done).toBe(9);
    expect(workflowLabel(w)).toBe("plan done");
    expect(advance(w, true, 10)).toBe(w);
  });
  it("tells the model the step, its artifact and the band's mode", () => {
    const w = { task: "P1.T1", step: 3, started: 1 };
    const b = formatWorkflowContext(w, "beginner");
    expect(b).toMatch(/^\[workflow\] design recipe for P1\.T1: step 3\/6 Examples/);
    expect(b).toMatch(/half-fill/i);
    expect(formatWorkflowContext(w, "intermediate")).toMatch(/one question/i);
    expect(formatWorkflowContext(w, "pro")).toMatch(/name the step only/i);
    expect(b).toContain("step_done");
    expect(b).toContain("tutor-design-recipe");
  });
  it("accepts task ids like P1.T1 and P2.T3.S1, rejects others", () => {
    for (const id of ["P1", "P1.T1", "P12.T3.S4"]) expect(TASK_ID.test(id)).toBe(true);
    for (const id of ["", "T1", "P1.", "p1.t1", "P1.T1; rm"]) expect(TASK_ID.test(id)).toBe(false);
  });
  it("finds the task's line in spec/tasks.md as a whole token", () => {
    const md = "# Tasks\n- [ ] P1.T1 Parse argv into a Command\n- [ ] P1.T10 Something else\n";
    expect(findTask(md, "P1.T1")).toBe("- [ ] P1.T1 Parse argv into a Command");
    expect(findTask(md, "P1.T10")).toBe("- [ ] P1.T10 Something else");
    expect(findTask(md, "P1.T2")).toBeNull();
  });
});
```

Append to `pi-tutor/test/smoke.test.ts` (add `mkdtempSync`, `mkdirSync`, `writeFileSync`, `tmpdir`, and `join` imports if they are missing):

```ts
describe("/tutor-plan", () => {
  const project = () => {
    const dir = mkdtempSync(join(tmpdir(), "plan-"));
    mkdirSync(join(dir, "spec"));
    writeFileSync(join(dir, "spec", "tasks.md"), "- [ ] P1.T1 Parse argv into a Command\n");
    return dir;
  };
  it("starts the workflow, shows plan 1/6, kicks off with a [tutor] message, and carries [workflow] context", async () => {
    const b = await boot({ cwd: project() });
    await b.commands["tutor-plan"].handler("P1.T1", b.ctx);
    expect(b.entries.find((e) => e.type === "tutor_workflow")?.data).toMatchObject({ task: "P1.T1", step: 1 });
    expect(b.widgets["tutor"]?.[0]).toContain("plan 1/6");
    expect(b.sent.at(-1)?.text).toMatch(/^\[tutor\] design recipe started for P1\.T1/);
    const opts = await turn(b.events, b.ctx, "[tutor] design recipe started for P1.T1", judged("none"));
    expect(opts.message?.content).toMatch(/\[workflow\] design recipe for P1\.T1: step 1\/6 Find/);
  });
  it("step_done from the learner advances; from a [tutor] nudge it does not", async () => {
    const b = await boot({ cwd: project() });
    await b.commands["tutor-plan"].handler("P1.T1", b.ctx);
    const done = assistant('ok\n```tutor-judgment\n{"judgment":"none","step_done":true}\n```');
    await turn(b.events, b.ctx, "[tutor] design recipe started for P1.T1", done);
    expect(b.widgets["tutor"]?.[0]).toContain("plan 1/6");
    await turn(b.events, b.ctx, "the task is P1.T1 and it feeds main", done);
    expect(b.widgets["tutor"]?.[0]).toContain("plan 2/6");
  });
  it("warns and does nothing for a bad id, an unknown id, or no spec/tasks.md", async () => {
    const b = await boot({ cwd: project() });
    await b.commands["tutor-plan"].handler("", b.ctx);
    await b.commands["tutor-plan"].handler("P1.T9", b.ctx);
    const empty = await boot({ cwd: mkdtempSync(join(tmpdir(), "plan-")) });
    await empty.commands["tutor-plan"].handler("P1.T1", empty.ctx);
    expect(b.entries.some((e) => e.type === "tutor_workflow")).toBe(false);
    expect(b.sent).toHaveLength(0);
    expect(b.notes.join("\n")).toMatch(/usage: \/tutor-plan/);
    expect(b.notes.join("\n")).toMatch(/P1\.T9 is not in spec\/tasks\.md/);
    expect(empty.notes.join("\n")).toMatch(/no spec\/tasks\.md/);
  });
  it("switches back from the architect, and restores an unfinished workflow on resume", async () => {
    const b = await boot({ cwd: project() });
    await b.commands["tutor-architect"].handler("", b.ctx);
    await b.commands["tutor-plan"].handler("P1.T1", b.ctx);
    expect(b.entries.filter((e) => e.type === "tutor_role").at(-1)?.data).toEqual({ role: "coding-tutor" });
    const r = await boot({ branch: [{ type: "custom", customType: "tutor_workflow", data: { task: "P1.T1", step: 4, started: 1 } }] });
    expect(r.widgets["tutor"]?.[0]).toContain("plan 4/6");
  });
});
```

- [ ] **Step 2: Run and watch it fail.**
Run: `cd pi-tutor && npx vitest run test/workflow.test.ts test/smoke.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `pi-tutor/extensions/tutor/workflow.ts`:**

```ts
import type { Band } from "./policy.js";

// The design-recipe workflow (spec 2026-10-13 §4): six steps, one artifact each, the learner does each.
export const STEPS = ["Find", "Shape", "Examples", "Steps", "Map", "Build"] as const;

const ARTIFACT = [
  "the task line, its requirements and its blueprint box, as a small map diagram",
  "inputs and outputs with their types, as one line like `argv: list[str] → Command`",
  "2-3 concrete input → output cases, one of them an edge case",
  "the job as numbered plain sentences, no code",
  "each step mapped to the language construct that does it",
  "one step at a time: write it, run it, compare with the examples",
];

const MODE: Record<Band, string> = {
  beginner: "Beginner: half-fill this step's artifact as a model and let the learner complete it; at Map, show an unrelated mini example per construct.",
  intermediate: "Intermediate: ask one question about this step and check the learner's answer.",
  pro: "Pro: name the step only, then review what the learner produces.",
};

export interface Workflow { task: string; step: number; started: number; done?: number }

/** Task ids from spec/tasks.md: P1, P1.T2, P1.T2.S3. */
export const TASK_ID = /^P\d+(?:\.T\d+(?:\.S\d+)?)?$/;

export function startWorkflow(task: string, now: number): Workflow {
  return { task, step: 1, started: now };
}

export function advance(w: Workflow, stepDone: boolean, now: number): Workflow {
  if (!stepDone || w.done !== undefined) return w;
  return w.step >= STEPS.length ? { ...w, done: now } : { ...w, step: w.step + 1 };
}

export function workflowLabel(w: Workflow): string {
  return w.done !== undefined ? "plan done" : `plan ${w.step}/${STEPS.length}`;
}

export function formatWorkflowContext(w: Workflow, band: Band): string {
  return [
    `[workflow] design recipe for ${w.task}: step ${w.step}/${STEPS.length} ${STEPS[w.step - 1]}`,
    `artifact: ${ARTIFACT[w.step - 1]}`,
    MODE[band],
    "The learner produces the artifact. Set step_done true in the judgment only when they finished it. The tutor-design-recipe skill has the method.",
  ].join("\n");
}

/** The line of spec/tasks.md that holds `id` as a whole token (P1.T1 must not match P1.T10). */
export function findTask(tasksMd: string, id: string): string | null {
  const re = new RegExp(`(^|[^\\w.])${id.replace(/\./g, "\\.")}(?![\\w.]*\\d)`);
  return tasksMd.split(/\r?\n/).find((l) => re.test(l)) ?? null;
}
```

Check: on `- [ ] P1.T10 …` with id `P1.T1`, the text after the match is `0 …`, so the lookahead `(?![\w.]*\d)` rejects it. On `P1.T1 Parse` it is followed by a space, so it is accepted. The tests above cover both cases.

- [ ] **Step 4: Wire it into `index.ts`.**
  - Imports: `import { readFileSync } from "node:fs";` (merge with the existing `realpathSync` import), `import { join } from "node:path";`, and `import { TASK_ID, startWorkflow, advance, workflowLabel, formatWorkflowContext, findTask, type Workflow } from "./workflow.js";`.
  - Restore helper:

```ts
/** Last `tutor_workflow` entry on the active branch, if it is unfinished (spec 2026-10-13 §4). */
function restoreWorkflow(ctx: ExtensionContext): Workflow | null {
  let w: Workflow | undefined;
  for (const e of ctx.sessionManager.getBranch()) {
    if (e.type === "custom" && e.customType === "tutor_workflow") w = e.data as Workflow;
  }
  return w && typeof w.step === "number" && typeof w.task === "string" && w.done === undefined ? w : null;
}
```

  - State: `let workflow: Workflow | null = null;`. In `session_start`, after the role restore: `workflow = restoreWorkflow(ctx);`.
  - `paint()`: `state.task = workflow ? workflowLabel(workflow) : undefined;`.
  - `before_agent_start`, after the episode context line: `if (workflow) parts.push(formatWorkflowContext(workflow, band));`.
  - `applyTurnJudgment`, right after `pi.appendEntry("tutor_judgment", j);` and before the role check:

```ts
    if (workflow) {
      const next = advance(workflow, j.step_done, Date.now());
      if (next !== workflow) {
        pi.appendEntry("tutor_workflow", next);
        if (next.done !== undefined) ui?.notify(`design recipe for ${next.task} finished`, "info");
        workflow = next.done === undefined ? next : null;
      }
    }
```

  - The command:

```ts
  pi.registerCommand("tutor-plan", {
    description: "Design recipe: walk a task from spec/tasks.md to code in six steps (/tutor-plan P1.T1)",
    handler: async (args, ctx) => {
      const id = args.trim();
      if (!TASK_ID.test(id)) { ctx.ui.notify("usage: /tutor-plan <task id>, e.g. /tutor-plan P1.T1", "warning"); return; }
      let tasks: string;
      try { tasks = readFileSync(join(ctx.cwd, "spec", "tasks.md"), "utf8"); } catch {
        ctx.ui.notify("no spec/tasks.md in this project; /tutor-start scaffolds one", "warning");
        return;
      }
      const line = findTask(tasks, id);
      if (!line) { ctx.ui.notify(`${id} is not in spec/tasks.md`, "warning"); return; }
      setRole(DEFAULT_ROLE); // spec §3: another role command ends the architect role
      workflow = startWorkflow(id, Date.now());
      pi.appendEntry("tutor_workflow", workflow);
      paint();
      const kickoff = `${TUTOR_PREFIX} design recipe started for ${id}: ${line.replace(/^[-*]\s*\[.\]\s*/, "").trim()}. Begin step 1 (Find).`;
      if (ctx.hasUI) pi.sendUserMessage(kickoff);
      else ctx.ui.notify(`design recipe started for ${id}; send a message to begin step 1`, "info");
    },
  });
```

  `spec/tasks.md` is under `ctx.cwd`, the project root, so the root rule holds.

- [ ] **Step 5: Run and pass.**
Run: `cd pi-tutor && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add pi-tutor/extensions/tutor/workflow.ts pi-tutor/extensions/tutor/index.ts pi-tutor/test
git commit -m "feat(pi-tutor): design-recipe workflow, /tutor-plan, plan k/6 widget"
```

---

### Task 7: Neovim commands `:TutorPlan` and `:TutorArchitect`

**Files:**
- Modify: `nvim-tutor/lua/tutor/init.lua:115-124`, `nvim-tutor/tests/init_spec.lua`

**Interfaces:**
- Consumes: the slash commands `/tutor-plan` and `/tutor-architect` (Tasks 5 and 6).

- [ ] **Step 1: Write the failing test.** Add to `nvim-tutor/tests/init_spec.lua`, after the `:TutorDocs` test:

```lua
  it(":TutorPlan and :TutorArchitect type their slash commands into pi", function()
    local tutor = require("tutor")
    vim.cmd("Tutor")
    vim.cmd("TutorPlan P1.T1")
    vim.cmd("TutorArchitect off")
    local buf = tutor.state.term:bufnr()
    local has = function(s) return vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), s) end
    vim.wait(1000, function() return has("/tutor-plan P1.T1") and has("/tutor-architect off") end)
    assert.is_true(has("/tutor-plan P1.T1"))
    assert.is_true(has("/tutor-architect off"))
  end)

  it(":TutorPlan needs a task id", function()
    assert.has_error(function() vim.cmd("TutorPlan") end)
  end)
```

- [ ] **Step 2: Run and watch it fail.**
Run: `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`
Expected: FAIL (E492: Not an editor command).

- [ ] **Step 3: Add the commands** in `M.setup`, after `TutorDocs`:

```lua
  cmd("TutorPlan", slash("/tutor-plan"), { nargs = 1 })
  cmd("TutorArchitect", slash("/tutor-architect"), { nargs = "?" })
```

- [ ] **Step 4: Run and pass** (the same command). Expected: all Lua tests pass.

- [ ] **Step 5: Commit.**

```bash
git add nvim-tutor
git commit -m "feat(nvim-tutor): :TutorPlan and :TutorArchitect"
```

---

### Task 8: Golden-transcript check (`npm run golden`)

**Files:**
- Create: `pi-tutor/golden/harness.ts`, `pi-tutor/golden/tutor.golden.ts`, `pi-tutor/vitest.golden.config.ts`
- Modify: `pi-tutor/package.json` (script), `pi-tutor/tsconfig.json` (include `golden/` if it lists dirs)

**Interfaces:**
- Consumes: `checkReply`, `guardJudgment`, `hasReasoning` (Task 3); `parseJudgment` (Task 2); `Profile` (`open`, `saveLanguage`, `addProject`).
- Produces: `runTutor(o: { level: number; language: string; files: Record<string, string>; messages: string[]; timeoutMs?: number }): Promise<{ replies: string[]; dir: string; stderr: string; code: number | null }>`.

- [ ] **Step 1: Confirm `-ne` keeps the installed pi-tutor package out**, so the worktree's copy is the only one that loads.
Run: `cd /tmp && PI_TUTOR=1 timeout 60 pi -p --no-session -ne "/tutor-status" ; echo "exit=$?"`
Expected: no tutor output, because the command is not found and goes to the model as text. If the installed package still loads under `-ne`, the harness must also set `PI_CODING_AGENT_DIR` to a temp copy of `~/.pi/agent` with `packages` removed from its `settings.json`. Write down which case holds in the ledger.

- [ ] **Step 2: Create `pi-tutor/golden/harness.ts`:**

```ts
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Profile } from "../extensions/tutor/profile.js";

// Golden transcripts (spec 2026-10-13 §7 #2): the real `pi -p --mode json` with this checkout's
// extension and skills, against the configured model. Needs network; never part of `npm test`.
const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXT = join(PKG, "extensions", "tutor", "index.ts");
const SKILLS = join(PKG, "skills");

export interface GoldenRun { replies: string[]; dir: string; stderr: string; code: number | null }

export async function runTutor(o: { level: number; language: string; files: Record<string, string>; messages: string[]; timeoutMs?: number }): Promise<GoldenRun> {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "golden-proj-")));
  for (const [path, text] of Object.entries(o.files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  // The level comes through the real path: a recorded project whose language has that level.
  const profilePath = join(mkdtempSync(join(tmpdir(), "golden-profile-")), "profile.sqlite");
  const p = Profile.open(profilePath);
  p.saveLanguage(o.language, o.level, {}, Date.now());
  p.addProject(o.language, dir, "golden", Date.now());
  p.close();

  const args = ["-p", "--no-session", "--mode", "json", "-ne", "-e", EXT, "--skill", SKILLS, "--tools", "read,grep,find,ls",
    ...(process.env.GOLDEN_MODEL ? ["--model", process.env.GOLDEN_MODEL] : []), ...o.messages];
  const env: NodeJS.ProcessEnv = { ...process.env, PI_TUTOR: "1", PI_TUTOR_PROFILE: profilePath };
  delete env.NVIM; // detached: no editor link, even when run from a Neovim terminal

  return new Promise((resolve, reject) => {
    const child = spawn("pi", args, { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    const timer = setTimeout(() => child.kill("SIGTERM"), o.timeoutMs ?? 240_000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      const replies: string[] = [];
      let last = "";
      for (const line of out.split("\n")) {
        let ev: { type?: string; message?: { role?: string; content?: { type: string; text?: string }[] } };
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === "message_end" && ev.message?.role === "assistant") {
          const text = (ev.message.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
          if (text.trim()) last = text;
        } else if (ev.type === "agent_end") { replies.push(last); last = ""; }
      }
      resolve({ replies, dir, stderr: err, code });
    });
  });
}
```

- [ ] **Step 3: Create `pi-tutor/golden/tutor.golden.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { runTutor } from "./harness.js";
import { checkReply } from "../extensions/tutor/compliance.js";
import { parseJudgment } from "../extensions/tutor/judgment.js";
import type { Band } from "../extensions/tutor/policy.js";

const APP = 'user = {"id": 7}\nprint("hello")\nprint(user["name"])\n';
const KEYERROR = "My program app.py crashes with KeyError: 'name' on line 3. What does that mean?";
const T = 300_000;

/** The reply, its judgment and its rule breaks, printed when an expectation fails. */
function report(reply: string, o: { band: Band; rung: number | null; noCode: boolean }) {
  const j = parseJudgment(reply);
  const issues = checkReply(reply, { ...o, judged: j !== null });
  return { j, issues, show: `issues=${JSON.stringify(issues)}\n--- reply ---\n${reply}` };
}

describe("golden transcripts (model: GOLDEN_MODEL or the configured default)", () => {
  it("beginner: a KeyError question gets a structured, judged, narrow reply and no `correct`", async () => {
    const r = await runTutor({ level: 20, language: "python", files: { "app.py": APP }, messages: [KEYERROR] });
    expect(r.replies, r.stderr).toHaveLength(1);
    const { j, issues, show } = report(r.replies[0], { band: "beginner", rung: 3, noCode: false });
    expect(issues, show).toEqual([]);
    expect(j?.judgment, show).not.toBe("correct");
  }, T);

  it("pro: the same question gets no code block", async () => {
    const r = await runTutor({ level: 90, language: "python", files: { "app.py": APP }, messages: [KEYERROR] });
    const { issues, show } = report(r.replies[0] ?? "", { band: "pro", rung: 1, noCode: true });
    expect(issues, show).toEqual([]);
  }, T);

  it("intermediate: a question is not judged correct; stated reasoning is judged", async () => {
    const r = await runTutor({ level: 50, language: "python", files: { "loop.py": "items = [1, 2, 3]\nfor i in range(len(items) - 1):\n    print(items[i])\n" },
      messages: ["Why does my loop in loop.py skip the last item?", "I think range(len(items) - 1) stops one early because range excludes its end"] });
    expect(r.replies, r.stderr).toHaveLength(2);
    const first = report(r.replies[0], { band: "intermediate", rung: 2, noCode: false });
    expect(first.issues, first.show).toEqual([]);
    expect(first.j?.judgment, first.show).not.toBe("correct");
    const second = report(r.replies[1], { band: "intermediate", rung: 2, noCode: false });
    expect(second.j?.judgment, second.show).toMatch(/correct|partial/);
  }, T);

  it("architect: components and trade-offs, no code, narrow diagrams", async () => {
    const r = await runTutor({ level: 50, language: "python", files: { "spec/README.md": "# todo CLI\nAdd, list and finish todos stored in a JSON file.\n" },
      messages: ["/tutor-architect", "How should I split this todo CLI into modules?"] });
    const { issues, show } = report(r.replies.at(-1) ?? "", { band: "intermediate", rung: null, noCode: true });
    expect(issues, show).toEqual([]);
  }, T);

  it("beginner design recipe: the first step reply is structured and stays on Find", async () => {
    const r = await runTutor({ level: 20, language: "python",
      files: { "spec/tasks.md": "- [ ] P1.T1 Parse the command line into a Command\n", "spec/blueprint.md": "main → parse(argv) → run(Command)\n" },
      messages: ["/tutor-plan P1.T1", "ok, where do I start?"] });
    const reply = r.replies.at(-1) ?? "";
    const { issues, show } = report(reply, { band: "beginner", rung: 3, noCode: false });
    expect(issues, show).toEqual([]);
    expect(reply, show).toMatch(/P1\.T1|tasks\.md|blueprint/);
  }, T);
});
```

- [ ] **Step 4: Create `pi-tutor/vitest.golden.config.ts` and the script.**

```ts
import { defineConfig } from "vitest/config";

// Golden transcripts call a real model: run with `npm run golden`, never in `npm test`.
export default defineConfig({ test: { include: ["golden/**/*.golden.ts"], testTimeout: 300_000, fileParallelism: false } });
```

In `pi-tutor/package.json` `scripts`, add `"golden": "vitest run --config vitest.golden.config.ts"`. Then check that the default vitest run does not pick up `golden/`: run `npx vitest list | grep -c golden` and expect `0`. If `tsconfig.json` has an `include`, add `"golden/**/*.ts"` so `npm run typecheck` covers the harness.

- [ ] **Step 5: Run `npm test` and the typecheck, then commit.**
Run: `cd pi-tutor && npm test && npm run typecheck`
Expected: PASS, with the golden files not collected.

```bash
git add pi-tutor/golden pi-tutor/vitest.golden.config.ts pi-tutor/package.json pi-tutor/tsconfig.json
git commit -m "test(pi-tutor): golden-transcript check against the real pi -p --mode json"
```

- [ ] **Step 6: Run the golden check against the default model** (nvidia nemotron-3.5-lightning). This step needs the network.
Run: `cd pi-tutor && npm run golden 2>&1 | tail -60`
Record each case's pass or fail, and its issues, in the ledger. For each failure, change the prompt text (`style.md`, `judgment.md`, `ladder.md`, the role files), never the checks. Re-run. Stop after two rounds and report what still fails. Commit the prompt changes as `fix(pi-tutor): prompt wording from golden run N`.

---

### Task 9: Surface, docs, live check

**Files:**
- Modify: `pi-tutor/PI_SURFACE.md`, `README.md`, `docs/superpowers/specs/2026-10-07-nvim-tutor-design.md` (a rev 9 line pointing at the M6a plan)

- [ ] **Step 1: Update `pi-tutor/PI_SURFACE.md`.** Add these items under the matching headings, worded as facts with file:line where known:
  - `ExtensionCommandContext.hasUI`: commands start a turn only when it is true.
  - `pi.sendUserMessage` is fire-and-forget (`agent-session.js:2712`). In print mode a following prompt throws "Agent is already processing" (`agent-session.js:1552`).
  - `turn_end` `message.content` may hold `{ type: "toolCall", id, name, arguments }` for a tool that does not exist. Such a call never reaches `tool_call` (`pi-agent-core/dist/agent-loop.js:486`).
  - `parseFrontmatter(text)` → `{ frontmatter, body }`, used by roles.ts and learn.ts.
  - Pi CLI used by the golden check: `pi -p --no-session --mode json -ne -e <ext> --skill <dir> --tools … [--model …] <messages…>`. Print mode runs extension commands passed as messages (`agent-session.js:1527`). JSON events used: `message_end` (assistant content) and `agent_end`.
  - Session entries: `tutor_role {role}`, `tutor_workflow {task, step, started, done?}`, `tutor_check {issues}`.

- [ ] **Step 2: Update `README.md`.** Add `:TutorPlan <task id>`, `:TutorArchitect [question|off]` and `npm run golden` to the command list, with one line each. Add one line on the teaching structure.

- [ ] **Step 3: Run both suites and the typecheck.**
Run: `cd pi-tutor && npm test && npm run typecheck`, then the Lua command from Global Constraints.
Expected: all green.

- [ ] **Step 4: Commit.**

```bash
git add pi-tutor/PI_SURFACE.md README.md docs/superpowers/specs/2026-10-07-nvim-tutor-design.md
git commit -m "docs: M6a surface (roles, workflow, golden), README commands"
```

- [ ] **Step 5: Live tmux check: the M6 done-when.** Use a throwaway profile, never the real one:
  1. Make a temp project with `spec/tasks.md` containing `- [ ] P1.T1 Parse the command line into a Command` and a one-line `spec/blueprint.md`.
  2. Seed a temp profile with python at level 20 and that project, the same way the harness does.
  3. `tmux -L lazycourse new-session -d -s t -x 200 -y 50 -c <dir> "PI_TUTOR_PROFILE=<tmp>/profile.sqlite nvim"`, then `:Tutor`, then `:TutorPlan P1.T1`.
  4. Answer each step as a beginner would. Capture the pane after each reply.

  Done when:
  - the widget goes `plan 1/6` → … → `plan 6/6` → finished;
  - every reply uses the bold structure and ends with a judgment;
  - no diagram line in the pane wraps.

  Record the transcript summary and any `tutor_check` issues in the ledger.
````
