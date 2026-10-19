package lesson

import (
	"bufio"
	"io"
	"strconv"
	"strings"
)

func AskNumber(r io.Reader) int {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		if n, err := strconv.Atoi(strings.TrimSpace(scanner.Text())); err == nil {
			return n
		}
	}
	return 0
}
