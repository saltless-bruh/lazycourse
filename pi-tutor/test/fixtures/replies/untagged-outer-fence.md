```
# Sentence Word Reverser and Counter — overview

## What's happening
The program takes a line of text, splits it into individual words, processes them in reverse order, and reports a count. The data flow is:

```
input sentence → split() → list of words → reversed → print each word → len() → total characters
```

Each step transforms the data: the raw string becomes a list, the list order flips, then each element is output one at a time, while the length is computed from the original or split parts.

## Why
- `input()` gets the user's text as a single string.
- `split()` breaks the string into a list of words (by default on whitespace).
- Reversing the list lets us print words backward without changing the characters inside each word.
- `len()` on the string or on joined words gives the total character count.

## Example — small unrelated snippet
```python
text = "hello world test"
words = text.split()          # ['hello', 'world', 'test']
for w in reversed(words):
    print(w)                  # prints test, world, hello on separate lines
print("chars:", len(text))   # chars: 16
```
*Note: variable names here are generic; the project will use its own.*

## What to try
Take a sentence you just thought of and write one line of Python that splits it into words and prints them backward, one per line. Use a variable name that is not `sentence` or `words`.

## In short
Ask for a sentence, split it, reverse the word order, print each word on its own line, and report the character total.

```tutor-judgment
{"judgment":"none","concept_tags":["strings","loops"],"task_done_ids":[],"episode_closed":false,"step_done":false}
```
Now try writing that one line yourself and let me know what happens.