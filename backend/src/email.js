// FR5: reminder delivery. Same optional-key pattern as the AI assistants
// (backend/src/routes/ai.js) -- zero cost and zero setup by default (logs
// instead of sending), and only calls a real provider if configured. Uses
// Resend's plain HTTP API instead of an SDK to keep the prototype
// dependency-free, matching how ai.js/city.js call the Anthropic API.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.REMINDER_FROM_EMAIL || "PNW Pathway <reminders@pnwpathway.example>";

async function sendEmail({ to, subject, text }) {
  if (!RESEND_API_KEY) {
    console.log(`[reminder email fallback, no RESEND_API_KEY set] to=${to} subject="${subject}"`);
    return { sent: false, mode: "fallback_logged" };
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, text }),
  });
  if (!resp.ok) throw new Error(`Email provider returned ${resp.status}`);
  return { sent: true, mode: "sent" };
}

module.exports = { sendEmail };
