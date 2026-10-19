# Writes the "input" and "files-io" lessons for go, javascript, typescript, rust and lua (spec 2026-10-19 Q25:
# no established source tests these). Text: verbatim excerpts from each language's official or established
# source; exercises: ours, each trusted only because `npm run lessons` sees its .exemplar pass and its stub fail.
#
# Usage: python3 scripts/gap-lessons.py <sources-dir> lessons
# <sources-dir> holds sparse clones (the commits are recorded in each lessons/<lang>/licenses/*/NOTICE):
#   gbe   https://github.com/mmcgrana/gobyexample   examples/{reading-files,writing-files,line-filters}, README.md
#   book  https://github.com/rust-lang/book         src/ch02-00-guessing-game-tutorial.md, src/ch12-02-reading-a-file.md, LICENSE-*
#   node  https://github.com/nodejs/node            doc/api/{readline,fs}.md, LICENSE
#   lua   https://github.com/lua/lua                manual/manual.of, lua.h
import os, re, shutil, sys

GAP = sys.argv[1]  # the sources dir
L = sys.argv[2]  # pi-tutor/lessons
SHA = {k: os.popen(f"git -C {GAP}/{k} rev-parse HEAD").read().strip() for k in ["gbe", "book", "node", "lua"]}

def put(rel, text):
    p = os.path.join(L, rel); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, "w").write(text)

def lesson(lang, concept, title, tags, source, order, text, link):
    put(f"{lang}/{concept}/lesson.md", f"---\nconcept: {concept}\ntitle: {title}\ntags: [{', '.join(tags)}]\nsource: {source}\norder: {order}\n---\n\n{text.strip()}\n\nSource: {link}\n")

def ex(lang, concept, rel, stub_name, tests_name, instr, stub, tests, exemplar):
    put(f"{lang}/{concept}/{rel}/instructions.md", instr.strip() + "\n")
    put(f"{lang}/{concept}/{rel}/{stub_name}", stub)
    put(f"{lang}/{concept}/{rel}/{tests_name}", tests)
    put(f"{lang}/{concept}/{rel}/.exemplar/{stub_name}", exemplar)

def lines(path, a, b):
    return "\n".join(open(path).read().split("\n")[a - 1:b])

def go_comments(path, first_n_blocks=None):
    """Go by Example: the prose is the // comments; keep them and the code, as a fenced Go block."""
    return "```go\n" + open(path).read().strip() + "\n```"

# ---------- licences ----------
os.makedirs(f"{L}/go/licenses/gobyexample", exist_ok=True)
open(f"{L}/go/licenses/gobyexample/NOTICE", "w").write(
    f"Go by Example (https://gobyexample.com, https://github.com/mmcgrana/gobyexample at commit {SHA['gbe']})\n"
    "is copyright Mark McGranaghan and licensed under a Creative Commons Attribution 3.0 Unported License\n"
    "(http://creativecommons.org/licenses/by/3.0/). Adapted for lazycourse: excerpts cut for length; changes made.\n")
for lang in ["rust"]:
    d = f"{L}/{lang}/licenses/rust-book"; os.makedirs(d, exist_ok=True)
    shutil.copy(f"{GAP}/book/LICENSE-MIT", d); shutil.copy(f"{GAP}/book/LICENSE-APACHE", d)
    open(f"{d}/NOTICE", "w").write(f"The Rust Programming Language (https://github.com/rust-lang/book at commit {SHA['book']}), MIT or Apache-2.0. Excerpts quoted.\n")
for lang in ["javascript", "typescript"]:
    d = f"{L}/{lang}/licenses/nodejs-docs"; os.makedirs(d, exist_ok=True)
    shutil.copy(f"{GAP}/node/LICENSE", d)
    open(f"{d}/NOTICE", "w").write(f"Node.js documentation (https://github.com/nodejs/node doc/api at commit {SHA['node']}), Node.js licence (MIT; text in LICENSE). Excerpts quoted.\n")
d = f"{L}/lua/licenses/lua-manual"; os.makedirs(d, exist_ok=True)
lua_h = open(f"{GAP}/lua/lua.h").read()
start = lua_h.rindex("/*", 0, lua_h.index("* Copyright (C) 1994-"))
open(f"{d}/LICENSE", "w").write(lua_h[start:].split("#endif")[0])
open(f"{d}/NOTICE", "w").write(f"Lua 5.4 reference manual (https://github.com/lua/lua manual/manual.of at commit {SHA['lua']}), Lua licence (MIT-style; text in LICENSE). Excerpts quoted, markup converted.\n")

