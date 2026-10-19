# Ask for a number

Write `AskNumber(r io.Reader) int` that reads lines from `r` until one is a whole number, and returns it.
Use `bufio.NewScanner(r)` and `strconv.Atoi`.
