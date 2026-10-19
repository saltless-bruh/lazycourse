# Lessons

Learn-first lessons (spec `docs/superpowers/specs/2026-10-19-onboarding-conversation-design.md` §7, §7a).
Content is vendored from established, openly licensed curricula by `scripts/vendor-lessons.mjs` and never
generated. `npm run lessons` checks every exercise: its exemplar passes and its stub fails.

```
lessons/<language>/
  SOURCES.md                     each source: repo, pinned commit, licence, attribution; skipped items and why
  licenses/<source>/LICENSE      verbatim licence text (+ NOTICE)
  <concept>/lesson.md            front matter: concept, title, tags (pack vocabulary), source, requires, order
                                 requires: the lessons it builds on (Exercism's `prerequisites`; ours from what
                                 the exemplar uses; rustlings states none, so every earlier lesson)
                                 body: the lesson text (vendored; edited only to cut), about 60 lines at most
  <concept>/<n>-<slug>/          one exercise, n = 1.. easiest first
      instructions.md            the source's instructions (+ its hints under "Hints")
      <stub file>                the exam layout's stub name (python: solution.py)
      <tests file>               the exam layout's tests name (python: test_examples.py); for Lua only the
                                 check(...) lines, wrapped by the exam harness when written
      .exemplar/<stub file>      the reference solution; never copied to the learner
  _levels/<n>-<slug>/            the level ladder, same shape: 1-leap, 2-raindrops, 3-isogram, 4-luhn
```
