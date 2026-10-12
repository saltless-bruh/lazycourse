import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// v1 source lists (spec §7): official style guide, idioms, stdlib/core per language. Raw text where possible.
export interface Topic { slug: string; title: string; urls: string[] }

const RAW = "https://raw.githubusercontent.com";
export const SOURCES: Readonly<Record<string, Topic[]>> = {
  python: [
    { slug: "style", title: "Python style guide (PEP 8)", urls: [`${RAW}/python/peps/main/peps/pep-0008.rst`] },
    { slug: "idioms", title: "Python control flow and idioms", urls: [`${RAW}/python/cpython/main/Doc/tutorial/controlflow.rst`] },
    { slug: "stdlib", title: "Python standard library tour", urls: [`${RAW}/python/cpython/main/Doc/tutorial/stdlib.rst`] },
  ],
  rust: [
    { slug: "style", title: "Rust API naming guidelines", urls: [`${RAW}/rust-lang/api-guidelines/master/src/naming.md`] },
    { slug: "ownership", title: "Rust ownership", urls: [`${RAW}/rust-lang/book/main/src/ch04-01-what-is-ownership.md`] },
    { slug: "errors", title: "Rust error handling with Result", urls: [`${RAW}/rust-lang/book/main/src/ch09-02-recoverable-errors-with-result.md`] },
  ],
  go: [
    { slug: "style", title: "Go code review comments", urls: [`${RAW}/golang/wiki/master/CodeReviewComments.md`] },
    { slug: "idioms", title: "Effective Go", urls: [`${RAW}/golang/website/master/_content/doc/effective_go.html`] },
  ],
  typescript: [
    { slug: "types", title: "TypeScript everyday types", urls: [`${RAW}/microsoft/TypeScript-Website/v2/packages/documentation/copy/en/handbook-v2/Everyday%20Types.md`] },
    { slug: "narrowing", title: "TypeScript narrowing", urls: [`${RAW}/microsoft/TypeScript-Website/v2/packages/documentation/copy/en/handbook-v2/Narrowing.md`] },
  ],
  lua: [
    { slug: "style", title: "Lua style guide", urls: ["http://lua-users.org/wiki/LuaStyleGuide"] },
    { slug: "stdlib", title: "Lua 5.4 reference manual", urls: ["https://www.lua.org/manual/5.4/manual.html"] },
  ],
};

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function sourcesPath(): string {
  return process.env.PI_TUTOR_SOURCES || join(homedir(), ".config", "nvim-tutor", "sources.json");
}

function validTopic(t: unknown): t is Topic {
  const o = t as Partial<Topic> | null;
  return !!o && typeof o.slug === "string" && SLUG.test(o.slug) && typeof o.title === "string" && o.title.trim() !== ""
    && Array.isArray(o.urls) && o.urls.length > 0 && o.urls.every((u) => typeof u === "string" && /^https?:\/\//.test(u));
}

/** Built-in list, unless the override file names the language (spec §9 "knowledge source overrides"). */
export function topicsFor(language: string): Topic[] | undefined {
  let override: Record<string, unknown> = {};
  try { override = JSON.parse(readFileSync(sourcesPath(), "utf8")) as Record<string, unknown>; } catch { /* missing or broken: built-ins */ }
  if (override && typeof override === "object" && language in override) {
    const list = override[language];
    return Array.isArray(list) ? list.filter(validTopic) : [];
  }
  return SOURCES[language];
}
