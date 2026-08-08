const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { retrieve, COST_OF_LIVING, NEIGHBORHOODS, TRANSIT, TRANSIT_NOTE } = require("../city/cityDocs");
const { pool } = require("../db");

const router = express.Router();

const DISCLAIMER =
  "Costs, routes, and prices change. Treat this as a starting point and verify current details before making a decision.";

async function logAudit(userId, question, mode) {
  try {
    await pool.query(
      `INSERT INTO audit_log (actor_user_id, action, entity, detail) VALUES ($1,$2,$3,$4)`,
      [userId, "city_assistant_query", "city_assistant", { question, mode }]
    );
  } catch (e) {
    console.error("audit log failed", e.message);
  }
}

// Structured data for the Cost-of-Living / Neighborhoods / Transit page.
// This is deliberately a plain GET of curated JSON (not an AI call) so the
// page renders instantly and reliably; the chat assistant below is for
// open-ended follow-up questions.
router.get("/info", requireAuth, (req, res) => {
  res.json({
    cost_of_living: COST_OF_LIVING,
    neighborhoods: NEIGHBORHOODS,
    transit: TRANSIT,
    transit_note: TRANSIT_NOTE,
  });
});

// City Life assistant. Unlike the admissions assistant (backend/src/routes/ai.js),
// which is deliberately restricted to approved documents only (NFR8, because
// visa/requirements answers carry real consequences), this assistant is for
// lower-stakes settling-in questions, so it is allowed to use live web search
// when an LLM key is configured. Falls back to the curated Everett dataset
// above at zero cost when no key is set. Kept as a fully separate route/file
// from ai.js on purpose, so the admissions assistant's safety behavior can
// never be affected by this one.
router.post("/ask", requireAuth, async (req, res) => {
  const { question } = req.body || {};
  if (!question || typeof question !== "string" || question.trim().length < 3) {
    return res.status(400).json({ error: "Provide a question with a few words of detail." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    const hits = retrieve(question, 2);
    await logAudit(req.user.id, question, "fallback_curated");
    if (hits.length === 0) {
      return res.json({
        answer:
          "I don't have curated information on that yet. Try asking about cost of living, neighborhoods, or getting around Everett, or set an API key to enable live web search for anything else.",
        sources: [],
        mode: "fallback_no_match",
      });
    }
    return res.json({
      answer: hits.map((d) => `From "${d.title}": ${d.text}`).join("\n\n") + `\n\n${DISCLAIMER}`,
      sources: hits.map((d) => d.title),
      mode: "fallback_curated",
    });
  }

  try {
    const prompt = `You help incoming students at a university in Everett, Washington with
practical settling-in questions: cost of living, housing/neighborhoods,
public transit, budgeting, and similar day-to-day topics. You are NOT the
admissions assistant, so do not answer visa, I-20, or enrollment
requirement questions; if asked one, say that belongs to the admissions
assistant instead. Use web search for anything time-sensitive (current
prices, transit changes, availability). Keep answers under 150 words and
mention your source (a site name is enough) when you use a web result.

Question: ${question}`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });

    if (!resp.ok) throw new Error(`LLM API returned ${resp.status}`);
    const data = await resp.json();

    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    // Surface which pages the model actually cited, when present, so the
    // UI can show real sources rather than just trusting the prose.
    const citedUrls = new Set();
    for (const block of data.content || []) {
      for (const cite of block.citations || []) {
        if (cite.url) citedUrls.add(cite.url);
      }
    }

    await logAudit(req.user.id, question, "llm_web_search");
    return res.json({
      answer: text + `\n\n${DISCLAIMER}`,
      sources: Array.from(citedUrls),
      mode: "llm_web_search",
    });
  } catch (err) {
    console.error("City assistant LLM call failed, falling back:", err.message);
    const hits = retrieve(question, 2);
    await logAudit(req.user.id, question, "fallback_after_error");
    return res.json({
      answer:
        (hits.length
          ? hits.map((d) => `From "${d.title}": ${d.text}`).join("\n\n")
          : "The live assistant is temporarily unavailable and I don't have curated info on that specific question.") +
        `\n\n${DISCLAIMER}`,
      sources: hits.map((d) => d.title),
      mode: "fallback_after_error",
    });
  }
});

module.exports = router;
