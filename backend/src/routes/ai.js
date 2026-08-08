const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { retrieve } = require("../ai/docs");
const { pool } = require("../db");

const router = express.Router();

const DISCLAIMER =
  "This is general university guidance, not legal or immigration advice. For anything visa-specific to your situation, contact International Student Services.";

async function logAudit(userId, question, mode) {
  try {
    await pool.query(
      `INSERT INTO audit_log (actor_user_id, action, entity, detail) VALUES ($1,$2,$3,$4)`,
      [userId, "ai_assistant_query", "assistant", { question, mode }]
    );
  } catch (e) {
    console.error("audit log failed", e.message);
  }
}

router.post("/ask", requireAuth, async (req, res) => {
  const { question } = req.body || {};
  if (!question || typeof question !== "string" || question.trim().length < 3) {
    return res.status(400).json({ error: "Provide a question with a few words of detail." });
  }

  const hits = retrieve(question, 2);

  if (hits.length === 0) {
    await logAudit(req.user.id, question, "escalate");
    return res.json({
      answer:
        "I could not find that in the approved requirement documentation, so I do not want to guess. Please reach out to International Student Services or the Registrar's office directly.",
      sources: [],
      escalated: true,
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    await logAudit(req.user.id, question, "fallback_retrieval");
    return res.json({
      answer: hits
        .map((d) => `From "${d.title}": ${d.text}`)
        .join("\n\n") + `\n\n${DISCLAIMER}`,
      sources: hits.map((d) => d.title),
      escalated: false,
      mode: "fallback",
    });
  }

  try {
    const context = hits.map((d) => `[${d.title}]\n${d.text}`).join("\n\n");
    const prompt = `You are an assistant for admitted students at a university. Answer the
question using ONLY the approved documentation below. If the documentation does
not fully answer it, say so explicitly and recommend contacting International
Student Services or the Registrar. Never give legal or immigration advice
beyond what is written. Cite which document(s) you used by title. Keep the
answer under 120 words.

Approved documentation:
${context}

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
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) throw new Error(`LLM API returned ${resp.status}`);
    const data = await resp.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    await logAudit(req.user.id, question, "llm_rag");
    return res.json({
      answer: text + `\n\n${DISCLAIMER}`,
      sources: hits.map((d) => d.title),
      escalated: false,
      mode: "llm",
    });
  } catch (err) {
    console.error("AI assistant LLM call failed, falling back:", err.message);
    await logAudit(req.user.id, question, "fallback_after_error");
    return res.json({
      answer: hits.map((d) => `From "${d.title}": ${d.text}`).join("\n\n") + `\n\n${DISCLAIMER}`,
      sources: hits.map((d) => d.title),
      escalated: false,
      mode: "fallback_after_error",
    });
  }
});

module.exports = router;
