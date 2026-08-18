const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { pool } = require("../db");

const router = express.Router();

// Immigration/visa policy news carries real consequences for students (same
// reasoning as NFR8 for the admissions assistant, backend/src/routes/ai.js),
// so this is deliberately more conservative than the City Life assistant:
// web search (when enabled) is restricted to official .gov sources only, the
// model is instructed to describe facts rather than render a personal
// "this helps/harms you" verdict, and every response carries a disclaimer
// pointing to ISS / an immigration attorney for anything actionable.
//
// Cost control here is a shared cache rather than a per-user rate limit
// (see city.js) -- this content is the same for every reader, so caching it
// for CACHE_TTL_MS bounds the whole deployment to at most ~2 LLM calls/day
// regardless of how many students visit the page.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
let cache = null; // { payload, generatedAt }

const DISCLAIMER =
  "This is a general informational summary, not legal or immigration advice. Policy details and effective dates can change quickly -- for anything specific to your visa status or situation, contact International Student Services or a qualified immigration attorney before acting on it.";

const OFFICIAL_DOMAINS = ["uscis.gov", "travel.state.gov", "ice.gov", "studyinthestates.dhs.gov", "ed.gov"];

const STATIC_FALLBACK_ITEMS = [
  {
    title: "Stay current on F-1/J-1 status requirements",
    text: "A live summary of recent official immigration and student-visa news appears here once this deployment has an AI provider key configured. Until then, check these official sources directly for anything time-sensitive: USCIS (uscis.gov), the State Department's student visa page (travel.state.gov), and SEVP's Study in the States (studyinthestates.dhs.gov). International Student Services is always the fastest way to find out how a policy change actually applies to you personally.",
  },
];

async function logAudit(userId, mode) {
  try {
    await pool.query(`INSERT INTO audit_log (actor_user_id, action, entity, detail) VALUES ($1,$2,$3,$4)`, [
      userId, "news_view", "news", { mode },
    ]);
  } catch (e) {
    console.error("audit log failed", e.message);
  }
}

router.get("/", requireAuth, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    await logAudit(req.user.id, "fallback_static");
    return res.json({ items: STATIC_FALLBACK_ITEMS, sources: [], mode: "fallback_static", disclaimer: DISCLAIMER });
  }

  if (cache && Date.now() - cache.generatedAt < CACHE_TTL_MS) {
    await logAudit(req.user.id, "cache");
    return res.json({ ...cache.payload, mode: "cache" });
  }

  try {
    const prompt = `Search official U.S. government sources only (USCIS, the State Department, ICE/SEVP, Study in the States, Department of Education) for genuinely recent (last 60 days) official news, rule changes, or policy announcements that affect F-1 or J-1 international students in the United States.

Return 3 to 5 items. For each item give:
- A short factual headline
- The official source and date
- A neutral one-paragraph explanation of what actually changed
- A brief, cautious note on who it may be relevant to (e.g. "may matter if you are on OPT" or "relevant to new F-1 applicants") -- never a personalized verdict like "this helps you" or "this harms you", and never speculate beyond what the source states.

If you find nothing genuinely new from the last 60 days, say so plainly instead of stretching older news to fit.
Do not give legal advice or tell the reader what to do -- describe what changed and point them to International Student Services or an immigration attorney for anything that requires a decision.`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 900,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search_20250305", name: "web_search", allowed_domains: OFFICIAL_DOMAINS }],
      }),
    });

    if (!resp.ok) throw new Error(`LLM API returned ${resp.status}`);
    const data = await resp.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");

    const citedUrls = new Set();
    for (const block of data.content || []) {
      for (const cite of block.citations || []) {
        if (cite.url) citedUrls.add(cite.url);
      }
    }

    const payload = {
      items: [{ title: "Recent official updates", text }],
      sources: Array.from(citedUrls),
      disclaimer: DISCLAIMER,
    };
    cache = { payload, generatedAt: Date.now() };

    await logAudit(req.user.id, "llm_web_search");
    res.json({ ...payload, mode: "llm_web_search" });
  } catch (err) {
    console.error("News fetch failed, falling back:", err.message);
    await logAudit(req.user.id, "fallback_after_error");
    res.json({ items: STATIC_FALLBACK_ITEMS, sources: [], mode: "fallback_after_error", disclaimer: DISCLAIMER });
  }
});

module.exports = router;
