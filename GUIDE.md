# 📖 Setup & Play Guide

A complete beginner walkthrough. Follow it top to bottom once, and you'll be playing in about five minutes. Every step shows what you should see, so you always know whether it worked.

Already set up? Jump to **[Everyday use](#-everyday-use)**.

---

## 0. What you need

- **Python 3.9 or newer** (this project was built and tested on 3.15)
- **A terminal** — Terminal on macOS, Windows Terminal / PowerShell on Windows
- **A free Gemini API key** from Google AI Studio
- An internet connection while playing (questions are generated live)

No other software, no database, no accounts to create anywhere else.

---

## 1. Check your Python

Open your terminal and run:

```bash
python3 --version
```

Expected:

```
Python 3.15.2
```

If you see `command not found`, install Python from <https://www.python.org/downloads/> (macOS: `brew install python`). On Windows use `python --version` instead of `python3`.

> **Note:** `python3` on macOS/Linux, `python` on Windows. Use whichever one answered with a version number for every command below.

---

## 2. Open a terminal inside the project folder

You must be inside the folder that contains `ai_quiz.py`.

```bash
cd ~/Projects/Quiz-Game
ls
```

You should see:

```
__pycache__  ai_quiz.py  quiz_login_sys.py  ui.py
user_data.json  requirements.txt  README.md  GUIDE.md
```

(`__pycache__` is just Python's cached bytecode — ignore it.)

`ls -a` additionally shows the hidden files this project relies on: `.env` (your key), `.env.example` (template) and `.gitignore`.

> Tip: on macOS you can type `cd ` (with a space), then drag the folder into the terminal window and press Enter.

---

## 3. Create a virtual environment

A "venv" is a private box of packages for this project, so it can't break anything else on your machine.

```bash
python3 -m venv .venv
```

This creates a hidden `.venv/` folder. Activate it:

```bash
# macOS / Linux
source .venv/bin/activate

# Windows (PowerShell)
.venv\Scripts\activate
```

Your prompt now starts with `(.venv)`:

```
(.venv) ➜  Quiz-Game
```

**You must activate this every time you open a new terminal before running the game.**

---

## 4. Install the dependencies

```bash
pip install -r requirements.txt
```

Expected ending:

```
Successfully installed google-genai-2.34.0 python-dotenv-1.2.4 ...
```

That installs two things: `google-genai` (talks to Gemini) and `python-dotenv` (reads your `.env` file).

---

## 5. Get your Gemini API key

1. Go to <https://aistudio.google.com/apikey>
2. Sign in with a Google account
3. Click **Create API key**
4. Copy the key — it looks like `AIza...` and is long

> 🔒 Treat it like a password. Anyone with the key can spend your quota. Never paste it into chat, a screenshot, or a commit.

---

## 6. Create your `.env` file

The project ships a template; copy it, then paste your key in.

```bash
cp .env.example .env
```

Now open `.env` in any text editor (VS Code: `code .env`, macOS TextEdit: `open -e .env`) and set your key:

```env
GEMINI_API_KEY=AIza...your-real-key-here...
GEMINI_MODEL=gemini-3.5-flash-lite
```

Save it. The `.env` file is already listed in `.gitignore`, so it will never be committed by accident.

---

## 7. Verify the setup

Before playing, test that the key actually works:

```bash
python ai_quiz.py --check
```

✅ **Success looks like:**

```
✅ API TEST SUCCESSFUL
   model: gemini-3.5-flash-lite
   reply: Gemini API is working!
```

❌ **If it fails**, the message tells you why:

| You see | Meaning | Fix |
|---|---|---|
| `GEMINI_API_KEY not found` | No `.env`, or wrong filename | Step 6 — the file must be named exactly `.env` |
| `401` / `403` | Key is wrong or revoked | Copy the key again from AI Studio |
| `429` | Free-tier rate limit | Wait a minute, then retry |
| `404` / `not found` | Model name unavailable | Change `GEMINI_MODEL` in `.env` |
| `ModuleNotFoundError` | venv not active | `source .venv/bin/activate`, then step 4 |

`--check` only tests the API — it does **not** start the game.

---

## 8. Run the game

```bash
python ai_quiz.py
```

---

## 9. First time: create an account

```
╭────────────────────────────────────────────────────╮
│                    ACCOUNT MENU                    │
╰────────────────────────────────────────────────────╯

   1  ✨ Sign Up
   2  🔓 Log In
   0  🚪 Quit
────────────────────────────────────────────────────
   👉 Choose an option ›
```

Type `1` and press Enter, then choose a username and password:

```
   👤 Username › sumit
   🔑 Password › 1234

   🎉 Account created, sumit!
   🔓 Please log in to continue.
```

You're logged in automatically after signing up. On later runs, pick `2` and log in.

**Rules:**
- Usernames are case-insensitive and trimmed — `Sumit` and `sumit` are the same account
- Usernames must be unique
- Empty username or password is rejected

> ⚠️ Passwords are stored as plain text in `user_data.json`. Use something fake — never a real password.

---

## 10. Play a round

**Pick a topic** — anything you like:

```
🎯 Choose your topic
   e.g. space · football · Python · Bollywood · world history
   › Python basics
```

**Choose the length** — `1` to `10`, or just press Enter for 5:

```
🔢 How many questions? (1-10, Enter = 5) ›
```

You'll see a spinner while Gemini writes the questions:

```
🎲 Shuffling your question deck — Python basics…
🎯 Deck ready — 5 questions. Good luck!
```

**Answer each question** with `A`–`D` or `1`–`4`:

```
  Question 1 of 5 · Python basics   ░░░░░░░░░░░░░░░░░░░░   ✓ 0
  Which keyword defines a function in Python?

   A) func
   B) def
   C) function
   D) lambda

  🎯 Your answer (A-D or 1-4): b
  ✅ Correct!
```

Wrong answers still teach you the right one:

```
  ❌ Wrong. The answer was C — Jupiter
```

**Read your result:**

```
╭────────────────────────────────────────────────────╮
│                    🌟 GREAT RUN                    │
├────────────────────────────────────────────────────┤
│            🎯 sumit, you scored 4/5  (80%)         │
│            ████████████████████████░░░░            │
│                      Sharp as a tack.              │
╰────────────────────────────────────────────────────╯
```

**Play again?** Type `y` for a new topic, or `n` to quit.

---

## 🔁 Everyday use

Once the setup is done, playing again is three lines:

```bash
cd ~/Projects/Quiz-Game
source .venv/bin/activate      # Windows: .venv\Scripts\activate
python ai_quiz.py
```

| I want to... | Do this |
|---|---|
| Play | `python ai_quiz.py` |
| Test my API key | `python ai_quiz.py --check` |
| Quit from the account menu | Type `0` |
| Quit mid-question | `Ctrl+C` |
| Leave a prompt cleanly | `Ctrl+D` |

---

## 🎛️ Customizing

Open `ai_quiz.py` and edit the constants near the top:

```python
DEFAULT_MODEL = "gemini-3.5-flash-lite"   # try gemini-3.8-flash for a newer model
OPTIONS_PER_QUESTION = 4                  # 4 options (A-D)
MAX_QUESTIONS = 10                        # upper limit in the "how many" prompt
```

Change the default of 5 questions here, inside `play()`:

```python
count = ask_number(..., default=5)
```

**Colors** live in `ui.py`. The palette is a few lines near the top:

```python
CYAN = "\033[96m"
YELLOW = "\033[93m"
GREEN = "\033[92m"
```

Swap the codes to restyle both the login screen and the quiz at once. If your terminal shows raw `[96m` text, run with `NO_COLOR=1 python ai_quiz.py`.

---

## 🗑️ Reset or remove

| Goal | Command |
|---|---|
| Delete all accounts | `rm user_data.json` — a fresh file is written the next time you sign up |
| Remove just your account | Edit `user_data.json` and delete that line |
| Uninstall packages | Delete the `.venv/` folder |
| Wipe everything | Delete the project folder |

---

## 🩺 When something looks wrong

**Boxes look jagged or the right border is broken**
Your terminal is too narrow, or it's rendering emoji as single-width. Widen the window (at least 60 columns) or use a modern terminal (Windows Terminal, iTerm2, Ghostty). The layout math accounts for double-width emoji, so this is almost always window width.

**`python` opens the wrong Python**
Use the venv's interpreter directly — it bypasses activation entirely:

```bash
.venv/bin/python ai_quiz.py          # macOS / Linux
.venv\Scripts\python.exe ai_quiz.py  # Windows
```

**It hangs on "Shuffling your question deck…"**
That's the live API call. A slow network can take a few seconds; over ~30 seconds usually means the connection is blocked. Try `--check` to confirm.

**A question looks broken or duplicated**
`clean_questions()` already drops malformed ones — if you still see a bad question, the model produced it; try a more specific topic.

---

## 📤 Publishing to GitHub (optional, read this first)

This project is already set up to be published safely: `.gitignore` keeps `.env`, `.venv/` and `user_data.json` out of git, and a GitHub Action fails the build if a `.env` ever slips in.

**1. Create an empty repo on GitHub** (no README, no .gitignore — you already have both), then connect it:

```bash
git remote add origin https://github.com/YOUR-USERNAME/Quiz-Game.git
git branch -M main
git push -u origin main
```

**2. Before every push, sanity-check what you're sending:**

```bash
git status
```

If `.env` or `user_data.json` ever appears as tracked, **stop**:

```bash
git rm --cached .env user_data.json
```

Then rotate your key in AI Studio — a key that reached a commit is compromised even if you delete it later.

**3. What gets published:**

| Committed ✅ | Ignored 🔒 |
|---|---|
| `ai_quiz.py`, `quiz_login_sys.py`, `ui.py` | `.env` (your key) |
| `README.md`, `GUIDE.md`, `requirements.txt` | `.venv/` |
| `.env.example`, `.gitignore`, `.gitattributes` | `user_data.json` (real accounts) |
| `.github/workflows/checks.yml` | `__pycache__/`, `.DS_Store` |

Happy quizzing! 🎓
