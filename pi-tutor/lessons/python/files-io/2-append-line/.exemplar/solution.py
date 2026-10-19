def append_line(path, text):
    with open(path, "a", encoding="utf-8") as f:
        f.write(text + "\n")
