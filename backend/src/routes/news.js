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

// date: null marks evergreen guidance rather than a dated news item -- the
// frontend labels these "General guidance" instead of showing a stale date.
const STATIC_FALLBACK_ITEMS = [
  {
    headline: "USCIS: official policy manual and alerts",
    date: null,
    source_name: "USCIS",
    source_url: "https://www.uscis.gov/newsroom",
    summary: "The USCIS newsroom is the official source for policy changes, form updates, and processing alerts that affect all visa categories, including F-1 and J-1 students.",
    relevance_note: "A live, dated summary appears here once this deployment has an AI provider key configured.",
  },
  {
    headline: "U.S. Department of State: student visas",
    date: null,
    source_name: "U.S. Department of State",
    source_url: "https://travel.state.gov/content/travel/en/us-visas/study.html",
    summary: "The State Department's student visa page covers F-1/J-1 visa issuance, interview scheduling, and travel guidance directly from the agency that runs visa interviews.",
    relevance_note: "Check here for anything related to your visa interview, stamp, or re-entry.",
  },
  {
    headline: "SEVP: Study in the States",
    date: null,
    source_name: "SEVP / DHS",
    source_url: "https://studyinthestates.dhs.gov/",
    summary: "Study in the States is the Student and Exchange Visitor Program's official site for SEVIS, OPT/CPT, and F-1/M-1 status maintenance rules.",
    relevance_note: "The most direct source for anything about maintaining status, OPT, or SEVIS record changes.",
  },
];

const OFFICIAL_SOURCE_NAMES = "USCIS, the State Department, ICE/SEVP, Study in the States, and the Department of Education";

function isOfficialUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return OFFICIAL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

// The model is instructed to return only a JSON array, but web-search
// responses can still wrap it in stray prose despite that -- fall back to
// extracting the first top-level array before giving up.
function parseItems(text) {
  try {
    return JSON.parse(text.trim());
  } catch {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1 || end < start) throw new Error("No JSON array found in model response");
    return JSON.parse(text.slice(start, end + 1));
  }
}

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
    return res.json({ items: STATIC_FALLBACK_ITEMS, mode: "fallback_static", disclaimer: DISCLAIMER });
  }

  if (cache && Date.now() - cache.generatedAt < CACHE_TTL_MS) {
    await logAudit(req.user.id, "cache");
    return res.json({ ...cache.payload, mode: "cache" });
  }

  try {
    const prompt = `Search official U.S. government sources only (${OFFICIAL_SOURCE_NAMES}) for genuinely recent (last 60 days) official news, rule changes, or policy announcements that affect F-1 or J-1 international students in the United States.

Find up to 5 such items. If you find fewer than 5 -- including zero -- only include what you actually found; never stretch older news or invent items to fill a quota.

After searching, respond with ONLY a JSON array (no prose before or after, no markdown code fences) where each element has exactly these fields:
- "headline": short factual headline (string)
- "date": the official publication or effective date in YYYY-MM-DD format if known, otherwise null (string or null)
- "source_name": the official body, e.g. "USCIS" or "U.S. Department of State" (string)
- "source_url": the direct URL to the official page or article you found it on (string)
- "summary": one neutral paragraph explaining what actually changed, based only on the source (string)
- "relevance_note": a brief, cautious note on who it may be relevant to, e.g. "May matter if you are on OPT" or "Relevant to new F-1 applicants" -- never a personalized verdict like "this helps you" or "this harms you", and never speculate beyond what the source states (string)

Every source_url must be a real URL on one of these domains: ${OFFICIAL_DOMAINS.join(", ")}. If you cannot find a genuine official URL for an item, omit that item entirely rather than guessing at a URL. Respond with an empty array [] if you find nothing genuinely new.`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search_20250305", name: "web_search", allowed_domains: OFFICIAL_DOMAINS }],
      }),
    });

    if (!resp.ok) throw new Error(`LLM API returned ${resp.status}`);
    const data = await resp.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");

    const parsed = parseItems(text);
    if (!Array.isArray(parsed)) throw new Error("Model response was not a JSON array");

    // Defense in depth: don't just trust the prompt to keep sourcing
    // official-only -- drop anything that isn't actually on the allowlist.
    const items = parsed.filter(
      (it) => it && typeof it.headline === "string" && typeof it.summary === "string" &&
        typeof it.source_url === "string" && isOfficialUrl(it.source_url)
    );

    const payload = { items, disclaimer: DISCLAIMER };
    cache = { payload, generatedAt: Date.now() };

    await logAudit(req.user.id, "llm_web_search");
    res.json({ ...payload, mode: "llm_web_search" });
  } catch (err) {
    console.error("News fetch failed, falling back:", err.message);
    await logAudit(req.user.id, "fallback_after_error");
    res.json({ items: STATIC_FALLBACK_ITEMS, mode: "fallback_after_error", disclaimer: DISCLAIMER });
  }
});

module.exports = router;