GBE = f"https://github.com/mmcgrana/gobyexample/tree/{SHA['gbe']}/examples"
ATTR_GO = "Go by Example by Mark McGranaghan, CC BY 3.0 (licenses/gobyexample/NOTICE), excerpt; changes made."

# ---------- Go ----------
lesson("go", "input", '"Reading what the user types"', ["files-io"], f"gobyexample {SHA['gbe'][:7]} examples/line-filters (CC BY 3.0); exercises ours", 30.5,
  "From *Go by Example: Line Filters*, a program that reads input line by line:\n\n" + go_comments(f"{GAP}/gbe/examples/line-filters/line-filters.go") +
  "\n\nIn the exercise the function receives an `io.Reader` instead of using `os.Stdin` directly, so the tests can type for you; "
  "in your program you pass `os.Stdin` itself.",
  f"[{ATTR_GO}]({GBE}/line-filters)")
ex("go", "input", "1-ask-number", "solution.go", "examples_test.go",
 "# Ask for a number\n\nWrite `AskNumber(r io.Reader) int` that reads lines from `r` until one is a whole number, and returns it.\nUse `bufio.NewScanner(r)` and `strconv.Atoi`.\n",
 "package lesson\n\nimport \"io\"\n\nfunc AskNumber(r io.Reader) int {\n\tpanic(\"write AskNumber\")\n}\n",
 "package lesson\n\nimport (\n\t\"strings\"\n\t\"testing\"\n)\n\nfunc TestFirstTry(t *testing.T) {\n\tif got := AskNumber(strings.NewReader(\"7\\n\")); got != 7 {\n\t\tt.Fatalf(\"got %d, want 7\", got)\n\t}\n}\n\nfunc TestKeepsAsking(t *testing.T) {\n\tif got := AskNumber(strings.NewReader(\"seven\\n\\n12\\n\")); got != 12 {\n\t\tt.Fatalf(\"got %d, want 12\", got)\n\t}\n}\n",
 "package lesson\n\nimport (\n\t\"bufio\"\n\t\"io\"\n\t\"strconv\"\n\t\"strings\"\n)\n\nfunc AskNumber(r io.Reader) int {\n\tscanner := bufio.NewScanner(r)\n\tfor scanner.Scan() {\n\t\tif n, err := strconv.Atoi(strings.TrimSpace(scanner.Text())); err == nil {\n\t\t\treturn n\n\t\t}\n\t}\n\treturn 0\n}\n")
lesson("go", "files-io", '"Reading and writing files"', ["files-io"], f"gobyexample {SHA['gbe'][:7]} examples/reading-files, writing-files (CC BY 3.0); exercises ours", 30.6,
  "From *Go by Example: Reading Files* (excerpt):\n\n```go\n" + lines(f"{GAP}/gbe/examples/reading-files/reading-files.go", 15, 31) + "\n```\n\n"
  "From *Go by Example: Writing Files* (excerpt):\n\n```go\n" + lines(f"{GAP}/gbe/examples/writing-files/writing-files.go", 21, 36) + "\n```",
  f"[{ATTR_GO}]({GBE}/reading-files)")
ex("go", "files-io", "1-count-lines", "solution.go", "examples_test.go",
 "# Count lines\n\nWrite `CountLines(path string) (int, error)` that returns how many lines the file at `path` has.\n",
 "package lesson\n\nfunc CountLines(path string) (int, error) {\n\tpanic(\"write CountLines\")\n}\n",
 "package lesson\n\nimport (\n\t\"os\"\n\t\"path/filepath\"\n\t\"testing\"\n)\n\nfunc TestCountLines(t *testing.T) {\n\tp := filepath.Join(t.TempDir(), \"f.txt\")\n\tif err := os.WriteFile(p, []byte(\"a\\nb\\nc\\n\"), 0o644); err != nil {\n\t\tt.Fatal(err)\n\t}\n\tif n, err := CountLines(p); err != nil || n != 3 {\n\t\tt.Fatalf(\"got %d, %v; want 3, nil\", n, err)\n\t}\n}\n\nfunc TestMissingFile(t *testing.T) {\n\tif _, err := CountLines(filepath.Join(t.TempDir(), \"nope\")); err == nil {\n\t\tt.Fatal(\"want an error for a missing file\")\n\t}\n}\n",
 "package lesson\n\nimport (\n\t\"bufio\"\n\t\"os\"\n)\n\nfunc CountLines(path string) (int, error) {\n\tf, err := os.Open(path)\n\tif err != nil {\n\t\treturn 0, err\n\t}\n\tdefer f.Close()\n\tn := 0\n\tscanner := bufio.NewScanner(f)\n\tfor scanner.Scan() {\n\t\tn++\n\t}\n\treturn n, scanner.Err()\n}\n")

