import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { fetchReference, referenceInfo, devdocsUrls, skillsRoot, SKILL_FORMAT } from "../extensions/tutor/knowledge/reference.js";
import { Cancelled } from "../extensions/tutor/progress.js";
import { parseSkillHeader } from "../extensions/tutor/learn.js";

const catalog = [
  { name: "Python", slug: "python~3.14", type: "python", version: "3.14", release: "3.14.8", mtime: 100, db_size: 10, attribution: "&copy; PSF" },
  { name: "Slow", slug: "slow", type: "slow", version: "", release: "1.0", mtime: 1, db_size: 1, attribution: "" },
  { name: "Broken", slug: "broken", type: "broken", version: "", release: "1.0", mtime: 1, db_size: 1, attribution: "" },
];
const index = { entries: [{ name: "pathlib.Path.rglob", path: "library/pathlib#rglob", type: "Files" }], types: [{ name: "Files", count: 1, slug: "files" }] };
const db = { "library/pathlib": '<h1>pathlib</h1><p id="rglob">Path.rglob(pattern)</p>' };

let server: Server;
let base = "";
let hits: string[] = [];
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = (req.url ?? "").split("?")[0];
    hits.push(url);
    if (url === "/docs.json") return res.end(JSON.stringify(catalog));
    if (url === "/python~3.14/index.json") return res.end(JSON.stringify(index));
    if (url === "/python~3.14/db.json") return res.end(JSON.stringify(db));
    if (url === "/broken/index.json") return res.end(JSON.stringify(index));
    if (url.startsWith("/slow/")) return; // never answers
    res.statusCode = 404; res.end("nope");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.closeAllConnections(); server.close(); });
beforeEach(() => { hits = []; process.env.PI_TUTOR_DEVDOCS = base; });

const root = () => mkdtempSync(join(tmpdir(), "pitutor-ref-"));
const deps = (dir: string, over: Record<string, unknown> = {}) => ({ fetch, root: dir, installed: "3.14.8", devdocsType: "python", ...over });

describe("fetchReference", () => {
  it("downloads the matching bundle and writes a loadable tutor-<lang>-ref skill", async () => {
    const dir = root();
    const r = await fetchReference("python", deps(dir));
    expect(r).toMatchObject({ status: "fetched", name: "tutor-python-ref", entries: 1, meta: { slug: "python~3.14", release: "3.14.8", mtime: 100, installed: "3.14.8", note: "" } });
    const skill = join(dir, "tutor-python-ref");
    expect(parseSkillHeader(readFileSync(join(skill, "SKILL.md"), "utf8")).name).toBe("tutor-python-ref");
    expect(readFileSync(join(skill, "INDEX.md"), "utf8")).toMatch(/- pathlib\.Path\.rglob → references\/library_pathlib\.md:\d+/);
    expect(readFileSync(join(skill, "references", "library_pathlib.md"), "utf8")).toContain("Path.rglob(pattern)");
    expect(referenceInfo(dir, "python")).toEqual(r.meta);
    expect(hits).toEqual(["/docs.json", "/python~3.14/index.json", "/python~3.14/db.json"]);
  });

  it("skips the download when the same bundle build is already there, unless forced", async () => {
    const dir = root();
    await fetchReference("python", deps(dir));
    hits = [];
    expect((await fetchReference("python", deps(dir))).status).toBe("cached");
    expect(hits).toEqual(["/docs.json"]);
    expect((await fetchReference("python", deps(dir, { force: true }))).status).toBe("fetched");
  });

  it("a skill written by an older SKILL.md format is refreshed in place, without the big download (live finding)", async () => {
    const dir = root();
    await fetchReference("python", deps(dir));
    const metaFile = join(dir, "tutor-python-ref", ".devdocs.json");
    const old = JSON.parse(readFileSync(metaFile, "utf8"));
    delete old.format; // as written before the format number existed
    writeFileSync(metaFile, JSON.stringify(old));
    writeFileSync(join(dir, "tutor-python-ref", "SKILL.md"), "---\nname: tutor-python-ref\ndescription: \"old\"\n---\nold steps\n");
    hits = [];
    const r = await fetchReference("python", deps(dir));
    expect(r.status).toBe("refreshed");
    expect(hits).toEqual(["/docs.json", "/python~3.14/index.json"]);
    expect(readFileSync(join(dir, "tutor-python-ref", "SKILL.md"), "utf8")).toMatch(/not a line in INDEX\.md/);
    expect(referenceInfo(dir, "python")?.format).toBe(SKILL_FORMAT);
  });

  it("a changed installed version refreshes SKILL.md from the small index, without the big download (final review I2)", async () => {
    const dir = root();
    await fetchReference("python", deps(dir, { installed: "3.14.2" }));
    hits = [];
    const r = await fetchReference("python", deps(dir, { installed: "3.14.8" }));
    expect(r.status).toBe("refreshed");
    expect(hits).toEqual(["/docs.json", "/python~3.14/index.json"]);
    expect(referenceInfo(dir, "python")?.installed).toBe("3.14.8");
    expect(readFileSync(join(dir, "tutor-python-ref", "SKILL.md"), "utf8")).toContain("Installed python: 3.14.8.");
    expect(readFileSync(join(dir, "tutor-python-ref", "references", "library_pathlib.md"), "utf8")).toContain("Path.rglob");
  });

  it("an abort mid-download rejects with Cancelled, keeps the old skill, leaves no temp folder", async () => {
    const dir = root();
    mkdirSync(join(dir, "tutor-slow-ref"));
    writeFileSync(join(dir, "tutor-slow-ref", "SKILL.md"), "old");
    const ctl = new AbortController();
    const p = fetchReference("slow", deps(dir, { devdocsType: "slow", installed: null, signal: ctl.signal }));
    setTimeout(() => ctl.abort(), 50);
    await expect(p).rejects.toBeInstanceOf(Cancelled);
    expect(readFileSync(join(dir, "tutor-slow-ref", "SKILL.md"), "utf8")).toBe("old");
    expect(readdirSync(dir)).toEqual(["tutor-slow-ref"]);
  });

  it("a failed download (404) throws and writes nothing", async () => {
    const dir = root();
    await expect(fetchReference("broken", deps(dir, { devdocsType: "broken", installed: null }))).rejects.toThrow(/HTTP 404/);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("throws when DevDocs has no bundle for the language", async () => {
    await expect(fetchReference("cobol", deps(root(), { devdocsType: "cobol" }))).rejects.toThrow(/no cobol documentation/);
  });
});

describe("devdocsUrls / skillsRoot", () => {
  it("defaults to devdocs.io and honours PI_TUTOR_DEVDOCS as one mirror base", () => {
    process.env.PI_TUTOR_DEVDOCS = "http://mirror.local/dd/";
    expect(devdocsUrls()).toEqual({ catalog: "http://mirror.local/dd/docs.json", documents: "http://mirror.local/dd" });
    delete process.env.PI_TUTOR_DEVDOCS;
    expect(devdocsUrls()).toEqual({ catalog: "https://devdocs.io/docs.json", documents: "https://documents.devdocs.io" });
  });
  it("roots skills under PI_CODING_AGENT_DIR", () => {
    const saved = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = "/agent";
    try { expect(skillsRoot()).toBe("/agent/skills"); } finally {
      if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = saved;
    }
  });
});
