/**
 * GET /api/health — quick check that the deployment and key are wired up.
 * Never returns the key itself.
 */
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

export async function onRequestGet({ env }) {
  return new Response(
    JSON.stringify({
      ok: true,
      keyConfigured: Boolean(env.GEMINI_API_KEY),
      model: env.GEMINI_MODEL || DEFAULT_MODEL,
    }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}
