def count_lines(path):
    with open(path, encoding="utf-8") as f:
        return sum(1 for _ in f)
