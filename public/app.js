/* ═══════════════════════════════════════════════════════════════
   Ultimate Quiz Game — browser client
   Talks to /api/quiz (Cloudflare Pages Function) for AI questions.
   ═══════════════════════════════════════════════════════════════ */

const LETTERS = "ABCD";
const OPTIONS_PER_QUESTION = 4;
const MAX_QUESTIONS = 10;
const DEFAULT_COUNT = 5;
const MAX_NAME_LENGTH = 24;
const ACCOUNTS_KEY = "quiz.accounts.v1";
const SESSION_KEY = "quiz.session.v1";
const SPINNER_FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

const $ = (selector) => document.querySelector(selector);

const screens = {
  auth: $("#screen-auth"),
  setup: $("#screen-setup"),
  loading: $("#screen-loading"),
  quiz: $("#screen-quiz"),
  result: $("#screen-result"),
};

const state = {
  user: null,
  topic: "",
  count: DEFAULT_COUNT,
  questions: [],
  index: 0,
  score: 0,
  answered: false,
  busy: false,
};

let authMode = "login";
let spinnerTimer = null;

/* ── Tiny storage helpers ───────────────────────────────────── */

const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode / storage full — the game still works for this visit */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

/* ── Password hashing (demo login, browser-local only) ──────── */

async function hashPassword(username, password) {
  const text = `${username}:${password}`;

  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  // Fallback for file:// previews, where crypto.subtle is unavailable.
  let hash = 5381;
  for (const char of text) {
    hash = ((hash << 5) + hash + char.codePointAt(0)) >>> 0;
  }
  return `djb2:${hash.toString(16)}`;
}

/* ── Screen + message helpers ───────────────────────────────── */

function show(name) {
  for (const [key, element] of Object.entries(screens)) {
    element.classList.toggle("hidden", key !== name);
  }
  $("#logout").classList.toggle("hidden", !state.user || name === "auth");
}

function setMessage(element, message) {
  element.textContent = message || "";
  element.classList.toggle("hidden", !message);
}

function bar(done, total, width = 20) {
  const filled = total ? Math.max(0, Math.min(width, Math.round((width * done) / total))) : 0;
  return "█".repeat(filled) + "░".repeat(width - filled);
}

/* ── Auth ───────────────────────────────────────────────────── */

function enterGame(username) {
  state.user = String(username).slice(0, MAX_NAME_LENGTH);
  storage.set(SESSION_KEY, { username: state.user });
  $("#welcome-name").textContent = state.user;
  $("#password").value = "";
  show("setup");
  $("#topic").focus();
}

function wireAuth() {
  const form = $("#auth-form");
  const username = $("#username");
  const password = $("#password");
  const error = $("#auth-error");

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      authMode = tab.dataset.mode;
      document.querySelectorAll(".tab").forEach((other) => {
        const active = other === tab;
        other.classList.toggle("active", active);
        other.setAttribute("aria-selected", String(active));
      });
      $("#auth-submit").textContent = authMode === "signup" ? "✨ Create account" : "🔓 Log In";
      password.autocomplete = authMode === "signup" ? "new-password" : "current-password";
      setMessage(error, "");
      username.focus();
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = username.value.trim().toLowerCase();
    const secret = password.value;

    if (name.length < 2 || name.length > MAX_NAME_LENGTH) {
      setMessage(error, `Please use a username between 2 and ${MAX_NAME_LENGTH} characters.`);
      username.focus();
      return;
    }
    if (secret.length < 4) {
      setMessage(error, "Please use a password with at least 4 characters.");
      password.focus();
      return;
    }

    const accounts = storage.get(ACCOUNTS_KEY, {});
    const fingerprint = await hashPassword(name, secret);

    if (authMode === "signup") {
      if (accounts[name]) {
        setMessage(error, "That username already exists. Try another, or log in.");
        return;
      }
      accounts[name] = { hash: fingerprint, createdAt: Date.now() };
      storage.set(ACCOUNTS_KEY, accounts);
      setMessage(error, "");
      enterGame(name);
      return;
    }

    const account = accounts[name];
    if (!account || account.hash !== fingerprint) {
      setMessage(error, "Invalid username or password. Try again.");
      password.select();
      return;
    }

    setMessage(error, "");
    enterGame(name);
  });

  $("#logout").addEventListener("click", () => {
    state.user = null;
    state.questions = [];
    storage.remove(SESSION_KEY);
    setMessage(error, "");
    password.value = "";
    show("auth");
    username.focus();
  });
}