# ---------- JavaScript / TypeScript ----------
NODE = f"https://github.com/nodejs/node/blob/{SHA['node']}/doc/api"
rl_example = lines(f"{GAP}/node/doc/api/readline.md", 32, 47)
fs_read = lines(f"{GAP}/node/doc/api/fs.md", 6839, 6839) + "\n\n" + "Returns the contents of the `path`.\n\nIf the `encoding` option is specified then this function returns a\nstring. Otherwise it returns a buffer."
def js_like(lang, ext, order):
    T = (lambda js, ts: ts if lang == "typescript" else js)
    lesson(lang, "input", '"Reading what the user types"', ["node-apis" if lang == "javascript" else "async"], f"nodejs/node {SHA['node'][:7]} doc/api/readline.md (Node.js licence); exercises ours", order,
      "From the Node.js documentation, *Readline* (excerpt):\n\n" + rl_example.replace("```mjs", "```js") +
      "\n\n`rl.question()` returns a promise of the typed line, so the function that asks is `async`. In the exercise the "
      "function receives `ask` (like `rl.question`) instead of making its own interface, so the tests can type for you.",
      f"[Node.js docs, readline]({NODE}/readline.md), Node.js licence (licenses/nodejs-docs/), excerpt.")
    ex(lang, "input", "1-ask-number", f"solution.{ext}", f"examples.exam.{ext}",
     "# Ask for a number\n\nWrite `askNumber(ask)` that awaits `ask(\"Enter a number: \")` until the answer is a whole number, and returns it as a number.\n`ask` works like `rl.question`: it returns a promise of the typed text.\n",
     T("export async function askNumber(ask) {\n  throw new Error(\"write askNumber\");\n}\n",
       "export async function askNumber(ask: (prompt: string) => Promise<string>): Promise<number> {\n  throw new Error(\"write askNumber\");\n}\n"),
     f"import {{ test }} from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport {{ askNumber }} from \"./solution.{ext}\";\n\n"
     "const typed = (...answers" + T("", ": string[]") + ") => async () => answers.shift()" + T("", " ?? \"\"") + ";\n\n"
     "test(\"first try\", async () => { assert.strictEqual(await askNumber(typed(\"7\")), 7); });\n"
     "test(\"keeps asking\", async () => { assert.strictEqual(await askNumber(typed(\"seven\", \"\", \"12\")), 12); });\n",
     T("export async function askNumber(ask) {\n  for (;;) {\n    const text = (await ask(\"Enter a number: \")).trim();\n    if (/^-?\\d+$/.test(text)) return Number(text);\n  }\n}\n",
       "export async function askNumber(ask: (prompt: string) => Promise<string>): Promise<number> {\n  for (;;) {\n    const text = (await ask(\"Enter a number: \")).trim();\n    if (/^-?\\d+$/.test(text)) return Number(text);\n  }\n}\n"))
    lesson(lang, "files-io", '"Reading and writing files"', ["node-apis" if lang == "javascript" else "modules"], f"nodejs/node {SHA['node'][:7]} doc/api/fs.md (Node.js licence); exercises ours", order + 0.1,
      "From the Node.js documentation, *File system* (excerpt):\n\n" + fs_read.replace("### `", "**`").replace(")`\n", ")`**\n") +
      "\n\n`fs.appendFileSync(path, data)` adds `data` to the end of the file, creating the file if it does not exist yet.",
      f"[Node.js docs, fs]({NODE}/fs.md), Node.js licence (licenses/nodejs-docs/), excerpt.")
    ex(lang, "files-io", "1-count-lines", f"solution.{ext}", f"examples.exam.{ext}",
     "# Count lines\n\nWrite `countLines(path)` that returns how many lines the text file at `path` has (`readFileSync(path, \"utf8\")`).\n",
     T("export function countLines(path) {\n  throw new Error(\"write countLines\");\n}\n", "export function countLines(path: string): number {\n  throw new Error(\"write countLines\");\n}\n"),
     f"import {{ test }} from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport {{ mkdtempSync, writeFileSync }} from \"node:fs\";\nimport {{ tmpdir }} from \"node:os\";\nimport {{ join }} from \"node:path\";\nimport {{ countLines }} from \"./solution.{ext}\";\n\n"
     "const file = (text" + T("", ": string") + ") => { const p = join(mkdtempSync(join(tmpdir(), \"cl-\")), \"f.txt\"); writeFileSync(p, text); return p; };\n"
     "test(\"three lines\", () => { assert.strictEqual(countLines(file(\"a\\nb\\nc\\n\")), 3); });\n"
     "test(\"empty file\", () => { assert.strictEqual(countLines(file(\"\")), 0); });\n",
     T("import { readFileSync } from \"node:fs\";\n\nexport function countLines(path) {\n  const text = readFileSync(path, \"utf8\");\n  return text === \"\" ? 0 : text.replace(/\\n$/, \"\").split(\"\\n\").length;\n}\n",
       "import { readFileSync } from \"node:fs\";\n\nexport function countLines(path: string): number {\n  const text = readFileSync(path, \"utf8\");\n  return text === \"\" ? 0 : text.replace(/\\n$/, \"\").split(\"\\n\").length;\n}\n"))
