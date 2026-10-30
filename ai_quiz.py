# Quiz Game
# * Main file for the Quiz Game
# * Importing the login system from quiz_login_sys.py

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv  # type: ignore
from google import genai
from google.genai import types
from pydantic import BaseModel

import ui
from ui import C

BASE_DIR = Path(__file__).resolve().parent

# One place to change the model. Override with GEMINI_MODEL=... in .env
DEFAULT_MODEL = "gemini-3.5-flash-lite"
OPTIONS_PER_QUESTION = 4
MAX_QUESTIONS = 10
LETTERS = "ABCD"


# --- The shape we ask Gemini to fill in -------------------------------------
class Question(BaseModel):
    question: str
    options: list[str]
    answer: int  # 0-based index into options


class Quiz(BaseModel):
    questions: list[Question]


# --- Setup ------------------------------------------------------------------
def get_client():
    """Load .env, validate the API key, and build a client (or exit cleanly)."""
    load_dotenv(dotenv_path=BASE_DIR / ".env")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print(f"{C.YELLOW}⚠️  GEMINI_API_KEY not found.{C.RESET}")
        print(f"   Create {BASE_DIR / '.env'} with this line:")
        print(f"   {C.DIM}GEMINI_API_KEY=your_key_here{C.RESET}")
        sys.exit(1)

    return genai.Client(api_key=api_key)


def check_api(client):
    """Small live test of the API. Returns True on success."""
    model = os.getenv("GEMINI_MODEL", DEFAULT_MODEL)
    try:
        response = client.models.generate_content(
            model=model,
            contents="Reply with exactly: Gemini API is working!",
        )
    except Exception as error:
        message = str(error)
        print(f"{C.RED}❌ API TEST FAILED{C.RESET}")
        print(f"   {type(error).__name__}: {message[:300]}")

        # Point at the most likely cause instead of a bare traceback
        if "API key" in message or "401" in message or "403" in message:
            print(f"   {C.YELLOW}👉 Your GEMINI_API_KEY looks invalid.{C.RESET} Get one at https://aistudio.google.com/apikey")
        elif "429" in message:
            print(f"   {C.YELLOW}👉 Rate limit hit.{C.RESET} Wait a minute and try again.")
        elif "404" in message or "not found" in message.lower():
            print(f"   {C.YELLOW}👉 Model '{model}' is not available.{C.RESET} Set GEMINI_MODEL in .env.")
        else:
            print(f"   {C.YELLOW}👉 Check your internet connection, then retry.{C.RESET}")
        return False

    print(f"{C.GREEN}✅ API TEST SUCCESSFUL{C.RESET}")
    print(f"   {C.GREY}model:{C.RESET} {model}")
    print(f"   {C.GREY}reply:{C.RESET} {(response.text or '').strip()}")
    return True


# --- Generating the quiz ----------------------------------------------------
def generate_quiz(client, topic, count):
    """Ask Gemini for `count` MCQs about `topic`. Returns a list of dicts."""
    model = os.getenv("GEMINI_MODEL", DEFAULT_MODEL)
    prompt = (
        f"Create {count} multiple-choice quiz questions about: {topic}\n"
        "Rules:\n"
        f"- Each question has exactly {OPTIONS_PER_QUESTION} options.\n"
        "- Exactly one option is correct.\n"
        "- 'answer' is the 0-based index of the correct option (0 to 3).\n"
        "- No duplicate questions. No explanations. No numbering inside the text.\n"
        "- Keep every question and option under 90 characters."
    )

    try:
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=Quiz,
            ),
        )
    except Exception as error:
        print(f"{C.RED}❌ Could not generate questions:{C.RESET} {type(error).__name__}: {str(error)[:200]}")
        return []

    quiz = response.parsed
    if quiz is None:
        # Fallback: parse the raw JSON ourselves if the SDK handed back text only
        try:
            quiz = Quiz(**json.loads(response.text or ""))
        except Exception:
            print(f"{C.RED}❌ Gemini replied with something I could not read.{C.RESET} Try again.")
            return []

    return clean_questions(quiz.questions)


def clean_questions(questions):
    """Throw away anything malformed so the game can never crash mid-quiz."""
    good, seen = [], set()
    for item in questions:
        text = item.question.strip()
        options = [str(option).strip() for option in item.options if str(option).strip()]

        try:
            answer = int(item.answer)
        except (TypeError, ValueError):
            continue

        if not text or len(options) != OPTIONS_PER_QUESTION:
            continue
        if not 0 <= answer < OPTIONS_PER_QUESTION:
            continue
        if text.lower() in seen:
            continue

        seen.add(text.lower())
        good.append({"question": text, "options": options, "answer": answer})
    return good


# --- Playing ----------------------------------------------------------------
def ask(prompt):
    """input() that exits gracefully on Ctrl+D instead of dumping a traceback."""
    try:
        return input(prompt)
    except EOFError:
        print(f"\n\n{C.GREY}👋 Goodbye!{C.RESET}")
        sys.exit(0)


def ask_number(prompt, low, high, default=None):
    """Read a whole number in [low, high], re-asking until it is valid."""
    while True:
        raw = ask(prompt).strip()
        if not raw and default is not None:
            return default
        if raw.isdigit() and low <= int(raw) <= high:
            return int(raw)
        print(f"{C.YELLOW}⚠️  Please enter a number from {low} to {high}.{C.RESET}")


