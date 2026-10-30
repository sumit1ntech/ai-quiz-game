# 🎓 Ultimate Quiz Game

A terminal quiz game with a login system and **AI-generated multiple-choice questions**. Sign up, pick any topic you like, and Gemini writes a fresh quiz for you — space, football, Python, Bollywood, world history, anything.

No question bank to maintain. Every round is new.

```
╭────────────────────────────────────────────────────╮
│                     QUIZ GAME                      │
╰────────────────────────────────────────────────────╯
                 🌟 Welcome, sumit! 🌟

🎯 Choose your topic
   e.g. space · football · Python · Bollywood · world history
   › space
🔢 How many questions? (1-10, Enter = 5) › 2
🎲 Shuffling your question deck — space…

  Question 1 of 2 · space   ░░░░░░░░░░░░░░░░░░░░   ✓ 0
  Which planet is known as the Red Planet?

   A) Venus
   B) Mars
   C) Jupiter
   D) Saturn

  🎯 Your answer (A-D or 1-4): b
  ✅ Correct!
```

---

## ✨ Features

| | |
|---|---|
| 🔐 **Accounts** | Sign up / log in, users saved to `user_data.json` between runs |
| 🎲 **AI questions** | Gemini generates MCQs on any topic you type |
| 🛡️ **Crash-proof** | Questions are schema-validated; malformed ones are thrown away, never shown |
| ⌨️ **Flexible input** | Answer with `A`–`D` or `1`–`4`, invalid input re-prompts |
| 📊 **Live scoring** | Progress bar, running score, accuracy bar and a graded result screen |
| 🎨 **Themed UI** | Colored, aligned boxes; colors auto-disable when output is piped |
| 🚪 **Polite exits** | `0` to quit, `Ctrl+C` / `Ctrl+D` exit cleanly — no tracebacks |

---

## 📁 Project structure

| File | What it does |
|---|---|
| `ai_quiz.py` | **Entry point.** Validates the API key, runs login, generates and plays the quiz |
| `quiz_login_sys.py` | Sign up / log in. Importing it starts the login UI and sets `user_name` |
| `ui.py` | Shared theme: colors, boxes, progress bar, spinner, emoji-aware width math |
| `user_data.json` | The "database" — `{ "username": "password" }` (local only, git-ignored) |
| `requirements.txt` | Python dependencies |
| `README.md` | Project overview (this file) |
| `GUIDE.md` | Beginner setup and play walkthrough |
| `.env` | Your secret API key (**never committed**) |
| `.env.example` | Template showing which variables to set |

---

## 🚀 Quick start

```bash
# 1. install dependencies (once)
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 2. add your API key
cp .env.example .env             # then edit .env and paste your key

# 3. verify the key works
python ai_quiz.py --check

# 4. play
python ai_quiz.py
```

Get a free key at <https://aistudio.google.com/apikey>.

New to Python or stuck on a step? Follow **[GUIDE.md](GUIDE.md)** — it walks through every step with screenshots of the expected output.

---

## 🕹️ How to play

1. **Sign up** (`1`) with a username and password — or **log in** (`2`) if you already have an account.
2. **Pick a topic.** Any text works: `space`, `Indian rivers`, `Python basics`, `1990s movies`.
3. **Choose a length** — 1 to 10 questions, press Enter for the default of 5.
4. **Answer** each question with `A`–`D` or `1`–`4`. You get instant feedback plus the correct answer.
5. **See your score** and choose whether to play again — a new topic means a whole new quiz.

Type `0` at the account menu to quit.

---

## ⚙️ Configuration

All settings live in `.env`:

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | *(required)* | Your Google AI Studio key |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Model used for question generation |

Terminal behavior (optional, set in your shell):

| Variable | Effect |
|---|---|
| `NO_COLOR=1` | Disable all colors |
| `FORCE_COLOR=1` | Force colors even when output is piped |

Other knobs live at the top of `ai_quiz.py`:

```python
DEFAULT_MODEL = "gemini-3.5-flash-lite"
OPTIONS_PER_QUESTION = 4
MAX_QUESTIONS = 10
```

---

## 🧠 How it works

```
ai_quiz.py
│
├─ get_client()          .env → GEMINI_API_KEY → genai.Client   (exits early if missing)
├─ check_api()           only with --check: one tiny request
├─ quiz_login_sys.py     login UI → returns user_name
└─ play()
   ├─ generate_quiz()    Gemini + Pydantic schema (JSON, not prose)
   ├─ clean_questions()  drop anything malformed / duplicated
   ├─ run_quiz()         ask each question, keep score
   └─ show_result()      graded summary panel
```

The important part is **how questions are requested**. Instead of asking Gemini for text and parsing it with regex, the game hands it a schema:

```python
class Question(BaseModel):
    question: str
    options: list[str]
    answer: int          # 0-based index of the correct option

class Quiz(BaseModel):
    questions: list[Question]
```

The SDK returns real Python objects in `response.parsed`, so there is nothing fragile to parse. `clean_questions()` then enforces the rules — exactly 4 options, answer index in range, no duplicate questions — so a weird generation can never crash the game or show a broken question.

---

## 🗂️ Data format

`user_data.json` is a simple username → password map. It is **git-ignored**, so accounts you create locally never get published:

```json
{
    "sumitbhaya": "1234",
    "debjeet": "4567"
}
```

Usernames are lowercased and trimmed before saving, which is why `SumitBhaya` logs in as `sumitbhaya`.

> ⚠️ **Passwords are stored in plain text.** Fine for a local learning project — do **not** reuse a real password. The file stays on your machine only. Scores are not saved yet; each session starts fresh.

---

## 🩺 Troubleshooting

| Message | Fix |
|---|---|
| `GEMINI_API_KEY not found` | Create `.env` with `GEMINI_API_KEY=...` (see `.env.example`) |
| `API TEST FAILED` + 401/403 | Key is wrong or revoked — make a new one |
| `API TEST FAILED` + 429 | Rate limit / quota — wait a minute |
| `API TEST FAILED` + 404 | Model unavailable — set `GEMINI_MODEL` to a valid model |
| `ModuleNotFoundError: google` | Activate the venv, then `pip install -r requirements.txt` |
| Boxes look misaligned | Terminal too narrow or emoji width mismatch — widen the window |
| Weird `[96m` characters | Terminal lacks ANSI support — use Windows Terminal, or `NO_COLOR=1` |

Full step-by-step help: **[GUIDE.md](GUIDE.md)**.

---

## 💡 Ideas to extend

- Save best scores per user and show a leaderboard on login
- Shuffle answer positions (currently Gemini decides the order)
- Add a countdown timer per question
- Hash passwords with `hashlib` + a per-user salt
- Difficulty levels (easy / medium / hard) passed into the prompt

---

Built as a learning project with Python, the Gemini API, and a terminal.
