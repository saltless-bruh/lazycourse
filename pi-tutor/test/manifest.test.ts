import { describe, it, expect } from "vitest";
import { manifestFor, goVersionOf, starterFor } from "../extensions/tutor/manifest.js";

describe("manifestFor (spec 2026-10-22 §5.1)", () => {
  it("Rust gets a Cargo.toml that is its own workspace", () => {
    const m = manifestFor("rust", "split-bill")!;
    expect(m.rel).toBe("Cargo.toml");
    expect(m.text).toContain('name = "split-bill"');
    expect(m.text).toContain('edition = "2021"');
    expect(m.text).toContain("[workspace]");
  });
  it("Go gets a go.mod naming the installed version, 1.22 when unknown", () => {
    expect(manifestFor("go", "split-bill", "1.27")).toEqual({ rel: "go.mod", text: "module split-bill\n\ngo 1.27\n" });
    expect(manifestFor("go", "split-bill")?.text).toBe("module split-bill\n\ngo 1.22\n");
  });
  it("other languages get none", () => {
    expect(manifestFor("python", "x")).toBeNull();
  });
});

describe("goVersionOf / starterFor", () => {
  it("reads major.minor from `go version`", () => {
    expect(goVersionOf("go version go1.27.3 linux/amd64")).toBe("1.27");
    expect(goVersionOf("nope")).toBeNull();
  });
  it("an empty main for Rust and Go, nothing elsewhere", () => {
    expect(starterFor("rust")).toBe("fn main() {}\n");
    expect(starterFor("go")).toBe("package main\n\nfunc main() {}\n");
    expect(starterFor("python")).toBe("");
  });
});