/* ── Generating + playing ───────────────────────────────────── */

function startSpinner(topic) {
  $("#loading-text").textContent = `🎲 Shuffling your question deck — ${topic}…`;
  $("#spinner").textContent = SPINNER_FRAMES[0];

  let frame = 0;
  clearInterval(spinnerTimer);
  spinnerTimer = setInterval(() => {
    frame = (frame + 1) % SPINNER_FRAMES.length;
    $("#spinner").textContent = SPINNER_FRAMES[frame];
  }, 80);
}

function stopSpinner() {
  clearInterval(spinnerTimer);
  spinnerTimer = null;
}

/** Reject anything the server should never send, so rendering cannot crash. */
function isUsableQuestion(item) {
  return Boolean(
    item &&
      typeof item.question === "string" &&
      item.question.trim() &&
      Array.isArray(item.options) &&
      item.options.length === OPTIONS_PER_QUESTION &&
      item.options.every((option) => typeof option === "string" && option.trim()) &&
      Number.isInteger(item.answer) &&
      item.answer >= 0 &&
      item.answer < OPTIONS_PER_QUESTION,
  );
}

async function fetchQuestions(topic, count) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch("/api/quiz", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ topic, count }),
      signal: controller.signal,
    });

    let data = {};
    try {
      data = await response.json();
    } catch {
      /* non-JSON error page */
    }

    if (!response.ok) {
      throw new Error(data.error || `The server answered with ${response.status}. Please try again.`);
    }

    const questions = Array.isArray(data.questions) ? data.questions.filter(isUsableQuestion) : [];
    if (questions.length === 0) {
      throw new Error("No usable questions came back. Try another topic.");
    }
    return questions;
  } finally {
    clearTimeout(timeout);
  }
}

async function startQuiz(topic, count) {
  if (state.busy) return;
  state.busy = true;

  state.topic = topic;
  state.count = count;

  setMessage($("#setup-error"), "");
  show("loading");
  startSpinner(topic);

  try {
    const questions = await fetchQuestions(topic, count);
    state.questions = questions;
    state.index = 0;
    state.score = 0;
    state.answered = false;

    stopSpinner();
    show("quiz");
    renderQuestion();
  } catch (error) {
    stopSpinner();
    show("setup");
    $("#topic").value = topic;
    $("#count").value = count;

    const message =
      error.name === "AbortError"
        ? "Gemini took too long to answer. Please try again."
        : error.message || "Something went wrong. Please try again.";
    setMessage($("#setup-error"), message);
  } finally {
    state.busy = false;
  }
}

function renderQuestion() {
  const total = state.questions.length;
  const question = state.questions[state.index];

  $("#quiz-progress-text").textContent = `Question ${state.index + 1} of ${total} · ${state.topic}`;
  $("#progress").textContent = bar(state.index, total);
  $("#tally").textContent = `✓ ${state.score}`;
  $("#question-text").textContent = question.question;

  const feedback = $("#feedback");
  feedback.textContent = "";
  feedback.className = "feedback";

  const next = $("#next");
  next.classList.add("hidden");
  next.textContent = state.index === total - 1 ? "See results →" : "Next →";

  const container = $("#options");
  container.replaceChildren();

  question.options.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option";
    button.dataset.index = String(index);

    const letter = document.createElement("span");
    letter.className = "letter";
    letter.textContent = LETTERS[index];

    const text = document.createElement("span");
    text.className = "text";
    text.textContent = option;

    button.append(letter, text);
    button.addEventListener("click", () => answer(index));
    container.append(button);
  });

  // Move screen-reader focus to the new question without scrolling the page.
  $("#question-text").focus({ preventScroll: true });
}

