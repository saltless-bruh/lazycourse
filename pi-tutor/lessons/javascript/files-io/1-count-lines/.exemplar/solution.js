import { readFileSync } from "node:fs";

export function countLines(path) {
  const text = readFileSync(path, "utf8");
  return text === "" ? 0 : text.replace(/\n$/, "").split("\n").length;
}
