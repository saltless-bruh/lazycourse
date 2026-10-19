# Instructions

You are helping your younger sister with her English vocabulary homework, which she is finding very tedious.
 Her class is learning to create new words by adding _prefixes_ and _suffixes_.
 Given a set of words, the teacher is looking for correctly transformed words with correct spelling by adding the prefix to the beginning or the suffix to the ending.

The assignment has four activities, each with a set of text or words to work with.


## 1. Add a prefix to a word

One of the most common prefixes in English is `un`, meaning "not".
 In this activity, your sister needs to make negative, or "not" words by adding `un` to them.

Implement the `add_prefix_un(<word>)` function that takes `word` as a parameter and returns a new `un` prefixed word:


```python
>>> add_prefix_un("happy")
'unhappy'

>>> add_prefix_un("manageable")
'unmanageable'
```


## 2. Add prefixes to word groups

There are four more common prefixes that your sister's class is studying:
 `en` (_meaning to 'put into' or 'cover with'_),
 `pre` (_meaning 'before' or 'forward'_),
 `auto` (_meaning 'self' or 'same'_),
  and `inter` (_meaning 'between' or 'among'_).

 In this exercise, the class is creating groups of vocabulary words using these prefixes, so they can be studied together.
 Each prefix comes in a list with common words it's used with.
 The students need to apply the prefix and produce a string that shows the prefix applied to all of the words.

Implement the `make_word_groups(<vocab_words>)` function that takes a `vocab_words` as a parameter in the following form:
 `[<prefix>, <word_1>, <word_2> .... <word_n>]`, and returns a string with the prefix applied to each word that looks like:
  `'<prefix> :: <prefix><word_1> :: <prefix><word_2> :: <prefix><word_n>'`.

Creating a `for` or `while` loop to process the input is not needed here.
Think carefully about which string methods (and delimiters) you could use instead.


```python
>>> make_word_groups(['en', 'close', 'joy', 'lighten'])
'en :: enclose :: enjoy :: enlighten'

>>> make_word_groups(['pre', 'serve', 'dispose', 'position'])
'pre :: preserve :: predispose :: preposition'

>> make_word_groups(['auto', 'didactic', 'graph', 'mate'])
'auto :: autodidactic :: autograph :: automate'

>>> make_word_groups(['inter', 'twine', 'connected', 'dependent'])
'inter :: intertwine :: interconnected :: interdependent'
```


## 3. Remove a suffix from a word

`ness` is a common suffix that means _'state of being'_.
 In this activity, your sister needs to find the original root word by removing the `ness` suffix.
  But of course there are pesky spelling rules: If the root word originally ended in a consonant followed by a 'y', then the 'y' was changed to 'i'.
 Removing 'ness' needs to restore the 'y' in those root words. e.g. `happiness` --> `happi` --> `happy`.

Implement the `remove_suffix_ness(<word>)` function that takes in a `word`, and returns the root word without the `ness` suffix.


```python
>>> remove_suffix_ness("heaviness")
'heavy'

>>> remove_suffix_ness("sadness")
'sad'
```

## 4. Extract and transform a word

Suffixes are often used to change the part of speech a word is assigned to.
 A common practice in English is "verbing" or "verbifying" -- where an adjective _becomes_ a verb by adding an `en` suffix.

In this task, your sister is going to practice "verbing" words by extracting an adjective from a sentence and turning it into a verb.
 Fortunately, all the words that need to be transformed here are "regular" - they don't need spelling changes to add the suffix.

Implement the `adjective_to_verb(<sentence>, <index>)` function that takes two parameters.
 A `sentence` using the vocabulary word, and the `index` of the word, once that sentence is split apart.
 The function should return the extracted adjective as a verb.


```python
>>> adjective_to_verb('I need to make that bright.', -1 )
'brighten'

>>> adjective_to_verb('It got dark as the sun set.', 2)
'darken'
```

## Hints

## General

- The Python Docs [Tutorial for strings][python-str-doc] has an overview of the Python `str` type.
- String methods [`str.join()`][str-join] and [`str.split()`][str-split] ar very helpful when processing strings.
- The Python Docs on [Sequence Types][common sequence operations] has a rundown of operations common to all sequences, including `strings`, `lists`, `tuples`, and `ranges`.

There's four activities in the assignment, each with a set of text or words to work with.

## 1. Add a prefix to a word

- Small strings can be concatenated with the `+` operator.

## 2. Add prefixes to word groups

- Believe it or not, [`str.join()`][str-join] is all you need here.  **A loop is not required**.
- The tests will be feeding your function a `list`.  There will be no need to alter this `list` if you can figure out a good delimiter string.
- Remember that delimiter strings go between elements and "glue" them together into a single string. Delimiters are inserted _without_ space, although you can include space characters within them.
- Like [`str.split()`][str-split], `str.join()` can process an arbitrary-length string, made up of any unicode code points. _Unlike_ `str.split()`, it can also process arbitrary-length iterables like `list`, `tuple`, and `set`.

## 3. Remove a suffix from a word

- Strings can be indexed or sliced from either the left (starting at 0) or the right (starting at -1).
- If you want the last code point of an arbitrary-length string, you can use `[-1]`.
- The last three letters in a string can be "sliced off" using a negative index. e.g. `beautiful'[:-3] == 'beauti`

## 4. Extract and transform a word

- Using [`str.split()`][str-split] returns a `list` of strings broken on white space.
- `lists` are sequences, and can be indexed.
- [`str.split()`][str-split] can be directly indexed: `'Exercism rocks!'.split()[0] == 'Exercism'`
- Be careful of punctuation! Periods can be removed via slice: `'dark.'[:-1] == 'dark'`


[common sequence operations]: https://docs.python.org/3/library/stdtypes.html#text-sequence-type-str
[python-str-doc]: https://docs.python.org/3/tutorial/introduction.html#strings
[str-join]: https://docs.python.org/3/library/stdtypes.html#str.join
[str-split]: https://docs.python.org/3/library/stdtypes.html#str.split
