/**
 * POST /api/quiz
 * Body: { topic: string, count: number }
 * Returns: { questions: [{ question, options, answer }], model }
 *
 * Runs as a Cloudflare Pages Function. GEMINI_API_KEY is read from the
 * environment (set it in the Cloudflare dashboard) and never reaches the browser.
 */

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const MAX_QUESTIONS = 10;
const OPTIONS_PER_QUESTION = 4;
const MAX_TOPIC_LENGTH = 120;
const MAX_QUESTION_CHARS = 320;
const MAX_OPTION_CHARS = 160;
const MAX_BODY_BYTES = 4_096;
const UPSTREAM_TIMEOUT_MS = 25_000;

// Optional abuse protection — see isRateLimited().
const RATE_LIMIT_WINDOW_SECONDS = 600;
const RATE_LIMIT_MAX_REQUESTS = 30;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          question: { type: "STRING" },
          options: {
            type: "ARRAY",
            items: { type: "STRING" },
          },
          answer: { type: "INTEGER" },
        },
        required: ["question", "options", "answer"],
      },
    },
  },
  required: ["questions"],
};

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });

function friendlyError(status, message) {
  const detail = String(message ?? "").toLowerCase();

  // Google returns 400 (not 401) for a bad key, so inspect the detail too.
  if (status === 401 || status === 403 || detail.includes("api key")) {
    return "The Gemini API key looks invalid. Update GEMINI_API_KEY in Cloudflare and redeploy.";
  }
  if (status === 429) {
    return "Gemini's rate limit was hit. Wait a minute and try again.";
  }
  if (status === 404) {
    return "That Gemini model isn't available. Set GEMINI_MODEL to a supported model.";
  }
  if (status === 400) {
    return "Gemini rejected that topic or question count. Try a different topic.";
  }
  return `Gemini is having trouble right now (${status}). Please try again in a moment.`;
}

/**
 * Optional, KV-backed rate limit.
 * Enabled only when a KV namespace is bound as RATE_LIMIT in Cloudflare.
 * Fails open: a storage hiccup must never take the game offline.
 */
async function isRateLimited(env, request) {
  const store = env.RATE_LIMIT;
  if (!store) return false;

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const bucket = Math.floor(Date.now() / (RATE_LIMIT_WINDOW_SECONDS * 1000));
  const key = `rl:${bucket}:${ip}`;

  try {
    const used = Number.parseInt(await store.get(key), 10) || 0;
    if (used >= RATE_LIMIT_MAX_REQUESTS) return true;
    await store.put(key, String(used + 1), {
      expirationTtl: RATE_LIMIT_WINDOW_SECONDS + 60,
    });
    return false;
  } catch {
    return false;
  }
}

/** Pull a JSON object out of the model's reply, even if it added code fences. */
function parseModelJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    /* fall through */
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  return null;
}

/** Collapse whitespace and keep generated text inside the size the UI can show. */
function clampText(value, max) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Drop anything malformed so the game can never break mid-quiz. */
function cleanQuestions(items, limit = MAX_QUESTIONS) {
  if (!Array.isArray(items)) return [];

  const good = [];
  const seen = new Set();

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if (good.length >= limit) break;

    const text = clampText(item.question, MAX_QUESTION_CHARS);
    const options = Array.isArray(item.options)
      ? item.options.map((option) => clampText(option, MAX_OPTION_CHARS)).filter(Boolean)
      : [];

    const answer =
      typeof item.answer === "number" || typeof item.answer === "string"
        ? Number(item.answer)
        : Number.NaN;

    if (!text || options.length !== OPTIONS_PER_QUESTION) continue;
    if (!Number.isInteger(answer) || answer < 0 || answer >= OPTIONS_PER_QUESTION) continue;

    // Four identical options make "the" correct answer meaningless.
    const distinct = new Set(options.map((option) => option.toLowerCase()));
    if (distinct.size !== OPTIONS_PER_QUESTION) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    good.push({ question: text, options, answer });
  }

  return good;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let raw;
  try {
    raw = await request.text();
  } catch {
    return json({ error: "Could not read the request body." }, 400);
  }

  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: "That request is too large." }, 413);
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid request. Expected a JSON body." }, 400);
  }

  if (typeof body?.topic !== "string") {
    return json({ error: "Please enter a topic." }, 400);
  }

  const topic = body.topic
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TOPIC_LENGTH);

  if (!topic) {
    return json({ error: "Please enter a topic." }, 400);
  }

  let count = Number.parseInt(String(body?.count ?? ""), 10);
  if (!Number.isInteger(count)) count = 5;
  count = Math.min(MAX_QUESTIONS, Math.max(1, count));

  if (await isRateLimited(env, request)) {
    return json(
      { error: "Too many quizzes from this connection. Take a short break and try again." },
      429,
      { "retry-after": String(RATE_LIMIT_WINDOW_SECONDS) },
    );
  }

  if (!env.GEMINI_API_KEY) {
    return json(
      {
        error:
          "The server is missing GEMINI_API_KEY. Add it in Cloudflare → your Pages project → Settings → Variables and Secrets, then redeploy.",
      },
      500,
    );
  }

  const model = env.GEMINI_MODEL || DEFAULT_MODEL;

  const prompt = [
    `Create ${count} multiple-choice quiz questions about: ${topic}`,
    "Rules:",
    `- Each question has exactly ${OPTIONS_PER_QUESTION} options.`,
    "- Exactly one option is correct.",
    "- 'answer' is the 0-based index of the correct option (0 to 3).",
    "- No duplicate questions. No explanations. No numbering inside the text.",
    "- Keep every question and option under 90 characters.",
  ].join("\n");

  let upstream;
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.9,
            maxOutputTokens: 4096,
          },
        }),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      },
    );
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    console.error("Gemini request failed:", error?.name, error?.message);
    return json(
      {
        error: timedOut
          ? "Gemini took too long to answer. Please try again."
          : "Could not reach Gemini. Please try again in a moment.",
      },
      timedOut ? 504 : 502,
    );
  }

  let data = null;
  try {
    data = await upstream.json();
  } catch {
    /* handled below */
  }

  if (!upstream.ok) {
    // Logged for debugging; never echo upstream internals back to the browser.
    console.error("Gemini error:", upstream.status, data?.error?.message);
    return json(
      { error: friendlyError(upstream.status, data?.error?.message) },
      upstream.status === 429 ? 429 : 502,
    );
  }

  if (data?.promptFeedback?.blockReason) {
    return json(
      { error: "Gemini blocked that topic. Try rephrasing it as a different subject." },
      422,
    );
  }

  const candidate = data?.candidates?.[0];
  if (!candidate) {
    console.error("Gemini returned no candidate:", JSON.stringify(data).slice(0, 300));
    return json({ error: "Gemini returned no answer. Please try again." }, 502);
  }

  if (candidate.finishReason === "SAFETY" || candidate.finishReason === "PROHIBITED_CONTENT") {
    return json(
      { error: "Gemini blocked that topic. Try rephrasing it as a different subject." },
      422,
    );
  }

  const text = (candidate.content?.parts ?? [])
    .map((part) => part?.text ?? "")
    .join("")
    .trim();

  const parsed = parseModelJson(text);
  const questions = cleanQuestions(parsed?.questions, count);

  if (questions.length === 0) {
    console.error("Unusable model output:", text.slice(0, 300));
    return json(
      { error: "Gemini replied with something I couldn't read. Try again or tweak the topic." },
      502,
    );
  }

  return json({ questions, model });
}
