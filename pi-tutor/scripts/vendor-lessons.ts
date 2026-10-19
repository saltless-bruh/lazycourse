// Vendors learn-first lessons from established curricula (spec 2026-10-19 §7a): `node scripts/vendor-lessons.ts <language>`.
// Clones each pinned source, converts its tests to the tools the exam sandbox already runs (Q26), and writes
// lessons/<language>/ in the format of lessons/README.md. Network is used here only, at development time.
// Every exercise it writes is then checked by `npm run lessons` (exemplar passes, stub fails).
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ---- converters (pure; unit-tested in test/vendor.test.ts) ----

/** Exercism Python concept tests: drop pytest (markers only), import the exercise module as `solution`. */
export function pythonTests(src: string, module: string): string {
  const mod = module.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return src.split("\n")
    .filter((l) => !/^\s*import pytest\s*$/.test(l) && !/^\s*@pytest\.mark\./.test(l))
    .join("\n")
    .replace(/pytest\.raises\(/g, "self.assertRaises(")
    .replace(new RegExp(`^([ \\t]*)from ${mod} import`, "gm"), "$1from solution import")
    .replace(new RegExp(`^([ \\t]*)import ${mod}[ \\t]*$`, "gm"), `$1import solution as ${module}`)
    .replace(new RegExp(`'${mod}\\.py'`, "g"), "'solution.py'");
}

/** The index just past the parenthesised group that opens at `open` (strings skipped), or -1. */
function closeParen(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === "'" || c === '"' || c === "`") {
      for (i++; i < s.length && s[i] !== c; i++) if (s[i] === "\\") i++;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") { depth--; if (depth === 0) return i + 1; }
  }
  return -1;
}

const UNSUPPORTED_JEST = /\bjest\.|toMatchSnapshot|toMatchInlineSnapshot|\bbeforeEach\b|\bafterEach\b|\bbeforeAll\b|\bafterAll\b|toHaveBeenCalled|\.resolves\b|\.rejects\b|expect\.(any|anything|objectContaining|arrayContaining|stringContaining)|expect\.assertions|toHaveProperty|toBeInstanceOf|toMatch\(|toHaveLength|\.each\b/;

/** One `expect(a).[not.]matcher(b)` as node:assert, or null for a matcher we do not convert. */
function assertion(actual: string, not: boolean, matcher: string, arg: string): string | null {
  const a = actual, b = arg;
  switch (`${not ? "not." : ""}${matcher}`) {
    case "toBe": return `assert.strictEqual(${a}, ${b})`;
    case "not.toBe": return `assert.notStrictEqual(${a}, ${b})`;
    case "toEqual": case "toStrictEqual": return `assert.deepStrictEqual(${a}, ${b})`;
    case "not.toEqual": case "not.toStrictEqual": return `assert.notDeepStrictEqual(${a}, ${b})`;
    case "toBeTruthy": return `assert.ok(${a})`;
    case "toBeFalsy": return `assert.ok(!(${a}))`;
    case "toBeNull": return `assert.strictEqual(${a}, null)`;
    case "not.toBeNull": return `assert.notStrictEqual(${a}, null)`;
    case "toBeUndefined": return `assert.strictEqual(${a}, undefined)`;
    case "toBeDefined": case "not.toBeUndefined": return `assert.notStrictEqual(${a}, undefined)`;
    case "toThrow": return b ? `assert.throws(${a}, ${b})` : `assert.throws(${a})`;
    case "not.toThrow": return `assert.doesNotThrow(${a})`;
    case "toContain": return `assert.ok((${a}).includes(${b}))`;
    case "not.toContain": return `assert.ok(!(${a}).includes(${b}))`;
    case "toBeGreaterThan": return `assert.ok((${a}) > (${b}))`;
    case "toBeGreaterThanOrEqual": return `assert.ok((${a}) >= (${b}))`;
    case "toBeLessThan": return `assert.ok((${a}) < (${b}))`;
    case "toBeLessThanOrEqual": return `assert.ok((${a}) <= (${b}))`;
    case "toBeCloseTo": {
      const [want, digits] = splitArgs(b);
      return `assert.ok(Math.abs((${a}) - (${want})) < 10 ** -${digits ?? "2"} / 2)`;
    }
    default: return null;
  }
}

/** Top-level comma split of an argument list (no nesting-aware parsing beyond brackets and strings). */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" || c === '"' || c === "`") { for (i++; i < s.length && s[i] !== c; i++) if (s[i] === "\\") i++; continue; }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) { out.push(s.slice(start, i).trim()); start = i + 1; }
  }
  const last = s.slice(start).trim();
  if (last) out.push(last);
  return out;
}

