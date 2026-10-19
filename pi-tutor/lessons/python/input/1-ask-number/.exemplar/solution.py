def ask_number(ask):
    while True:
        try:
            return int(ask("Enter a number: "))
        except ValueError:
            print("That was not a whole number, try again.")
