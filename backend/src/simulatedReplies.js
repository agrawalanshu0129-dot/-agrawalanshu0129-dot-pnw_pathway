const { pool } = require("./db");

// Demo-only feature: this app has no second live user to answer as staff
// during a walkthrough, so a student message gets a canned, topic-matched
// reply from their assigned ISS contact a few seconds later. Replies are
// flagged is_simulated so the UI always labels them, never passing one off
// as a real staff response. Set DEMO_AUTO_REPLIES=false to turn this off
// (e.g. in a deployment where a real staff member is actually answering).
const ENABLED = process.env.DEMO_AUTO_REPLIES !== "false";

const TOPICS = [
  {
    keywords: ["sevis", "i-901", "i901"],
    replies: [
      "Thanks for the update on the SEVIS fee — I'll double check it's reflected on our end and follow up if anything's missing.",
      "Got it re: the SEVIS I-901 payment. I'll confirm it posted correctly in our system.",
    ],
  },
  {
    keywords: ["i-20", "i20"],
    replies: [
      "Thanks — I'll take a look at your I-20 request and get back to you shortly.",
      "Noted on the I-20. I'll review your program details and let you know if anything else is needed.",
    ],
  },
  {
    keywords: ["transcript"],
    replies: [
      "Thanks for sending that over. I'll check the transcript against your program requirements.",
      "Got your message about the transcript — I'll follow up once I've had a chance to review it.",
    ],
  },
  {
    keywords: ["bank", "financial", "funding", "sponsor"],
    replies: [
      "Thanks for the update on your financial documentation. I'll review it against the required amount.",
      "Got it — I'll take a look at your funding documents and reach out if I need anything else.",
    ],
  },
  {
    keywords: ["housing", "apartment", "dorm", "roommate"],
    replies: [
      "Thanks for the housing update! Let me know if you'd like some neighborhood recommendations too.",
      "Got it on housing. Reach out if you want help thinking through the application or waiver.",
    ],
  },
  {
    keywords: ["immuniz", "vaccine", "mmr"],
    replies: [
      "Thanks for sending your immunization records — I'll pass these along to Student Health for review.",
      "Got it, thank you. I'll check that everything required by the state is included.",
    ],
  },
  {
    keywords: ["english", "toefl", "ielts", "duolingo"],
    replies: [
      "Thanks for the update on your English proficiency documentation. I'll take a look.",
      "Got it — I'll verify your score meets the program threshold and follow up if needed.",
    ],
  },
  {
    keywords: ["visa", "interview", "embassy", "consulate"],
    replies: [
      "Thanks for the update on your visa interview. Let me know if you'd like tips on what to bring.",
      "Good to know. Reach out if you want to talk through what to expect at the interview.",
    ],
  },
  {
    keywords: ["orientation"],
    replies: [
      "Thanks for registering for orientation! You'll get a confirmation email with the schedule shortly.",
      "Got it — glad you're signed up. Let me know if you have questions before the session.",
    ],
  },
  {
    keywords: ["passport"],
    replies: [
      "Thanks for the passport copy — I'll check it meets the six-month validity requirement.",
      "Got it, thank you. I'll take a look and let you know if the scan needs anything.",
    ],
  },
  {
    keywords: ["deadline", "due", "late", "extension", "overdue"],
    replies: [
      "Thanks for flagging that. Let me look into your timeline and I'll follow up shortly.",
      "I hear you on the deadline — let me check what flexibility we have and get back to you.",
    ],
  },
  {
    keywords: ["thank"],
    replies: [
      "You're welcome! Let me know if anything else comes up.",
      "Happy to help — reach out anytime.",
    ],
  },
];

const FALLBACK_REPLIES = [
  "Thanks for reaching out — I'll take a look and follow up if I need anything else from you.",
  "Got your message. I'll review this and get back to you soon.",
  "Thanks for the update! I'll check in on this and let you know if there's anything else needed.",
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Match at a word start only (no trailing \b) so "thank" still matches
// "thanks"/"thankful", while a plain substring check would also wrongly
// match short keywords like "late" or "due" mid-word ("unrelated", "residue").
function containsKeyword(text, keyword) {
  return new RegExp(`\\b${escapeRegex(keyword)}`, "i").test(text);
}

function pickReply(messageBody) {
  const text = messageBody || "";
  const matched = TOPICS.filter((t) => t.keywords.some((k) => containsKeyword(text, k)));
  const pool = matched.length > 0 ? matched[Math.floor(Math.random() * matched.length)].replies : FALLBACK_REPLIES;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Fire-and-forget: the calling route has already saved the student's real
// message and responded to the request, so failures here are logged only.
function scheduleSimulatedReply({ studentId, staffUserId, messageBody }) {
  if (!ENABLED || !staffUserId) return;

  const delayMs = 3000 + Math.floor(Math.random() * 4000);
  setTimeout(async () => {
    try {
      const body = pickReply(messageBody);
      const ins = await pool.query(
        `INSERT INTO messages (student_id, sender_user_id, body, is_simulated)
         VALUES ($1, $2, $3, true) RETURNING id`,
        [studentId, staffUserId, body]
      );
      await pool.query(
        `INSERT INTO audit_log (actor_user_id, action, entity, entity_id, detail)
         VALUES (NULL, 'send_message', 'message', $1, $2)`,
        [ins.rows[0].id, { student_id: studentId, on_behalf_of: staffUserId, simulated: true }]
      );
    } catch (err) {
      console.error("Simulated reply failed:", err.message);
    }
  }, delayMs);
}

module.exports = { scheduleSimulatedReply, pickReply, ENABLED };
