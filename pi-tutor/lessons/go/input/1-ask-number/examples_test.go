package lesson

import (
	"strings"
	"testing"
)

func TestFirstTry(t *testing.T) {
	if got := AskNumber(strings.NewReader("7\n")); got != 7 {
		t.Fatalf("got %d, want 7", got)
	}
}

func TestKeepsAsking(t *testing.T) {
	if got := AskNumber(strings.NewReader("seven\n\n12\n")); got != 12 {
		t.Fatalf("got %d, want 12", got)
	}
}