/**
 * Exercism JS/TS (Jest) tests as `node --test` + node:assert/strict (Q26). Returns null on any Jest feature
 * outside the converted set; the exercise is then skipped and listed in SOURCES.md.
 */
export function jestToNodeTest(src: string, module: string, ext: "js" | "ts"): string | null {
  if (UNSUPPORTED_JEST.test(src)) return null;
  let body = src
    .replace(/^\s*import\s*\{[^}]*\}\s*from\s*['"]@jest\/globals['"];?\s*\n/m, "")
    .replace(new RegExp(`(from\\s*)(['"])\\./${module.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\.(js|ts))?\\2`, "g"), `$1'./solution.${ext}'`)
    .replace(/\bxtest\(/g, "test(").replace(/\btest\.skip\(/g, "test(").replace(/\bxit\(/g, "it(").replace(/\bit\.skip\(/g, "it(")
    .replace(/\bxdescribe\(/g, "describe(").replace(/\bdescribe\.skip\(/g, "describe(");
  let out = "";
  for (;;) {
    const i = body.search(/\bexpect\(/);
    if (i < 0) { out += body; break; }
    const open = body.indexOf("(", i);
    const close = closeParen(body, open);
    if (close < 0) return null;
    const actual = body.slice(open + 1, close - 1).trim();
    const m = /^\.(not\.)?([A-Za-z]+)\(/.exec(body.slice(close));
    if (!m) return null;
    const argOpen = close + m[0].length - 1;
    const argClose = closeParen(body, argOpen);
    if (argClose < 0) return null;
    const conv = assertion(actual, !!m[1], m[2], body.slice(argOpen + 1, argClose - 1).trim());
    if (conv === null) return null;
    out += body.slice(0, i) + conv;
    body = body.slice(argClose);
  }
  const fns = ["describe", "test", "it"].filter((f) => new RegExp(`\\b${f}\\(`).test(out));
  return `import { ${fns.join(", ")} } from "node:test";\nimport assert from "node:assert/strict";\n${out.replace(/^\n+/, "")}`;
}

/** busted's describe/it/assert onto the exam harness's check() (LUA_HEAD defines `check` and `solution`). */
const BUSTED_SHIM = `-- busted shim (lazycourse): describe/it/assert as plain Lua over check()
local _prefix = {}
local function describe(name, f) table.insert(_prefix, name); f(); table.remove(_prefix) end
local function it(name, f) check(table.concat(_prefix, " ") .. ": " .. name, f) end
local function _eq(a, b)
  if type(a) ~= "table" or type(b) ~= "table" then return a == b end
  for k, v in pairs(a) do if not _eq(v, b[k]) then return false end end
  for k in pairs(b) do if a[k] == nil then return false end end
  return true
end
local function _fail(msg) error(msg, 3) end
local _assert = assert
local assert = setmetatable({
  equal = function(want, got) if want ~= got then _fail(("expected %s, got %s"):format(tostring(want), tostring(got))) end end,
  same = function(want, got) if not _eq(want, got) then _fail("tables differ") end end,
  is_true = function(v) if v ~= true then _fail("expected true, got " .. tostring(v)) end end,
  is_false = function(v) if v ~= false then _fail("expected false, got " .. tostring(v)) end end,
  is_nil = function(v) if v ~= nil then _fail("expected nil, got " .. tostring(v)) end end,
  has_error = function(f, msg) local ok, err = pcall(f); if ok then _fail("expected an error") end
    if msg ~= nil and not tostring(err):find(msg, 1, true) then _fail("expected error " .. msg .. ", got " .. tostring(err)) end end,
}, { __call = function(_, v, msg) return _assert(v, msg) end })
assert.are = { equal = assert.equal, same = assert.same }
assert.are_not = { equal = function(a, b) if a == b then _fail("expected values to differ") end end }
assert.is = { ["true"] = assert.is_true, ["false"] = assert.is_false }
assert.equals, assert.are_equal, assert.are_same, assert.error, assert.has = assert.equal, assert.equal, assert.same, assert.has_error, { error = assert.has_error }
`;
const UNSUPPORTED_BUSTED = /\bspy\.|\bstub\(|\bmock\(|before_each|after_each|setup\(|teardown\(|\bpending\(|assert\.(near|matches|is_not|spy|stub|truthy|falsy|returns)/;

export function bustedToHarness(src: string, module: string): string | null {
  if (UNSUPPORTED_BUSTED.test(src)) return null;
  const mod = module.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return BUSTED_SHIM + src.replace(new RegExp(`require\\s*\\(?\\s*['"]${mod}['"]\\s*\\)?`, "g"), "solution");
}

// ---- sources (pinned) ----

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(PKG, "lessons");

interface Source { name: string; repo: string; commit: string; licence: string; licenceFiles: string[] }
const EXERCISM_PYTHON: Source = { name: "exercism-python", repo: "https://github.com/exercism/python", commit: "6105f6d9d3ef66ce3d5c8f529d2882af3d76b706", licence: "MIT", licenceFiles: ["LICENSE"] };

/** Exercism concept slugs → pack vocabulary tags; unmapped slugs keep their own tag (recorded in SOURCES.md). */
const PY_TAGS: Record<string, string[]> = {
  basics: ["variables"], bools: ["booleans"], numbers: ["numbers"], conditionals: ["conditionals"], comparisons: ["conditionals"],
  strings: ["strings"], "string-methods": ["strings"], lists: ["lists"], "list-methods": ["lists"], loops: ["loops"],
  tuples: ["sets-tuples"], dicts: ["dicts"], "dict-methods": ["dicts"], "unpacking-and-multiple-assignment": ["sets-tuples"],
  sets: ["sets-tuples"], classes: ["classes"], generators: ["iterators"],
};
const LEVELS = ["leap", "raindrops", "isogram", "luhn"];

function clone(s: Source): string {
  const dir = mkdtempSync(join(tmpdir(), `vendor-${s.name}-`));
  const git = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
  git("init", "-q"); git("remote", "add", "origin", s.repo); git("fetch", "-q", "--depth", "1", "origin", s.commit); git("checkout", "-q", "FETCH_HEAD");
  return dir;
}

const put = (path: string, text: string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
const readIf = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const json = (p: string) => JSON.parse(readFileSync(p, "utf8")) as Record<string, any>;

function keepLicence(s: Source, src: string, lang: string): void {
  for (const f of s.licenceFiles) cpSync(join(src, f), join(OUT, lang, "licenses", s.name, f));
  put(join(OUT, lang, "licenses", s.name, "NOTICE"), `Content from ${s.repo} at commit ${s.commit}, ${s.licence} licence (text in this folder).\nAdapted for lazycourse: tests converted to run without pytest/Jest/busted; files renamed to the exam layout.\n`);
}

function instructions(docs: string): string {
  const hints = readIf(join(docs, "hints.md")).trim();
  const main = readIf(join(docs, "instructions.md")).trim() + (readIf(join(docs, "instructions.append.md")).trim() ? `\n\n${readIf(join(docs, "instructions.append.md")).trim()}` : "");
  return `${main}\n${hints ? `\n## Hints\n\n${hints.replace(/^# Hints\s*/, "")}\n` : ""}`;
}

/** One Exercism exercise folder → lessons/<lang>/<rel>/ (stub, tests, exemplar, extra helper files). */
function exercismExercise(lang: string, src: string, rel: string, conv: (test: string, module: string) => string | null, stubName: string, testsName: string): string | null {
  const meta = json(join(src, ".meta", "config.json"));
  const files = meta.files as { solution: string[]; test: string[]; exemplar?: string[]; example?: string[]; editor?: string[] };
  const solution = files.solution[0], test = files.test[0], exemplar = (files.exemplar ?? files.example ?? [])[0];
  if (!solution || !test || !exemplar) return "missing solution, test or exemplar";
  const module = solution.replace(/\.[a-z]+$/, "").split("/").pop()!;
  const tests = conv(readFileSync(join(src, test), "utf8"), module);
  if (tests === null) return "tests use features the converter does not support";
  const dest = join(OUT, lang, rel);
  rmSync(dest, { recursive: true, force: true });
  put(join(dest, "instructions.md"), instructions(join(src, ".docs")));
  put(join(dest, stubName), readFileSync(join(src, solution), "utf8"));
  put(join(dest, testsName), tests);
  put(join(dest, ".exemplar", stubName), readFileSync(join(src, exemplar), "utf8"));
  for (const extra of files.editor ?? []) put(join(dest, "files", extra), readFileSync(join(src, extra), "utf8"));
  return null;
}

function python(): void {
  const s = EXERCISM_PYTHON, src = clone(s), lang = "python";
  const config = json(join(src, "config.json"));
  const skipped: string[] = [], lessons: string[] = [];
  let order = 0;
  for (const ex of config.exercises.concept as { slug: string; name: string; concepts: string[]; status?: string }[]) {
    if (ex.status === "deprecated" || ex.status === "wip" || ex.concepts.length === 0) { skipped.push(`${ex.slug}: status ${ex.status ?? "?"}`); continue; }
    const concept = ex.concepts[0];
    const why = exercismExercise(lang, join(src, "exercises", "concept", ex.slug), `${concept}/1-${ex.slug}`, pythonTests, "solution.py", "test_examples.py");
    if (why) { skipped.push(`${ex.slug}: ${why}`); rmSync(join(OUT, lang, concept), { recursive: true, force: true }); continue; }
    const conceptMeta = (config.concepts as { slug: string; name: string }[]).find((c) => c.slug === concept);
    const text = readIf(join(src, "exercises", "concept", ex.slug, ".docs", "introduction.md")).trim() || readIf(join(src, "concepts", concept, "introduction.md")).trim();
    const tags = PY_TAGS[concept] ?? [concept];
    put(join(OUT, lang, concept, "lesson.md"), [
      "---", `concept: ${concept}`, `title: ${JSON.stringify(conceptMeta?.name ?? concept)}`, `tags: [${tags.join(", ")}]`,
      `source: exercism/python ${s.commit.slice(0, 7)} exercises/concept/${ex.slug} (MIT)`, `order: ${++order}`, "---", "",
      text, "", `Source: [Exercism Python track](${s.repo}/tree/${s.commit}/exercises/concept/${ex.slug}), MIT licence.`, "",
    ].join("\n"));
    lessons.push(`- \`${concept}\` (${tags.join(", ")}${PY_TAGS[concept] ? "" : ", own tag"}): exercises/concept/${ex.slug}`);
  }
  LEVELS.forEach((slug, i) => {
    const why = exercismExercise(lang, join(src, "exercises", "practice", slug), `_levels/${i + 1}-${slug}`, pythonTests, "solution.py", "test_examples.py");
    if (why) skipped.push(`practice/${slug}: ${why}`);
  });
  keepLicence(s, src, lang);
  writeSources(lang, [{ s, what: "concept lessons and exercises; level ladder (practice exercises)", lessons, skipped }]);
  rmSync(src, { recursive: true, force: true });
}

/** SOURCES.md: generated part per source, then the hand-written "Our own lessons" part kept as is. */
function writeSources(lang: string, parts: { s: Source; what: string; lessons: string[]; skipped: string[] }[]): void {
  const path = join(OUT, lang, "SOURCES.md");
  const own = readIf(path).split("<!-- own -->")[1] ?? "\n## Our own lessons\n\nNone yet.\n";
  const gen = parts.map(({ s, what, lessons, skipped }) => [
    `## ${s.name}`, "", `- Repo: ${s.repo}`, `- Commit: ${s.commit}`, `- Licence: ${s.licence} (licenses/${s.name}/)`, `- Used for: ${what}`, "",
    "Lessons:", ...lessons, "", "Skipped:", ...(skipped.length ? skipped.map((x) => `- ${x}`) : ["- none"]), "",
  ].join("\n")).join("\n");
  put(path, `# ${lang} lesson sources\n\nGenerated by scripts/vendor-lessons.ts; the part after the marker is written by hand.\n\n${gen}\n<!-- own -->${own}`);
}

const VENDORS: Record<string, () => void> = { python };

if (import.meta.main) {
  const lang = process.argv[2];
  const run = lang ? VENDORS[lang] : undefined;
  if (!run) { process.stderr.write(`usage: node scripts/vendor-lessons.ts <${Object.keys(VENDORS).join("|")}>\n`); process.exit(2); }
  run();
}
