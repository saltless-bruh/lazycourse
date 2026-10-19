def parse_age(text):
    age = int(text)
    if age < 0:
        raise ValueError("an age cannot be negative")
    return age
