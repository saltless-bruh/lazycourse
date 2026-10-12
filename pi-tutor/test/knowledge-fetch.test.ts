import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { fetchKnowledge, cachedSkills, skillName, skillsRoot } from "../extensions/tutor/knowledge/fetch.js";
import { Cancelled } from "../extensions/tutor/progress.js";
import type { Complete } from "../extensions/tutor/llm.js";

let server: Server;
let base = "";
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/style.md") { res.setHeader("content-type", "text/plain"); res.end("# Naming\n\nUse snake_case for functions.\n"); }
    else if (req.url === "/errors.html") { res.setHeader("content-type", "text/html"); res.end("<html><body><h1>Errors</h1><p>Use <b>Result</b>.</p><script>x()</script></body></html>"); }
    else if (req.url === "/slow") { /* never answers */ }
    else { res.statusCode = 404; res.end("nope"); }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.closeAllConnections(); server.close(); });

const root = () => mkdtempSync(join(tmpdir(), "pitutor-skills-"));
const describeReply = (slugs: string[]) => JSON.stringify({ skills: slugs.map((s) => ({ slug: s, description: `Rust ${s} rules. Use when the learner's code touches ${s}.` })) });
function model(...replies: string[]) {
  const calls: { system: string; user: string }[] = [];
  const complete: Complete = async (system, user) => { calls.push({ system, user }); return replies.shift() ?? ""; };
  return { complete, calls };
}

describe("fetchKnowledge", () => {
  it("writes one skill per topic with a model description and the fetched text as references", async () => {
    const dir = root();
    const m = model(describeReply(["style", "errors"]));
    const r = await fetchKnowledge("rust", [
      { slug: "style", title: "Rust naming", urls: [`${base}/style.md`] },
      { slug: "errors", title: "Rust errors", urls: [`${base}/errors.html`] },
    ], { fetch, complete: m.complete, root: dir });
    expect(r).toEqual({ written: ["tutor-rust-style", "tutor-rust-errors"], failed: [] });
    const skill = readFileSync(join(dir, "tutor-rust-style", "SKILL.md"), "utf8");
    expect(skill.startsWith('---\nname: tutor-rust-style\ndescription: "Rust style rules. Use when the learner\'s code touches style."\n---\n# Rust naming\n')).toBe(true);
    expect(skill).toContain("`references/1-style.md`");
    expect(skill).toContain("tutor-rust-style");
    expect(readFileSync(join(dir, "tutor-rust-style", "references", "1-style.md"), "utf8")).toContain("Use snake_case for functions.");
    const html = readFileSync(join(dir, "tutor-rust-errors", "references", "1-errors.md"), "utf8");
    expect(html).toContain("# Errors");
    expect(html).toContain("Use Result.");
    expect(html).not.toContain("x()");
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0].user).toContain("style: Rust naming");
    expect(m.calls[0].user).toContain("Use snake_case");
  });

  it("skips a topic whose urls all fail (404, timeout), reports them, writes the rest", async () => {
    const dir = root();
    const m = model(describeReply(["style"]));
    const r = await fetchKnowledge("rust", [
      { slug: "style", title: "Rust naming", urls: [`${base}/style.md`, `${base}/gone.md`] },
      { slug: "slow", title: "Never", urls: [`${base}/slow`] },
    ], { fetch, complete: m.complete, root: dir, timeoutMs: 200 });
    expect(r.written).toEqual(["tutor-rust-style"]);
    expect(r.failed.map((f) => f.split(":")[0] + ":" + f.split(":")[1] + ":" + f.split(":")[2])).toEqual([`${base}/gone.md`, `${base}/slow`]);
    expect(r.failed[0]).toMatch(/HTTP 404/);
    expect(existsSync(join(dir, "tutor-rust-slow"))).toBe(false);
  });

  it("makes no model call and writes nothing when every download fails", async () => {
    const dir = root();
    const m = model();
    const r = await fetchKnowledge("rust", [{ slug: "style", title: "x", urls: [`${base}/gone.md`] }], { fetch, complete: m.complete, root: dir });
    expect(r.written).toEqual([]);
    expect(m.calls).toHaveLength(0);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("writes nothing when the description reply is rejected twice", async () => {
    const dir = root();
    const m = model('{"skills":[]}', '{"skills":[{"slug":"other","description":"x"}]}');
    await expect(fetchKnowledge("rust", [{ slug: "style", title: "x", urls: [`${base}/style.md`] }], { fetch, complete: m.complete, root: dir }))
      .rejects.toThrow(/rejected twice: .*style/);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("an aborted fetch rejects with Cancelled and leaves existing skills untouched", async () => {
    const dir = root();
    mkdirSync(join(dir, "tutor-rust-style"), { recursive: true });
    writeFileSync(join(dir, "tutor-rust-style", "SKILL.md"), "old");
    const ctl = new AbortController();
    const p = fetchKnowledge("rust", [{ slug: "style", title: "x", urls: [`${base}/slow`] }], { fetch, complete: model().complete, root: dir, signal: ctl.signal, timeoutMs: 10_000 });
    setTimeout(() => ctl.abort(), 50);
    await expect(p).rejects.toBeInstanceOf(Cancelled);
    expect(readFileSync(join(dir, "tutor-rust-style", "SKILL.md"), "utf8")).toBe("old");
    expect(readdirSync(dir)).toEqual(["tutor-rust-style"]);
  });

  it("keeps a reference from the topic's `from` marker on, so a capped page keeps the part that matters (M5 final review I2)", async () => {
    const dir = root();
    await fetchKnowledge("rust", [{ slug: "style", title: "x", urls: [`${base}/style.md`], from: "Use snake_case" }],
      { fetch, complete: model(describeReply(["style"])).complete, root: dir });
    const ref = readFileSync(join(dir, "tutor-rust-style", "references", "1-style.md"), "utf8");
    expect(ref.startsWith("Use snake_case for functions.")).toBe(true);
    expect(ref).not.toContain("# Naming");
  });

  it("a re-fetch replaces the skill folder", async () => {
    const dir = root();
    mkdirSync(join(dir, "tutor-rust-style", "references"), { recursive: true });
    writeFileSync(join(dir, "tutor-rust-style", "references", "stale.md"), "stale");
    await fetchKnowledge("rust", [{ slug: "style", title: "x", urls: [`${base}/style.md`] }], { fetch, complete: model(describeReply(["style"])).complete, root: dir });
    expect(readdirSync(join(dir, "tutor-rust-style", "references"))).toEqual(["1-style.md"]);
  });
});

describe("cachedSkills / skillName / skillsRoot", () => {
  it("lists only fetched skills of that language that have a SKILL.md", () => {
    const dir = root();
    for (const n of ["tutor-rust-style", "tutor-rust-learned-borrow", "tutor-rustlings-x", "tutor-go-style", "tutor-rust-empty"]) mkdirSync(join(dir, n));
    for (const n of ["tutor-rust-style", "tutor-rust-learned-borrow", "tutor-rustlings-x", "tutor-go-style"]) writeFileSync(join(dir, n, "SKILL.md"), "x");
    expect(cachedSkills(dir, "rust")).toEqual(["tutor-rust-style"]);
    expect(cachedSkills(join(dir, "missing"), "rust")).toEqual([]);
    expect(skillName("rust", "style")).toBe("tutor-rust-style");
  });
  it("roots skills under PI_CODING_AGENT_DIR", () => {
    const saved = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = "/agent";
    try { expect(skillsRoot()).toBe("/agent/skills"); } finally {
      if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = saved;
    }
  });
});
