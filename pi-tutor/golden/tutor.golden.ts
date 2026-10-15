import { describe, it, expect } from "vitest";
import { runTutor, type Run } from "./harness.js";
import { Profile } from "../extensions/tutor/profile.js";
import { checkReply } from "../extensions/tutor/compliance.js";
import { loadPack, normalizeTags, vocabOf } from "../extensions/tutor/packs.js";
import type { Band } from "../extensions/tutor/policy.js";

const APP = 'user = {"id": 7}\nprint("hello")\nprint(user["name"])\n';
const KEYERROR = "My program app.py crashes with KeyError: 'name' on line 3. What does that mean?";
const T = 600_000;
/** Diagram width to check against: `pi -p` renders nothing, so set the learner's pane (default 67: 45% of a 150-col laptop terminal). */
const COLS = Number(process.env.GOLDEN_COLS) || 67;
/**
 * The fix for each case, stated in words or code. checkReply only sees code blocks, so a reply can
 * hand over the answer in prose and still be "clean" (side-agent note, golden round 1). Each case
 * knows its own fix; below rung 5 the reply must not contain it.
 */
const KEYERROR_FIX = /\.get\(|["']name["']\s+in\b|add (?:a |the )?["']?name["']? key/i;
const LOOP_FIX = /range\(len\(items\)\)|remove the `?-\s?1`?|drop the `?-\s?1`?/i;

/** The reply, its judgment and its rule breaks; `show` is printed when an expectation fails. */
/** A run's reply, its judgment (taken as production takes it: any turn, or a tool call) and its rule breaks. */
function report(run: Run | undefined, o: { band: Band; rung: number | null; noCode: boolean }) {
  const reply = run?.reply ?? "";
  const j = run?.judgment ?? null;
  const issues = checkReply(reply, { ...o, judged: j !== null, cols: COLS });
  return { j, issues, show: `issues=${JSON.stringify(issues)}\n--- reply ---\n${reply}` };
}

describe("golden transcripts (model: GOLDEN_MODEL or the configured default)", () => {
  it("beginner: a KeyError question gets a structured, judged, narrow reply and no `correct`", async () => {
    const r = await runTutor({ level: 20, language: "python", files: { "app.py": APP }, messages: [KEYERROR] });
    expect(r.replies, r.stderr).toHaveLength(1);
    const { j, issues, show } = report(r.runs[0], { band: "beginner", rung: 3, noCode: false });
    expect(issues, show).toEqual([]);
    expect(j?.judgment, show).not.toBe("correct");
    expect(r.replies[0], `rung 3 leaked the fix\n${show}`).not.toMatch(KEYERROR_FIX);
  }, T);

  it("pro: the same question gets no code block", async () => {
    const r = await runTutor({ level: 90, language: "python", files: { "app.py": APP }, messages: [KEYERROR] });
    const { issues, show } = report(r.runs[0], { band: "pro", rung: 1, noCode: true });
    expect(issues, show).toEqual([]);
    expect(r.replies[0], `rung 1 leaked the fix\n${show}`).not.toMatch(KEYERROR_FIX);
  }, T);

  it("intermediate: a question is not judged correct; stated reasoning is judged", async () => {
    const r = await runTutor({ level: 50, language: "python", files: { "loop.py": "items = [1, 2, 3]\nfor i in range(len(items) - 1):\n    print(items[i])\n" },
      messages: ["Why does my loop in loop.py skip the last item?", "I think range(len(items) - 1) stops one early because range excludes its end"] });
    expect(r.replies, r.stderr).toHaveLength(2);
    const first = report(r.runs[0], { band: "intermediate", rung: 2, noCode: false });
    expect(first.issues, first.show).toEqual([]);
    expect(first.j?.judgment, first.show).not.toBe("correct");
    expect(r.replies[0], `rung 2 leaked the fix\n${first.show}`).not.toMatch(LOOP_FIX);
    const second = report(r.runs[1], { band: "intermediate", rung: 2, noCode: false });
    expect(second.j?.judgment, second.show).toMatch(/correct|partial/);
  }, T);

  it("architect: components and trade-offs, no code, narrow diagrams", async () => {
    const r = await runTutor({ level: 50, language: "python", files: { "spec/README.md": "# todo CLI\nAdd, list and finish todos stored in a JSON file.\n" },
      messages: ["/tutor-architect", "How should I split this todo CLI into modules?"] });
    const { issues, show } = report(r.runs.at(-1), { band: "intermediate", rung: null, noCode: true });
    expect(issues, show).toEqual([]);
  }, T);

  it("beginner design recipe: the first step reply is structured and stays on Find", async () => {
    const r = await runTutor({ level: 20, language: "python",
      files: { "spec/tasks.md": "- [ ] P1.T1 Parse the command line into a Command\n", "spec/blueprint.md": "main → parse(argv) → run(Command)\n" },
      messages: ["/tutor-plan P1.T1", "ok, where do I start?"] });
    const reply = r.replies.at(-1) ?? "";
    const { issues, show } = report(r.runs.at(-1), { band: "beginner", rung: 3, noCode: false });
    expect(issues, show).toEqual([]);
    expect(reply, show).toMatch(/P1\.T1|tasks\.md|blueprint/);
  }, T);

  it("python pack: a how-do-I question in the recipe gets a cookbook idiom and tags from the card", async () => {
    const files = { "spec/tasks.md": "- [ ] P1.T1 Count how often each word appears in a text file\n", "spec/blueprint.md": "main → count(path) → print\n" };
    const r = await runTutor({ level: 50, language: "python", files, messages: ["/tutor-plan P1.T1", "I did Find, Shape, Examples and Steps. Step 1 is: read each line and count the words. How do I do that in Python?"] });
    const run = r.runs.at(-1);
    const show = `--- reply ---\n${run?.reply ?? ""}\n--- tags --- ${JSON.stringify(run?.judgment?.concept_tags)}`;
    expect(run?.reply ?? "", show).toMatch(/Counter|\.get\(|defaultdict/);
    // What the profile records: the model's tags after the extension maps them to the card's vocabulary.
    const recorded = normalizeTags(run?.judgment?.concept_tags ?? [], vocabOf(loadPack("python"), loadPack("editor")));
    expect(recorded.filter((t) => ["dicts", "loops", "files-io", "strings", "iterators", "comprehensions"].includes(t)), show).not.toEqual([]);
  }, T);

  it("memory: a stated preference is saved with tutor_remember", async () => {
    const r = await runTutor({ level: 50, language: "python", files: { "app.py": APP },
      messages: ["Please remember this for later: I already know Go well, so explain Python ideas by comparing them to Go."] });
    const run = r.runs.at(-1);
    expect(run?.tools, run?.reply).toContain("tutor_remember");
    const p = Profile.open(r.profilePath);
    expect(p.memories({ language: null, limit: 5 }).map((m) => m.text).join(" "), run?.reply).toMatch(/Go/);
    p.close();
  }, T);
});