js_like("javascript", "js", 40.5)
js_like("typescript", "ts", 40.5)

# ---------- Rust ----------
BOOK = f"https://github.com/rust-lang/book/blob/{SHA['book']}/src"
lesson("rust", "input", '"Reading what the user types"', ["strings"], f"rust-lang/book {SHA['book'][:7]} ch02 (MIT/Apache-2.0); exercises ours", 50.5,
  "From *The Rust Programming Language*, chapter 2 (excerpt):\n\n" + re.sub(r"\[(`[^`]+`)\]\[[a-z_]+\]", r"\1", re.sub(r"<!--\s*ignore\s*-->", "", lines(f"{GAP}/book/src/ch02-00-guessing-game-tutorial.md", 181, 195))) +
  "\n\nIn the exercise the function reads from any `BufRead` instead of `std::io::stdin()`, so the tests can type for you; in your program you pass `std::io::stdin().lock()`.",
  f"[The Rust Book, ch. 2]({BOOK}/ch02-00-guessing-game-tutorial.md), MIT or Apache-2.0 (licenses/rust-book/), excerpt.")
ex("rust", "input", "1-ask-number", "src/lib.rs", "tests/examples.rs",
 "# Ask for a number\n\nWrite `pub fn ask_number<R: std::io::BufRead>(input: &mut R) -> i64` that reads lines with `read_line` until one is a whole number, and returns it.\n",
 "pub fn ask_number<R: std::io::BufRead>(input: &mut R) -> i64 {\n    todo!(\"write ask_number\")\n}\n",
 "use exam::ask_number;\nuse std::io::Cursor;\n\n#[test]\nfn first_try() {\n    assert_eq!(ask_number(&mut Cursor::new(\"7\\n\")), 7);\n}\n\n#[test]\nfn keeps_asking() {\n    assert_eq!(ask_number(&mut Cursor::new(\"seven\\n\\n12\\n\")), 12);\n}\n",
 "pub fn ask_number<R: std::io::BufRead>(input: &mut R) -> i64 {\n    loop {\n        let mut line = String::new();\n        if input.read_line(&mut line).unwrap_or(0) == 0 {\n            return 0;\n        }\n        if let Ok(n) = line.trim().parse() {\n            return n;\n        }\n    }\n}\n")
lesson("rust", "files-io", '"Reading and writing files"', ["error-handling"], f"rust-lang/book {SHA['book'][:7]} ch12-02 (MIT/Apache-2.0); exercises ours", 50.6,
  "From *The Rust Programming Language*, section 12.2 *Reading a File* (excerpt):\n\n" + lines(f"{GAP}/book/src/ch12-02-reading-a-file.md", 32, 34) +
  "\n\n`std::fs::OpenOptions::new().append(true).create(true).open(path)` opens a file for appending, creating it when it does not exist; "
  "`writeln!(file, \"{}\", text)` then writes a line.",
  f"[The Rust Book, 12.2]({BOOK}/ch12-02-reading-a-file.md), MIT or Apache-2.0 (licenses/rust-book/), excerpt.")
ex("rust", "files-io", "1-count-lines", "src/lib.rs", "tests/examples.rs",
 "# Count lines\n\nWrite `pub fn count_lines(path: &str) -> std::io::Result<usize>` that returns how many lines the file at `path` has (`std::fs::read_to_string`).\n",
 "pub fn count_lines(path: &str) -> std::io::Result<usize> {\n    todo!(\"write count_lines\")\n}\n",
 "use exam::count_lines;\nuse std::fs;\n\nfn file(name: &str, text: &str) -> String {\n    let dir = std::env::temp_dir().join(format!(\"cl-{}-{}\", std::process::id(), name));\n    fs::create_dir_all(&dir).unwrap();\n    let p = dir.join(\"f.txt\");\n    fs::write(&p, text).unwrap();\n    p.to_string_lossy().into_owned()\n}\n\n#[test]\nfn three_lines() {\n    assert_eq!(count_lines(&file(\"three\", \"a\\nb\\nc\\n\")).unwrap(), 3);\n}\n\n#[test]\nfn missing_file_is_an_error() {\n    assert!(count_lines(\"/nonexistent/lazycourse/f.txt\").is_err());\n}\n",
 "pub fn count_lines(path: &str) -> std::io::Result<usize> {\n    Ok(std::fs::read_to_string(path)?.lines().count())\n}\n")

