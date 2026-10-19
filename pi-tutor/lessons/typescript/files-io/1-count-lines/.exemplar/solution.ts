import { readFileSync } from "node:fs";

export function countLines(path: string): number {
  const text = readFileSync(path, "utf8");
  return text === "" ? 0 : text.replace(/\n$/, "").split("\n").length;
}
