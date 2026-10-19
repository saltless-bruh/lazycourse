---
concept: files-io
title: "Reading and writing files"
tags: [files-io]
source: gobyexample 28c81a7 examples/reading-files, writing-files (CC BY 3.0); exercises ours
order: 30.6
---

From *Go by Example: Reading Files* (excerpt):

```go
// Reading files requires checking most calls for errors.
// This helper will streamline our error checks below.
func check(e error) {
	if e != nil {
		panic(e)
	}
}

func main() {

	// Perhaps the most basic file reading task is
	// slurping a file's entire contents into memory.
	path := filepath.Join(os.TempDir(), "dat")
	dat, err := os.ReadFile(path)
	check(err)
	fmt.Print(string(dat))

```

From *Go by Example: Writing Files* (excerpt):

```go
	// To start, here's how to dump a string (or just
	// bytes) into a file.
	d1 := []byte("hello\ngo\n")
	path1 := filepath.Join(os.TempDir(), "dat1")
	err := os.WriteFile(path1, d1, 0644)
	check(err)

	// For more granular writes, open a file for writing.
	path2 := filepath.Join(os.TempDir(), "dat2")
	f, err := os.Create(path2)
	check(err)

	// It's idiomatic to defer a `Close` immediately
	// after opening a file.
	defer f.Close()

```

Source: [Go by Example by Mark McGranaghan, CC BY 3.0 (licenses/gobyexample/NOTICE), excerpt; changes made.](https://github.com/mmcgrana/gobyexample/tree/28c81a7a0eb874a1c062ae28d19b88effd24620f/examples/reading-files)
