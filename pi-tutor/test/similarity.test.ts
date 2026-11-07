import { describe, it, expect } from "vitest";
import { normalizedTokens, windowOverlap, taskTerms, termHits } from "../extensions/tutor/similarity.js";

// Learner-session fixes Task 6 (spec §5): "unrelated" examples that were the learner's solution, renamed.
const P1T1 = "P1.T1 Generate random secret number and store in variable src/main.py done when: secret_number is int 1-100";
const GAME_LOOP = "import random\nsecret = random.randint(1, 100)\nguess = int(input(\"Guess: \"))\nif guess < secret:\n    print(\"Too low\")\nelif guess > secret:\n    print(\"Too high\")\nelse:\n    print(\"You got it!\")";

describe("normalizedTokens", () => {
  it("identifiers, numbers and strings become placeholders; keywords and operators stay", () => {
    expect(normalizedTokens("total = price * 3 + len('x')")).toEqual(["ID", "=", "ID", "*", "NUM", "+", "ID", "(", "STR", ")"]);
    expect(normalizedTokens("if x: return None")).toEqual(["if", "ID", ":", "return", "None"]);
  });
});

describe("windowOverlap", () => {
  it("renaming does not hide a solution", () => {
    expect(windowOverlap("secret = random.randint(1, 100)\nguess = int(input('Guess: '))",
      "secret_number = random.randint(1, 100)\nguess = int(input('Enter: '))")).toBeGreaterThanOrEqual(0.6);
  });
  it("different code on the same concept is not flagged", () => {
    expect(windowOverlap("die = random.choice(sides)\nprint(die)", "secret_number = random.randint(1, 100)\nguess = int(input('Enter: '))")).toBeLessThan(0.6);
  });
  it("code shorter than one window shares nothing", () => {
    expect(windowOverlap("x = 1", "x = 1")).toBe(0);
  });
});

describe("taskTerms and termHits", () => {
  it("task terms catch the renamed task", () => {
    expect(termHits("number = random.randint(1, 100)", taskTerms(P1T1))).toBe(2);
  });
  it("a concept example on another domain passes", () => {
    expect(termHits("die = random.randint(1, 6)", taskTerms(P1T1))).toBe(1);
  });
  it("before a plan, the project's words count", () => {
    expect(termHits(GAME_LOOP, taskTerms("Number Guessing Game Prompt the user to guess a randomly generated number"))).toBeGreaterThanOrEqual(2);
  });
  it("keywords, builtins, short and common words are not terms", () => {
    const t = taskTerms("Use if/else to check the guess and print the result with input()");
    for (const w of ["if", "else", "print", "input", "the", "with", "use", "and"]) expect(t.has(w)).toBe(false);
    expect(t.has("guess")).toBe(true);
  });
});

describe("re-run finding: a word family meets one stem", () => {
  it("reverse / reversed / reverser and word / words are one term each (the Sentence Word Reverser leak)", () => {
    const terms = taskTerms("Sentence Word Reverser and Counter. Asks for a sentence, then prints each word on a new line in reverse order with total character count");
    const code = 'text = "hello world test"\nwords = text.split()\nfor w in reversed(words):\n    print(w)\nprint("chars:", len(text))';
    expect(termHits(code, terms)).toBeGreaterThanOrEqual(2);
  });
});
