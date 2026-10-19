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
    // Prettier leaves a trailing comma inside multi-line calls: expect(\n  f(x),\n).toBe(\n  y,\n).
    const actual = body.slice(open + 1, close - 1).trim().replace(/,$/, "").trim();
    const m = /^\.(not\.)?([A-Za-z]+)\(/.exec(body.slice(close));
    if (!m) return null;
    const argOpen = close + m[0].length - 1;
    const argClose = closeParen(body, argOpen);
    if (argClose < 0) return null;
    const conv = assertion(actual, !!m[1], m[2], body.slice(argOpen + 1, argClose - 1).trim().replace(/,$/, "").trim());
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
const src = (name: string, repo: string, commit: string): Source => ({ name, repo, commit, licence: "MIT", licenceFiles: ["LICENSE"] });
const EX = {
  python: src("exercism-python", "https://github.com/exercism/python", "6105f6d9d3ef66ce3d5c8f529d2882af3d76b706"),
  go: src("exercism-go", "https://github.com/exercism/go", "74f09b25dd12c14571cc684a7cb57149634037bd"),
  javascript: src("exercism-javascript", "https://github.com/exercism/javascript", "ff04f35158cdf61eebfdf18a774010495a1fd6d9"),
  typescript: src("exercism-typescript", "https://github.com/exercism/typescript", "a24e6ae756c61932165bb7d0a2703417a8291af3"),
  rust: src("exercism-rust", "https://github.com/exercism/rust", "cc099ae090a6acbe6f53f1e36325263046ba333e"),
  lua: src("exercism-lua", "https://github.com/exercism/lua", "02837e0e92766d5b786c5a354e789073c970e5aa"),
};
const RUSTLINGS = src("rustlings", "https://github.com/rust-lang/rustlings", "bc8e51115c9304fbd036f5d6fca683e71363468f");
const LEVELS = ["leap", "raindrops", "isogram", "luhn"];

/** The pack's concept vocabulary (packs/<lang>/card.md): a slug that is a tag or an alias maps onto the tag. */
function vocabulary(lang: string): Map<string, string> {
  const out = new Map<string, string>();
  const card = readIf(join(PKG, "packs", lang, "card.md"));
  for (const m of card.matchAll(/^- `([^`]+)`:[^\n]*?(?:\(aliases: ([^)]*)\))?$/gm)) {
    out.set(m[1], m[1]);
    for (const a of (m[2] ?? "").split(",").map((x) => x.trim()).filter(Boolean)) out.set(a, m[1]);
  }
  return out;
}
/** Exercism concept slugs the pack vocabulary does not name, mapped by hand onto its tags. */
const EXTRA_TAGS: Record<string, Record<string, string>> = {
  python: { basics: "variables", bools: "booleans", comparisons: "conditionals", "unpacking-and-multiple-assignment": "sets-tuples" },
  go: { basics: "variables", "string-formatting": "strings", "strings-package": "strings", runes: "strings", "type-conversion": "types", "zero-values": "variables" },
  javascript: { basics: "variables", booleans: "types", "type-conversion": "types", "arithmetic-operators": "numbers", "template-strings": "strings", "rest-and-spread": "objects", "array-destructuring": "objects", "object-destructuring": "objects", "array-analysis": "arrays", "array-loops": "arrays", "array-transformations": "arrays", sets: "maps-sets" },
  typescript: { basics: "types", booleans: "types", "type-conversion": "types", "template-strings": "types", "array-analysis": "arrays", "array-loops": "arrays", "array-transformations": "arrays", "array-destructuring": "objects", "object-destructuring": "objects", "rest-and-spread": "objects", sets: "objects" },
  rust: { variables: "ownership", "move-semantics": "ownership", vecs: "collections", hashmaps: "collections", options: "option", "vec-macro": "collections", "vec-stack": "collections", "entry-api": "collections" },
  lua: { basics: "functions" },
};
function tagsFor(vocab: Map<string, string>, concepts: string[], lang = ""): string[] {
  const one = (c: string) => vocab.get(c) ?? EXTRA_TAGS[lang]?.[c] ?? (c.endsWith("-methods") ? vocab.get(c.replace(/-methods$/, "s")) ?? vocab.get(c.replace(/-methods$/, "")) : undefined) ?? c;
  return [...new Set(concepts.map(one))];
}

function clone(s: Source): string {
  const dir = mkdtempSync(join(tmpdir(), `vendor-${s.name}-`));
  const git = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
  git("init", "-q"); git("remote", "add", "origin", s.repo); git("fetch", "-q", "--depth", "1", "origin", s.commit); git("checkout", "-q", "FETCH_HEAD");
  return dir;
}

const put = (path: string, text: string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
const readIf = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const json = (p: string) => JSON.parse(readFileSync(p, "utf8")) as Record<string, any>;

function keepLicence(s: Source, from: string, lang: string): void {
  for (const f of s.licenceFiles) cpSync(join(from, f), join(OUT, lang, "licenses", s.name, f));
  put(join(OUT, lang, "licenses", s.name, "NOTICE"), `Content from ${s.repo} at commit ${s.commit}, ${s.licence} licence (text in this folder).\nAdapted for lazycourse: tests converted to run without pytest/Jest/busted; files renamed to the exam layout.\n`);
}

function instructions(docs: string): string {
  const hints = readIf(join(docs, "hints.md")).trim();
  const main = readIf(join(docs, "instructions.md")).trim() + (readIf(join(docs, "instructions.append.md")).trim() ? `\n\n${readIf(join(docs, "instructions.append.md")).trim()}` : "");
  return `${main}\n${hints ? `\n## Hints\n\n${hints.replace(/^# Hints\s*/, "")}\n` : ""}`;
}

/** How one language's exercises land in the exam layout. */
interface Track {
  stub: string; tests: string;
  conv(test: string, module: string): string | null;
  /** Rewrites a helper file the source ships (Rust's Cargo.toml gains [workspace]). */
  fixExtra?(name: string, text: string): string;
  /** Files the exercise folder carries that its tests need (Go's go.mod pins the Go version the tests use). */
  alsoCopy?: string[];
}
const TRACKS: Record<string, Track> = {
  python: { stub: "solution.py", tests: "test_examples.py", conv: pythonTests },
  go: { stub: "solution.go", tests: "examples_test.go", conv: (t) => t, alsoCopy: ["go.mod"] },
  javascript: { stub: "solution.js", tests: "examples.exam.js", conv: (t, m) => jestToNodeTest(t, m, "js") },
  typescript: { stub: "solution.ts", tests: "examples.exam.ts", conv: (t, m) => jestToNodeTest(t, m, "ts") },
  rust: {
    stub: "src/lib.rs", tests: "tests/examples.rs", conv: rustTests,
    // Like the exam layout: [workspace] keeps the exercise its own workspace inside the learner's cargo project.
    fixExtra: (name, text) => (name === "Cargo.toml" && !/^\[workspace\]/m.test(text) ? `${text.trimEnd()}\n\n[workspace]\n` : text),
  },
  lua: { stub: "solution.lua", tests: "examples_test.lua", conv: bustedToHarness },
};

/** Exercism Rust: every test runs (Exercism marks all but the first `#[ignore]`). */
export function rustTests(src: string): string {
  return src.split("\n").filter((l) => !/^\s*#\[ignore\]\s*$/.test(l)).join("\n");
}

/** One Exercism exercise folder → lessons/<lang>/<rel>/ (stub, tests, exemplar, helper files). */
function exercismExercise(lang: string, from: string, rel: string, track: Track): string | null {
  const meta = json(join(from, ".meta", "config.json"));
  const files = meta.files as { solution: string[]; test: string[]; exemplar?: string[]; example?: string[]; editor?: string[] };
  const solution = files.solution[0], test = files.test[0], exemplar = (files.exemplar ?? files.example ?? [])[0];
  if (!solution || !test || !exemplar) return "missing solution, test or exemplar";
  const module = solution.replace(/\.[a-z]+$/, "").split("/").pop()!;
  const tests = track.conv(readFileSync(join(from, test), "utf8"), module);
  if (tests === null) return "tests use features the converter does not support";
  const dest = join(OUT, lang, rel);
  rmSync(dest, { recursive: true, force: true });
  put(join(dest, "instructions.md"), instructions(join(from, ".docs")));
  put(join(dest, track.stub), readFileSync(join(from, solution), "utf8"));
  put(join(dest, track.tests), tests);
  put(join(dest, ".exemplar", track.stub), readFileSync(join(from, exemplar), "utf8"));
  for (const extra of [...files.solution.slice(1), ...files.test.slice(1), ...(files.editor ?? []), ...(track.alsoCopy ?? []).filter((f) => existsSync(join(from, f)))]) {
    put(join(dest, "files", extra), (track.fixExtra ?? ((_n, t) => t))(extra, readFileSync(join(from, extra), "utf8")));
  }
  return null;
}

interface Part { s: Source; what: string; lessons: string[]; skipped: string[] }

/** Exercism concept exercises as lessons (text: the exercise's introduction) into `lang`'s lessons. */
function exercismConcepts(lang: string, s: Source, from: string, track: Track, vocab: Map<string, string>, startOrder: number, opts: { drop?: Record<string, string>; note?: string } = {}): Part {
  const config = json(join(from, "config.json"));
  const part: Part = { s, what: "concept lessons and exercises", lessons: [], skipped: [] };
  let order = startOrder;
  const exercises = config.exercises.concept as { slug: string; concepts: string[]; prerequisites?: string[]; status?: string }[];
  // A prerequisite names a concept; the lesson that teaches it is named after its exercise's first concept.
  const teaches = new Map(exercises.flatMap((e) => e.concepts.map((c) => [c, e.concepts[0]] as const)));
  for (const ex of exercises) {
    if (ex.status === "deprecated" || ex.status === "wip" || ex.concepts.length === 0) { part.skipped.push(`${ex.slug}: status ${ex.status ?? "?"}`); continue; }
    if (opts.drop?.[ex.slug]) { part.skipped.push(`${ex.slug}: ${opts.drop[ex.slug]}`); rmSync(join(OUT, lang, ex.concepts[0] ?? ex.slug), { recursive: true, force: true }); continue; }
    const concept = ex.concepts[0];
    const why = exercismExercise(lang, join(from, "exercises", "concept", ex.slug), `${concept}/1-${ex.slug}`, track);
    if (why) { part.skipped.push(`${ex.slug}: ${why}`); rmSync(join(OUT, lang, concept), { recursive: true, force: true }); continue; }
    let text = readIf(join(from, "exercises", "concept", ex.slug, ".docs", "introduction.md")).trim() || readIf(join(from, "concepts", concept, "introduction.md")).trim();
    for (const f of TEXT_FIXES.filter((x) => x.slug === ex.slug && text.includes(x.from))) {
      text = text.split(f.from).join(f.to);
      part.skipped.push(`${ex.slug}: text fixed (${f.why})`);
    }
    const tags = tagsFor(vocab, ex.concepts, lang);
    const name = (config.concepts as { slug: string; name: string }[]).find((c) => c.slug === concept)?.name ?? concept;
    put(join(OUT, lang, concept, "lesson.md"), [
      "---", `concept: ${concept}`, `title: ${JSON.stringify(name)}`, `tags: [${tags.join(", ")}]`,
      `source: ${s.name} ${s.commit.slice(0, 7)} exercises/concept/${ex.slug} (MIT)`,
      `requires: [${[...new Set((ex.prerequisites ?? []).map((c) => teaches.get(c) ?? c))].filter((c) => c !== concept).join(", ")}]`, `order: ${++order}`, "---", "",
      text, ...(opts.note ? ["", opts.note] : []), "", `Source: [${s.name}](${s.repo}/tree/${s.commit}/exercises/concept/${ex.slug}), MIT licence.`, "",
    ].join("\n"));
    part.lessons.push(`- \`${concept}\` (${tags.join(", ")}): exercises/concept/${ex.slug}`);
  }
  pruneRequires(lang, part);
  return part;
}

/** A prerequisite no lesson of `lang` teaches (its exercise was skipped) cannot be planned: drop it and list it. */
function pruneRequires(lang: string, part: Part): void {
  const base = join(OUT, lang), names = new Set<string>();
  const lessonFiles = readdirSync(base).map((d) => join(base, d, "lesson.md")).filter((f) => existsSync(f));
  for (const f of lessonFiles) {
    const t = readFileSync(f, "utf8");
    names.add(t.match(/^concept: (.+)$/m)![1]);
    for (const tag of t.match(/^tags: \[(.*)\]$/m)![1].split(", ").filter(Boolean)) names.add(tag);
  }
  for (const f of lessonFiles) {
    const t = readFileSync(f, "utf8"), m = t.match(/^requires: \[(.*)\]$/m);
    if (!m || !t.includes(`source: ${part.s.name} `)) continue;
    const all = m[1].split(", ").filter(Boolean), gone = all.filter((c) => !names.has(c));
    if (!gone.length) continue;
    writeFileSync(f, t.replace(m[0], `requires: [${all.filter((c) => names.has(c)).join(", ")}]`));
    part.skipped.push(`${t.match(/^concept: (.+)$/m)![1]}: prerequisites ${gone.join(", ")} dropped (no lesson teaches them)`);
  }
}

function exercismLevels(lang: string, s: Source, from: string, track: Track, part: Part): void {
  part.what = part.what ? `${part.what}; level ladder (practice exercises)` : "level ladder (practice exercises)";
  LEVELS.forEach((slug, i) => {
    const why = exercismExercise(lang, join(from, "exercises", "practice", slug), `_levels/${i + 1}-${slug}`, track);
    if (why) part.skipped.push(`practice/${slug}: ${why}`);
  });
}

/** SOURCES.md: generated part per source, then the hand-written part after the marker, kept as is. */
function writeSources(lang: string, parts: Part[]): void {
  const path = join(OUT, lang, "SOURCES.md");
  const own = readIf(path).split("<!-- own -->")[1] ?? "\n## Our own lessons\n\nNone yet.\n";
  const gen = parts.map(({ s, what, lessons, skipped }) => [
    `## ${s.name}`, "", `- Repo: ${s.repo}`, `- Commit: ${s.commit}`, `- Licence: ${s.licence} (licenses/${s.name}/)`, `- Used for: ${what}`, "",
    "Lessons:", ...(lessons.length ? lessons : ["- none (level ladder only)"]), "", "Skipped:", ...(skipped.length ? skipped.map((x) => `- ${x}`) : ["- none"]), "",
  ].join("\n")).join("\n");
  put(path, `# ${lang} lesson sources\n\nGenerated by scripts/vendor-lessons.ts; the part after the marker is written by hand.\n\n${gen}\n<!-- own -->${own}`);
}

/** Upstream text defects found by `npm run lessons`, fixed when vendoring and listed in SOURCES.md. */
const TEXT_FIXES: { slug: string; from: string; to: string; why: string }[] = [
  { slug: "recycling-robot", from: "[historical reasons][`typeof null` is `\"object\"`]", to: "[historical reasons][typeof null is object]", why: "a reference link whose label did not match its definition" },
];

/** Exercises that failed `npm run lessons` (exemplar did not pass or stub did not fail): dropped and listed. */
const DROP: Record<string, Record<string, string>> = {
  python: {},
  go: { "weather-forecast": "its test reads its own source file by name (to check comments); the renamed layout breaks that" },
  javascript: {}, typescript: {},
  rust: { "resistor-color": "it needs external crates (enum-iterator, int-enum), and exercises run offline in the sandbox" },
  lua: {},
};

function exercismLanguage(lang: string, opts: { levels?: boolean } = {}): Part[] {
  const s = EX[lang as keyof typeof EX], from = clone(s);
  const part = exercismConcepts(lang, s, from, TRACKS[lang], vocabulary(lang), 0, { drop: DROP[lang] });
  if (opts.levels !== false) exercismLevels(lang, s, from, TRACKS[lang], part);
  keepLicence(s, from, lang);
  rmSync(from, { recursive: true, force: true });
  return [part];
}

/** TypeScript has no concept syllabus (Q25): the JavaScript track's concept exercises, which are valid
 *  TypeScript, run as .ts; the level ladder comes from the TypeScript track. Marked thin in the README. */
function typescript(): Part[] {
  const js = EX.javascript, jsFrom = clone(js);
  const lessons = exercismConcepts("typescript", js, jsFrom, TRACKS.typescript, vocabulary("typescript"), 0, {
    drop: DROP.typescript,
    note: "TypeScript runs this JavaScript as it is; types are added on top. See the TypeScript Handbook, *The Basics* (https://www.typescriptlang.org/docs/handbook/2/basic-types.html).",
  });
  keepLicence(js, jsFrom, "typescript");
  rmSync(jsFrom, { recursive: true, force: true });
  const ts = EX.typescript, tsFrom = clone(ts);
  const levels: Part = { s: ts, what: "", lessons: [], skipped: [] };
  exercismLevels("typescript", ts, tsFrom, TRACKS.typescript, levels);
  keepLicence(ts, tsFrom, "typescript");
  rmSync(tsFrom, { recursive: true, force: true });
  return [lessons, levels];
}

/** Rust: rustlings topics with real #[test]s (the topic README as text) first, then Exercism's concept exercises. */
function rust(): Part[] {
  const r = RUSTLINGS, from = clone(r), vocab = vocabulary("rust");
  const part: Part = { s: r, what: "topic lessons (README) and exercises with #[test]", lessons: [], skipped: [] };
  const topics = readdirSync(join(from, "exercises")).filter((d) => /^\d\d_/.test(d)).sort();
  let order = 0;
  for (const topic of topics) {
    const concept = topic.replace(/^\d\d_/, "").replace(/_/g, "-");
    const files = readdirSync(join(from, "exercises", topic)).filter((f) => f.endsWith(".rs")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const kept: string[] = [];
    for (const f of files) {
      const stub = readFileSync(join(from, "exercises", topic, f), "utf8"), sol = readIf(join(from, "solutions", topic, f));
      const name = f.replace(/\.rs$/, "");
      if (!/#\[test\]/.test(stub)) { part.skipped.push(`${topic}/${f}: no #[test] (a "make it compile" exercise)`); continue; }
      if (!sol) { part.skipped.push(`${topic}/${f}: no solution`); continue; }
      if (DROP.rust[`${topic}/${f}`]) { part.skipped.push(`${topic}/${f}: ${DROP.rust[`${topic}/${f}`]}`); rmSync(join(OUT, "rust", concept, `${kept.length + 1}-${name}`), { recursive: true, force: true }); continue; }
      const dest = join(OUT, "rust", concept, `${kept.length + 1}-${name}`);
      rmSync(dest, { recursive: true, force: true });
      put(join(dest, "instructions.md"), `# ${name}\n\nMake the tests in \`src/lib.rs\` pass: follow the \`TODO\` comments in the file.\n`);
      put(join(dest, "src/lib.rs"), stub);
      put(join(dest, "tests/examples.rs"), "");
      put(join(dest, ".exemplar/src/lib.rs"), sol);
      kept.push(f);
    }
    if (!kept.length) { rmSync(join(OUT, "rust", concept), { recursive: true, force: true }); continue; }
    const tags = tagsFor(vocab, [concept], "rust");
    put(join(OUT, "rust", concept, "lesson.md"), [
      "---", `concept: ${concept}`, `title: ${JSON.stringify(concept)}`, `tags: [${tags.join(", ")}]`,
      `source: rustlings ${r.commit.slice(0, 7)} exercises/${topic} (MIT)`, `order: ${++order}`, "---", "",
      readIf(join(from, "exercises", topic, "README.md")).trim(), "", `Source: [rustlings exercises/${topic}](${r.repo}/tree/${r.commit}/exercises/${topic}), MIT licence.`, "",
    ].join("\n"));
    part.lessons.push(`- \`${concept}\` (${tags.join(", ")}): exercises/${topic} (${kept.join(", ")})`);
  }
  keepLicence(r, from, "rust");
  rmSync(from, { recursive: true, force: true });
  const e = EX.rust, eFrom = clone(e);
  const ex = exercismConcepts("rust", e, eFrom, TRACKS.rust, vocab, 100, { drop: DROP.rust });
  exercismLevels("rust", e, eFrom, TRACKS.rust, ex);
  keepLicence(e, eFrom, "rust");
  rmSync(eFrom, { recursive: true, force: true });
  return [part, ex];
}

const VENDORS: Record<string, () => Part[]> = {
  python: () => exercismLanguage("python"), go: () => exercismLanguage("go"), javascript: () => exercismLanguage("javascript"),
  lua: () => exercismLanguage("lua"), typescript, rust,
};

if (import.meta.main) {
  const lang = process.argv[2];
  const run = lang ? VENDORS[lang] : undefined;
  if (!run) { process.stderr.write(`usage: node scripts/vendor-lessons.ts <${Object.keys(VENDORS).join("|")}>\n`); process.exit(2); }
  writeSources(lang!, run());
}
