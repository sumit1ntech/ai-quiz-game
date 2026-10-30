#Login system for the Quiz Game
# user_data = {
#     "sumitbhaya": "1234",
#     "debjeet": "4567"
# }
#!don't copy my code
#jbabfb?
import json
import os
import sys
from pathlib import Path

import ui
from ui import C

BASE_DIR = Path(__file__).resolve().parent
database = BASE_DIR / "user_data.json"


def ask(prompt):
    """input() that exits gracefully on Ctrl+D instead of dumping a traceback."""
    try:
        return input(prompt)
    except EOFError:
        print(f"\n\n{C.GREY}👋 Goodbye!{C.RESET}")
        sys.exit(0)


def load_users():
    """Read user_data.json safely. Never crashes on a missing/empty/broken file."""
    if not os.path.exists(database):
        return {}
    try:
        with open(database, "r") as file:
            data = json.load(file)
    except (json.JSONDecodeError, OSError):
        return {}
    # Extra safety check: if it's not a dictionary, reset it
    return data if isinstance(data, dict) else {}


def save_users(users):
    with open(database, "w") as file:
        json.dump(users, file, indent=4)


def log_in():
    """Ask for credentials until they are correct. Returns the username."""
    print()
    ui.box("🔐 LOGIN", width=50)
    print()
    while True:
        username = ask(f"   {C.GREY}👤 Username{C.RESET} {C.CYAN}›{C.RESET} ").strip().lower()
        password = ask(f"   {C.GREY}🔑 Password{C.RESET} {C.CYAN}›{C.RESET} ")
        if user_data.get(username) == password:
            print(f"\n   {C.GREEN}✅ Welcome back, {C.BOLD}{username}{C.RESET}{C.GREEN}!{C.RESET}")
            return username
        print(f"   {C.RED}❌ Invalid username or password.{C.RESET} Try again.\n")


user_data = load_users()

# Module-level on purpose: ai_quiz.py uses login.user_name after importing this file
user_name = None

print()
ui.box("🎓 ULTIMATE QUIZ GAME", width=52, color=C.MAGENTA)
print(ui.centered(f"{C.GREY}test your knowledge · one question at a time{C.RESET}"))

#Asking for Login or Signup
while True:
    print()
    ui.box("ACCOUNT MENU", width=52)
    print()
    print(f"   {C.CYAN}{C.BOLD}1{C.RESET}  ✨ Sign Up")
    print(f"   {C.CYAN}{C.BOLD}2{C.RESET}  🔓 Log In")
    print(f"   {C.GREY}0{C.RESET}  🚪 Quit")
    if not user_data:
        print(f"\n   {C.GREY}No accounts yet — pick 1 to create one.{C.RESET}")
    ui.rule()
    choice = ask(f"   {C.YELLOW}👉 Choose an option{C.RESET} {C.CYAN}›{C.RESET} ").strip()

    #checking the user inputs
    if choice == "1":
        print()
        ui.box("✨ CREATE ACCOUNT", width=50, color=C.GREEN)
        print()
        username = ask(f"   {C.GREY}👤 Username{C.RESET} {C.CYAN}›{C.RESET} ").strip().lower()
        password = ask(f"   {C.GREY}🔑 Password{C.RESET} {C.CYAN}›{C.RESET} ")
        if not username or not password:
            print(f"\n   {C.YELLOW}⚠️  Username and password cannot be empty!{C.RESET}")
        elif username in user_data:
            print(f"\n   {C.RED}❌ Username already exists!{C.RESET} Try another.")
        else:
            user_data[username] = password
            save_users(user_data)
            print(f"\n   {C.GREEN}🎉 Account created, {C.BOLD}{username}{C.RESET}{C.GREEN}!{C.RESET}")
            print(f"   {C.GREY}🔓 Please log in to continue.{C.RESET}")
            user_name = log_in()
            break

    elif choice == "2":
        user_name = log_in()
        break

    elif choice in {"0", "q", "quit"}:
        print(f"\n{C.GREY}👋 Goodbye!{C.RESET}\n")
        sys.exit(0)

    else:
        print(f"\n   {C.YELLOW}⚠️  Invalid choice — pick 1, 2, or 0.{C.RESET}")

print(f"\n{C.GREY}✅ Logged in as {C.BOLD}{user_name}{C.RESET}")