def ask_answer(prompt):
    """Read an answer as A-D or 1-4, re-asking until it is valid."""
    while True:
        raw = ask(prompt).strip().upper()
        if raw in LETTERS[:OPTIONS_PER_QUESTION]:
            return LETTERS.index(raw) + 1
        if raw.isdigit() and 1 <= int(raw) <= OPTIONS_PER_QUESTION:
            return int(raw)
        print(f"  {C.YELLOW}⚠️  Pick one of {LETTERS[:OPTIONS_PER_QUESTION]} or 1-{OPTIONS_PER_QUESTION}.{C.RESET}")


def run_quiz(questions, topic):
    """Ask every question. Returns (score, total)."""
    score = 0
    total = len(questions)

    for index, item in enumerate(questions, start=1):
        print()
        print(f"  {C.GREY}Question {index} of {total} · {topic}{C.RESET}   {ui.bar(index - 1, total)}   {ui.tally(score, index - 1)}")
        print(f"  {C.BOLD}{C.WHITE}{item['question']}{C.RESET}")
        print()

        for number, option in enumerate(item["options"]):
            letter = LETTERS[number]
            print(f"   {C.CYAN}{C.BOLD}{letter}{C.RESET}{C.GREY}){C.RESET} {option}")

        pick = ask_answer(f"\n  {C.YELLOW}🎯 Your answer (A-D or 1-4): {C.RESET}")
        correct = item["answer"] + 1
        print()

        if pick == correct:
            score += 1
            print(f"  {C.GREEN}✅ Correct!{C.RESET}")
        else:
            print(f"  {C.RED}❌ Wrong.{C.RESET} The answer was {C.GREEN}{LETTERS[item['answer']]}{C.RESET} — {item['options'][item['answer']]}")

    return score, total


def show_result(score, total, user_name):
    percent = round(score / total * 100) if total else 0

    if percent == 100:
        title, medal = "🏆 FLAWLESS VICTORY", "You got every single one."
    elif percent >= 80:
        title, medal = "🌟 GREAT RUN", "Sharp as a tack."
    elif percent >= 50:
        title, medal = "👍 NOT BAD", "Solid — a bit more practice and you're there."
    else:
        title, medal = "📚 KEEP PRACTISING", "Rough round. Go again?"

    print()
    ui.panel(
        title,
        [
            "",
            f"🎯 {user_name}, you scored {C.BOLD}{C.GREEN}{score}/{total}{C.RESET}  {C.GREY}({percent}%){C.RESET}",
            f"{ui.bar(score, total, 28)}",
            "",
            f"{C.GREY}{medal}{C.RESET}",
            "",
        ],
        width=52,
    )


def play(client, user_name):
    print()
    ui.box("QUIZ GAME", width=52, color=C.MAGENTA)
    print(ui.centered(f"🌟 Welcome, {C.BOLD}{C.YELLOW}{user_name}{C.RESET}! 🌟"))
    ui.rule()
    print()

    while True:
        print(f"{C.BOLD}🎯 Choose your topic{C.RESET}")
        print(f"   {C.GREY}e.g. space · football · Python · Bollywood · world history{C.RESET}")
        topic = ask(f"   {C.CYAN}›{C.RESET} ").strip()
        if not topic:
            print(f"   {C.YELLOW}⚠️  Please type a topic.{C.RESET}\n")
            continue

        count = ask_number(
            f"\n{C.BOLD}🔢 How many questions?{C.RESET} {C.GREY}(1-{MAX_QUESTIONS}, Enter = 5){C.RESET} {C.CYAN}›{C.RESET} ",
            1,
            MAX_QUESTIONS,
            default=5,
        )

        print()
        # Game-flavored loading line while the questions are generated
        with ui.spinner(f"🎲 Shuffling your question deck — {topic}…"):
            questions = generate_quiz(client, topic, count)

        if not questions:
            print(f"{C.YELLOW}⚠️  No usable questions came back.{C.RESET} Let's try another topic.\n")
            continue

        if len(questions) < count:
            print(f"{C.GREY}ℹ️  Only {len(questions)} usable question(s) came back — playing those.{C.RESET}")

        word = "question" if len(questions) == 1 else "questions"
        print(f"{C.GREEN}🎯 Deck ready — {len(questions)} {word}.{C.RESET} Good luck!\n")

        score, total = run_quiz(questions, topic)
        show_result(score, total, user_name)

        again = ask(f"\n{C.BOLD}🔁 Play again?{C.RESET} {C.GREY}(y/n){C.RESET} ").strip().lower()
        if again not in {"y", "yes"}:
            print(f"\n{C.GREY}👋 Thanks for playing, {C.BOLD}{C.YELLOW}{user_name}{C.RESET}{C.GREY}!{C.RESET}\n")
            return
        print()


def main():
    client = get_client()

    # python ai_quiz.py --check  -> test the API and quit (for setup/debugging)
    if "--check" in sys.argv:
        sys.exit(0 if check_api(client) else 1)

    # Imported here on purpose: importing quiz_login_sys starts the login UI,
    # so we only do it AFTER the API key has been validated.
    import quiz_login_sys as login

    play(client, login.user_name)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n\n{C.GREY}👋 Goodbye!{C.RESET}")
