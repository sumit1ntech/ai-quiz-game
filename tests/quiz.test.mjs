/**
 * Tests for the /api/quiz Pages Function.
 * Run with: npm test  (or: node --test tests/)
 *
 * Gemini itself is never called — globalThis.fetch is replaced with a stub.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { onRequestPost } from "../functions/api/quiz.js";

const ENV = { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" };

/** Build the JSON envelope the Gemini REST API returns. */
function geminiResponse(questions, { finishReason = "STOP" } = {}) {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: { parts: [{ text: JSON.stringify({ questions }) }] },
          finishReason,
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

/** Swap global fetch for the duration of one test. Returns the recorded calls. */
function stubFetch(t, handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

function post(body, env = ENV, init = {}) {
  return onRequestPost({
    request: new Request("https://quiz.test/api/quiz", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
      ...init,
    }),
    env,
  });
}

const sample = [
  { question: "Which planet is the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Saturn"], answer: 1 },
  { question: "What is 2 + 2?", options: ["3", "4", "5", "6"], answer: 1 },
  { question: "Capital of Japan?", options: ["Seoul", "Tokyo", "Kyoto", "Osaka"], answer: 1 },
];

test("returns cleaned questions and asks Gemini for the requested count", async (t) => {
  const calls = stubFetch(t, () => geminiResponse(sample));

  const response = await post({ topic: "space", count: 2 });
  assert.equal(response.status, 200);

  const data = await response.json();
  assert.equal(data.questions.length, 2);
  assert.equal(data.model, "test-model");
  assert.equal(data.questions[0].question, "Which planet is the Red Planet?");

  const contents = JSON.parse(calls[0].init.body);
  assert.match(contents.contents[0].parts[0].text, /Create 2 multiple-choice/);
  assert.equal(calls[0].url, "https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent");
  assert.equal(calls[0].init.headers["x-goog-api-key"], "test-key");
});

test("drops duplicate, out-of-range and ambiguous questions", async (t) => {
  stubFetch(t, () =>
    geminiResponse([
      ...sample,
      { question: "  which planet is the red planet?  ", options: ["A", "B", "C", "D"], answer: 0 },
      { question: "Bad index", options: ["A", "B", "C", "D"], answer: 9 },
      { question: "Too few", options: ["A", "B"], answer: 0 },
      { question: "Same options", options: ["A", "A", "A", "A"], answer: 0 },
      { question: "Not an object" },
    ]),
  );

  const response = await post({ topic: "space", count: 10 });
  const data = await response.json();
  assert.equal(data.questions.length, sample.length);
});

test("clamps the question count into 1..10 and defaults to 5", async (t) => {
  const calls = stubFetch(t, () => geminiResponse(sample));

  await post({ topic: "space", count: 999 });
  await post({ topic: "space", count: "nope" });
  await post({ topic: "space" });

  const prompts = calls.map(
    (call) => JSON.parse(call.init.body).contents[0].parts[0].text,
  );
  assert.match(prompts[0], /Create 10 multiple-choice/);
  assert.match(prompts[1], /Create 5 multiple-choice/);
  assert.match(prompts[2], /Create 5 multiple-choice/);
});

test("rejects missing or non-string topics", async (t) => {
  stubFetch(t, () => {
    throw new Error("Gemini should not be called");
  });

  assert.equal((await post({ topic: "   " })).status, 400);
  assert.equal((await post({ topic: 42 })).status, 400);
  assert.equal((await post({})).status, 400);
});

test("rejects malformed and oversized bodies", async (t) => {
  stubFetch(t, () => {
    throw new Error("Gemini should not be called");
  });

  assert.equal((await post("{not json")).status, 400);
  assert.equal((await post({ topic: "x".repeat(5000) })).status, 413);
});

test("reports a missing API key without calling Gemini", async (t) => {
  const calls = stubFetch(t, () => {
    throw new Error("Gemini should not be called");
  });

  const response = await post({ topic: "space" }, {});
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /GEMINI_API_KEY/);
  assert.equal(calls.length, 0);
});

test("maps upstream errors without leaking their details", async (t) => {
  stubFetch(
    t,
    () =>
      new Response(JSON.stringify({ error: { message: "internal quota detail xyz" } }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
  );

  const response = await post({ topic: "space" });
  assert.equal(response.status, 429);
  const { error } = await response.json();
  assert.match(error, /rate limit/i);
  assert.doesNotMatch(error, /xyz/);
});

test("explains an invalid key even though Google reports it as 400", async (t) => {
  stubFetch(
    t,
    () =>
      new Response(
        JSON.stringify({ error: { message: "API key not valid. Please pass a valid API key." } }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
  );

  const response = await post({ topic: "space" });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /API key looks invalid/);
});

test("returns 504 when Gemini times out", async (t) => {
  stubFetch(t, () => {
    const error = new Error("The operation was aborted");
    error.name = "TimeoutError";
    throw error;
  });

  const response = await post({ topic: "space" });
  assert.equal(response.status, 504);
  assert.match((await response.json()).error, /too long/i);
});

test("honours the optional KV rate limit", async (t) => {
  const calls = stubFetch(t, () => {
    throw new Error("Gemini should not be called");
  });

  const store = {
    get: async () => "30",
    put: async () => undefined,
  };

  const response = await post({ topic: "space" }, { ...ENV, RATE_LIMIT: store });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "600");
  assert.equal(calls.length, 0);
});

test("fails open when the KV rate limiter errors", async (t) => {
  stubFetch(t, () => geminiResponse(sample));

  const store = {
    get: async () => {
      throw new Error("KV down");
    },
    put: async () => undefined,
  };

  const response = await post({ topic: "space" }, { ...ENV, RATE_LIMIT: store });
  assert.equal(response.status, 200);
});

test("reports blocked topics as 422", async (t) => {
  stubFetch(t, () =>
    new Response(
      JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );

  const response = await post({ topic: "something blocked" });
  assert.equal(response.status, 422);
});

test("tolerates code fences and prose around the JSON", async (t) => {
  stubFetch(t, () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: `Here you go:\n\`\`\`json\n${JSON.stringify({ questions: sample })}\n\`\`\``,
                },
              ],
            },
            finishReason: "STOP",
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );

  const response = await post({ topic: "space", count: 3 });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).questions.length, 3);
});