# ---------- Lua ----------
of = open(f"{GAP}/lua/manual/manual.of").read()
def lua_entry(name):
    s = of.index("@LibEntry{" + name)
    body = of[s:of.index("\n}\n", s)]
    body = body.split("|", 1)[1]
    for a, b in [(r"@T\{([^}]*)\}", r"`\1`"), (r"@id\{([^}]*)\}", r"`\1`"), (r"@Rw\{([^}]*)\}", r"`\1`"), (r"@St\{([^}]*)\}", r'`"\1"`'), (r"@nil", "`nil`"), (r"@Cdots", "...")]:
        body = re.sub(a, b, body)
    return f"**`{name}`**\n\n" + body.strip()
MAN = f"https://github.com/lua/lua/blob/{SHA['lua']}/manual/manual.of"
lesson("lua", "input", '"Reading what the user types"', ["functions"], f"lua/lua {SHA['lua'][:7]} manual io.read (Lua licence); exercises ours", 10.5,
  "From the Lua reference manual (excerpt, markup converted):\n\n" + lua_entry("io.read").split("The formats")[0].strip() +
  "\n\n`io.read(\"l\")` reads one line (without the newline) and returns `nil` at the end of the input. In the exercise the function receives "
  "`read` instead of calling `io.read` directly, so the tests can type for you.",
  f"[Lua 5.4 manual, io.read]({MAN}), Lua licence (licenses/lua-manual/), excerpt.")
ex("lua", "input", "1-ask-number", "solution.lua", "examples_test.lua",
 "# Ask for a number\n\nWrite `M.ask_number(read)` that calls `read()` until it returns a line holding a whole number, and returns that number.\n",
 "local M = {}\n\nfunction M.ask_number(read)\n  error(\"write ask_number\")\nend\n\nreturn M\n",
 "local function typed(...)\n  local answers, i = { ... }, 0\n  return function() i = i + 1; return answers[i] end\nend\ncheck(\"first try\", function() assert(solution.ask_number(typed(\"7\")) == 7) end)\ncheck(\"keeps asking\", function() assert(solution.ask_number(typed(\"seven\", \"\", \"12\")) == 12) end)\n",
 "local M = {}\n\nfunction M.ask_number(read)\n  while true do\n    local line = read()\n    if line == nil then return nil end\n    local n = tonumber(line)\n    if n and n == math.floor(n) then return n end\n  end\nend\n\nreturn M\n")
lesson("lua", "files-io", '"Reading and writing files"', ["functions"], f"lua/lua {SHA['lua'][:7]} manual io.lines, io.open (Lua licence); exercises ours", 10.6,
  "From the Lua reference manual (excerpts, markup converted):\n\n" + lua_entry("io.lines") + "\n\n" + lua_entry("io.open").split("@description")[0].strip() +
  " The mode string can be `\"r\"` (read, the default), `\"w\"` (write) or `\"a\"` (append), among others.",
  f"[Lua 5.4 manual, io library]({MAN}), Lua licence (licenses/lua-manual/), excerpt.")
ex("lua", "files-io", "1-count-lines", "solution.lua", "examples_test.lua",
 "# Count lines\n\nWrite `M.count_lines(path)` that returns how many lines the file at `path` has (`io.lines`).\n",
 "local M = {}\n\nfunction M.count_lines(path)\n  error(\"write count_lines\")\nend\n\nreturn M\n",
 "local function file(text)\n  local p = os.tmpname()\n  local f = assert(io.open(p, \"w\")); f:write(text); f:close()\n  return p\nend\ncheck(\"three lines\", function() assert(solution.count_lines(file(\"a\\nb\\nc\\n\")) == 3) end)\ncheck(\"empty file\", function() assert(solution.count_lines(file(\"\")) == 0) end)\n",
 "local M = {}\n\nfunction M.count_lines(path)\n  local n = 0\n  for _ in io.lines(path) do n = n + 1 end\n  return n\nend\n\nreturn M\n")
print("ok")
