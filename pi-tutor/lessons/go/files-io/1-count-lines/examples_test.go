package lesson

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCountLines(t *testing.T) {
	p := filepath.Join(t.TempDir(), "f.txt")
	if err := os.WriteFile(p, []byte("a\nb\nc\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if n, err := CountLines(p); err != nil || n != 3 {
		t.Fatalf("got %d, %v; want 3, nil", n, err)
	}
}

func TestMissingFile(t *testing.T) {
	if _, err := CountLines(filepath.Join(t.TempDir(), "nope")); err == nil {
		t.Fatal("want an error for a missing file")
	}
}
