# 🚀 Deploy the web version on Cloudflare

This guide takes the browser version of the quiz game live on **Cloudflare Pages** — free, with HTTPS and a `*.pages.dev` address. No server to manage.

**What you need**

- A [GitHub](https://github.com) account (your repo is already there: `sumit1ntech/ai-quiz-game`)
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free)
- Your Gemini API key from <https://aistudio.google.com/apikey>

> The Python terminal game is untouched and still runs locally with `python ai_quiz.py`. This guide only publishes the web version in `public/`.

---

## What gets deployed

| Path | Role |
|---|---|
| `public/index.html` | The page |
| `public/style.css` | Styling |
| `public/app.js` | Game logic (accounts, quiz flow) |
| `public/_routes.json` | Sends only `/api/*` through the serverless function |
| `public/_headers` | Security headers (CSP, frame denial, HSTS) for static files |
| `functions/api/quiz.js` | Calls Gemini with your secret key |
| `functions/api/health.js` | `/api/health` — verifies the key is wired up |
| `tests/quiz.test.mjs` | Unit tests for the Function (no Gemini key needed) |
| `wrangler.toml` | Cloudflare project config |

Cloudflare serves everything in `public/` as static files, and runs `functions/` as Pages Functions. Your `GEMINI_API_KEY` lives only in Cloudflare's environment — the browser never sees it.

---

## Step 1 — Push the code to GitHub

From the project folder:

```bash
cd ~/Projects/Quiz-Game
git add .
git commit -m "Add Cloudflare web version"
git push origin main
```

Check the files arrived: open <https://github.com/sumit1ntech/ai-quiz-game> and confirm the `public/` and `functions/` folders are visible.

> `.env` and `user_data.json` are git-ignored — your local secrets stay local.

---

## Step 2 — Create the Pages project

1. Go to <https://dash.cloudflare.com> and sign in.
2. In the left sidebar choose **Workers & Pages**.
3. Click **Create** → **Pages** tab → **Connect to Git**.
4. Authorize GitHub if asked, then pick **`sumit1ntech/ai-quiz-game`** → **Begin setup**.

---

## Step 3 — Build settings

Use these exact values:

| Setting | Value |
|---|---|
| Project name | `ai-quiz-game` (or anything you like) |
| Production branch | `main` |
| Framework preset | `None` |
| Build command | *(leave empty)* |
| Build output directory | `public` |

There is nothing to compile — Cloudflare just uploads the static files and bundles the functions.

---

## Step 4 — Add your Gemini key (the important step)

1. Click **Save and Deploy** (the first deploy may fail or show a key error — that's fine).
2. Open the project → **Settings** → **Variables and Secrets**.
3. Click **Add** and create:

| Name | Value | Type |
|---|---|---|
| `GEMINI_API_KEY` | your key from AI Studio | **Secret** |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` *(optional)* | Plaintext |

4. Apply the variables to **Production** (and **Preview** if you want preview URLs to work).
5. Go to **Deployments** → open the latest → **Retry deployment** (or push any commit) so the new variables take effect.

> Secrets added after a deployment are only picked up by the next deployment. Retrying is enough.

---

## Step 5 — Visit your site

Open the URL Cloudflare shows, e.g.:

```
https://ai-quiz-game.pages.dev
```

Then check the API wiring:

```
https://ai-quiz-game.pages.dev/api/health
```

Expected:

```json
{ "ok": true, "keyConfigured": true, "model": "gemini-3.5-flash-lite" }
```

If `keyConfigured` is `false`, the secret is missing or the deployment predates it — fix Step 4 and redeploy.

Now sign up, type a topic, and play. 🎉

---

## Step 6 — Custom domain (optional)

1. Project → **Custom domains** → **Set up a custom domain**.
2. Enter a domain you own (it must be on Cloudflare — add it under **Websites** first).
3. Cloudflare creates the DNS record and certificate automatically.

---

## Step 7 — Protect your Gemini quota (recommended before sharing the link)

The `/api/quiz` endpoint is public: anyone with the URL can spend your Gemini quota. The Function ships with an optional per-IP limit of **30 quizzes per 10 minutes**, but it only turns on when a KV namespace is bound.

1. Create the namespace:

   ```bash
   npx wrangler kv namespace create RATE_LIMIT
   ```

2. In the dashboard open **your Pages project → Settings → Functions → KV namespace bindings**.
3. Add a binding: variable name `RATE_LIMIT`, namespace = the one you just created.
4. Redeploy.

That is enough for a small public launch. If it grows, put [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) in front of the “Generate quiz” button and add a WAF rate-limiting rule on `/api/quiz`.

> Without the KV binding nothing breaks — the limiter fails open and the game plays normally.

---

## Updating the site

Every push to `main` triggers a new deployment automatically:

```bash
git add .
git commit -m "Tweak the quiz"
git push
```

Preview deployments are created for pull requests too.

---

## Alternative: deploy from the terminal (Wrangler)

Only if you prefer the CLI. Requires [Node.js](https://nodejs.org) 20+. Everything below needs **no `npm install`** — `npx` fetches Wrangler on demand.

```bash
# one-time login
npx wrangler login

# create the Pages project once
npx wrangler pages project create ai-quiz-game

# deploy the site + functions
npx wrangler pages deploy public --project-name ai-quiz-game

# store the API key as a secret (never commit it)
npx wrangler pages secret put GEMINI_API_KEY --project-name ai-quiz-game
```

Local preview with live functions:

```bash
cp .dev.vars.example .dev.vars   # paste your real key into .dev.vars
npx wrangler pages dev public
# open the printed http://localhost:8788
```

Run the Function's unit tests (Gemini is stubbed; no key or network needed):

```bash
npm test
```

`.dev.vars` is git-ignored, so the key you put there never reaches GitHub.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `The server is missing GEMINI_API_KEY` | Add the secret in **Settings → Variables and Secrets**, then redeploy |
| `The Gemini API key looks invalid` | Key revoked/typo — make a new one at AI Studio |
| `Gemini's rate limit was hit` | Free-tier quota — wait a minute and retry |
| `That Gemini model isn't available` | Set `GEMINI_MODEL` to a model your key can use |
| `/api/quiz` returns 404 | `functions/` must stay at the repo root and the output directory must be `public` |
| Site loads but styles/scripts 404 | Build output directory is wrong — set it to `public` |
| Accounts disappeared | The demo login stores accounts in the browser's `localStorage`; clearing site data removes them |
| Works locally, fails on Cloudflare | Preview and Production have separate variables — set them for both |

---

## Security notes

- **API key:** stored as a Cloudflare secret, used only inside `functions/api/quiz.js`. Never put a key in `public/`.
- **Login:** accounts are hashed and stored in the visitor's browser. It is a friendly demo login, not real authentication. For real accounts, use Cloudflare D1 or KV plus a proper auth provider.
- **Abuse:** a public endpoint can be called by anyone who finds it. For a bigger launch, add [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) and [rate limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/).
- **Cost:** Gemini has a free tier; Cloudflare Pages' free plan covers static hosting and 100k Function requests/day.