function answer(pick) {
  if (state.answered) return;

  const question = state.questions[state.index];
  if (!question || pick < 0 || pick >= question.options.length) return;

  const correct = question.answer;
  state.answered = true;

  if (pick === correct) {
    state.score += 1;
  }

  document.querySelectorAll(".option").forEach((button, index) => {
    button.disabled = true;
    if (index === correct) {
      button.classList.add("correct");
    } else if (index === pick) {
      button.classList.add("wrong");
    } else {
      button.classList.add("dim");
    }
  });

  const feedback = $("#feedback");
  if (pick === correct) {
    feedback.textContent = "✅ Correct!";
    feedback.className = "feedback good";
  } else {
    feedback.className = "feedback bad";
    feedback.replaceChildren(document.createTextNode("❌ Wrong. The answer was "));
    const letter = document.createElement("b");
    letter.textContent = LETTERS[correct];
    feedback.append(letter, document.createTextNode(` — ${question.options[correct]}`));
  }

  $("#tally").textContent = `✓ ${state.score}`;
  $("#next").classList.remove("hidden");
  $("#next").focus();
}

function nextQuestion() {
  if (!state.answered) return;

  state.index += 1;
  state.answered = false;

  if (state.index >= state.questions.length) {
    showResult();
  } else {
    renderQuestion();
  }
}

function showResult() {
  const total = state.questions.length;
  const score = state.score;
  const percent = total ? Math.round((score / total) * 100) : 0;

  let title;
  let message;
  if (percent === 100) {
    title = "🏆 FLAWLESS VICTORY";
    message = "You got every single one.";
  } else if (percent >= 80) {
    title = "🌟 GREAT RUN";
    message = "Sharp as a tack.";
  } else if (percent >= 50) {
    title = "👍 NOT BAD";
    message = "Solid — a bit more practice and you're there.";
  } else {
    title = "📚 KEEP PRACTISING";
    message = "Rough round. Go again?";
  }

  $("#result-title").textContent = title;

  const scoreLine = $("#result-score");
  scoreLine.replaceChildren();
  const name = document.createElement("strong");
  name.textContent = state.user ?? "player";
  const points = document.createElement("b");
  points.textContent = `${score}/${total}`;
  const percentage = document.createElement("span");
  percentage.textContent = ` (${percent}%)`;
  scoreLine.append(name, document.createTextNode(", you scored "), points, percentage);

  $("#result-bar").textContent = bar(score, total, 28);
  $("#result-message").textContent = message;

  show("result");
  $("#play-again").focus();
}

function wireGame() {
  $("#setup-form").addEventListener("submit", (event) => {
    event.preventDefault();

    const topic = $("#topic").value.trim();
    if (!topic) {
      setMessage($("#setup-error"), "Please type a topic.");
      $("#topic").focus();
      return;
    }

    let count = Number.parseInt($("#count").value, 10);
    if (!Number.isFinite(count)) count = DEFAULT_COUNT;
    count = Math.min(MAX_QUESTIONS, Math.max(1, count));

    startQuiz(topic.slice(0, 120), count);
  });

  $("#next").addEventListener("click", nextQuestion);

  $("#play-again").addEventListener("click", () => {
    startQuiz(state.topic, state.count);
  });

  $("#change-topic").addEventListener("click", () => {
    $("#topic").value = state.topic;
    $("#count").value = state.count;
    show("setup");
    $("#topic").focus();
    $("#topic").select();
  });

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (screens.quiz.classList.contains("hidden")) return;
    if (event.target instanceof HTMLInputElement) return;
    if (event.target instanceof HTMLTextAreaElement) return;

    if (event.key === "Enter") {
      if (event.target instanceof HTMLButtonElement) return; // native click handles it
      if (state.answered) {
        event.preventDefault();
        nextQuestion();
      }
      return;
    }

    if (state.answered) return;

    const key = event.key.toUpperCase();
    let pick = LETTERS.indexOf(key);

    if (pick === -1 && /^[1-4]$/.test(event.key)) {
      pick = Number.parseInt(event.key, 10) - 1;
    }
    if (pick >= 0 && pick < LETTERS.length) {
      event.preventDefault();
      answer(pick);
    }
  });
}

/* ── Boot ───────────────────────────────────────────────────── */

function init() {
  wireAuth();
  wireGame();

  const session = storage.get(SESSION_KEY, null);
  const accounts = storage.get(ACCOUNTS_KEY, {});

  if (session?.username && accounts[session.username]) {
    enterGame(session.username);
  } else {
    storage.remove(SESSION_KEY);
    show("auth");
    $("#username").focus();
  }
}

init();
