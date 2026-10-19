---
concept: files-io
title: "Reading and writing files"
tags: [modules]
source: nodejs/node bb3f917 doc/api/fs.md (Node.js licence); exercises ours
order: 40.6
---

From the Node.js documentation, *File system* (excerpt):

**`fs.readFileSync(path[, options])`**

Returns the contents of the `path`.

If the `encoding` option is specified then this function returns a
string. Otherwise it returns a buffer.

`fs.appendFileSync(path, data)` adds `data` to the end of the file, creating the file if it does not exist yet.

Source: [Node.js docs, fs](https://github.com/nodejs/node/blob/bb3f9176ca9ae9cc304bd460969046340c14d4a0/doc/api/fs.md), Node.js licence (licenses/nodejs-docs/), excerpt.
