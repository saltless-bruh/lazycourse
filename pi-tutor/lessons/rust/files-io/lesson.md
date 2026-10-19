---
concept: files-io
title: "Reading and writing files"
tags: [error-handling]
source: rust-lang/book 1500248 ch12-02 (MIT/Apache-2.0); exercises ours
order: 50.6
---

From *The Rust Programming Language*, section 12.2 *Reading a File* (excerpt):

In `main`, the new statement `fs::read_to_string` takes the `file_path`, opens
that file, and returns a value of type `std::io::Result<String>` that contains
the file’s contents.

`std::fs::OpenOptions::new().append(true).create(true).open(path)` opens a file for appending, creating it when it does not exist; `writeln!(file, "{}", text)` then writes a line.

Source: [The Rust Book, 12.2](https://github.com/rust-lang/book/blob/1500248d8f230566e4ec9f27fcbb8fe9e2898ab1/src/ch12-02-reading-a-file.md), MIT or Apache-2.0 (licenses/rust-book/), excerpt.
