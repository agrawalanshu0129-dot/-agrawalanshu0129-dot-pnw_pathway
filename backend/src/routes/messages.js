const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { sendEmail } = require("../email");

const router = express.Router();

const MESSAGE_MAX_LENGTH = 4000;

const SELECT_THREAD = `
  SELECT m.id, m.sender_user_id, m.body, m.created_at, u.full_name AS sender_name, u.role AS sender_role
  FROM messages m JOIN users u ON u.id = m.sender_user_id
  WHERE m.student_id = $1
  ORDER BY m.id ASC`;

// Best-effort, mirrors notifyAssignment in assignments.js: the message is
// already saved regardless of whether this succeeds.
async function notifyNewMessage(toUserId, fromName, studentName) {
  try {
    const toRes = await pool.query("SELECT email, full_name FROM users WHERE id = $1", [toUserId]);
    if (toRes.rows.length === 0) return;
    const to = toRes.rows[0];
    await sendEmail({
      to: to.email,
      subject: `PNW Pathway: new message from ${fromName}`,
      text: `Hi ${to.full_name.split(" ")[0]},\n\nYou have a new message from ${fromName}${studentName ? ` regarding ${studentName}` : ""}. Log in to PNW Pathway to read and reply.\n\n- PNW Pathway`,
    });
  } catch (err) {
    console.error("Message notification failed:", err.message);
  }
}

router.get("/me", requireAuth, requireRole("student"), async (req, res) => {
  try {
    const studentRes = await pool.query("SELECT id FROM students WHERE user_id = $1", [req.user.id]);
    if (studentRes.rows.length === 0) return res.status(404).json({ error: "Complete onboarding first" });

    const result = await pool.query(SELECT_THREAD, [studentRes.rows[0].id]);
    res.json({ messages: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load messages" });
  }
});

router.post("/me", requireAuth, requireRole("student"), async (req, res) => {
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: "Message body is required" });
  if (body.length > MESSAGE_MAX_LENGTH) return res.status(400).json({ error: "Message is too long" });

  try {
    const studentRes = await pool.query(
      "SELECT s.id, u.full_name FROM students s JOIN users u ON u.id = s.user_id WHERE s.user_id = $1",
      [req.user.id]
    );
    if (studentRes.rows.length === 0) return res.status(404).json({ error: "Complete onboarding first" });
    const student = studentRes.rows[0];

    const ins = await pool.query(
      "INSERT INTO messages (student_id, sender_user_id, body) VALUES ($1, $2, $3) RETURNING id, created_at",
      [student.id, req.user.id, body.trim()]
    );

    const staffRes = await pool.query(
      "SELECT staff_user_id FROM assignments WHERE student_id = $1 AND ended_at IS NULL",
      [student.id]
    );
    if (staffRes.rows.length > 0) {
      notifyNewMessage(staffRes.rows[0].staff_user_id, student.full_name, null);
    }

    res.status(201).json({ id: ins.rows[0].id, created_at: ins.rows[0].created_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not send message" });
  }
});

router.get("/:studentId", requireAuth, requireRole("staff", "supervisor", "admin"), async (req, res) => {
  try {
    if (req.user.role === "staff") {
      const ownsCaseload = await pool.query(
        "SELECT 1 FROM assignments WHERE student_id = $1 AND staff_user_id = $2 AND ended_at IS NULL",
        [req.params.studentId, req.user.id]
      );
      if (ownsCaseload.rows.length === 0) {
        return res.status(403).json({ error: "This student is not on your caseload" });
      }
    }

    const result = await pool.query(SELECT_THREAD, [req.params.studentId]);
    res.json({ messages: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load messages" });
  }
});

router.post("/:studentId", requireAuth, requireRole("staff", "supervisor", "admin"), async (req, res) => {
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: "Message body is required" });
  if (body.length > MESSAGE_MAX_LENGTH) return res.status(400).json({ error: "Message is too long" });

  try {
    if (req.user.role === "staff") {
      const ownsCaseload = await pool.query(
        "SELECT 1 FROM assignments WHERE student_id = $1 AND staff_user_id = $2 AND ended_at IS NULL",
        [req.params.studentId, req.user.id]
      );
      if (ownsCaseload.rows.length === 0) {
        return res.status(403).json({ error: "This student is not on your caseload" });
      }
    }

    const studentRes = await pool.query(
      "SELECT s.id, u.id AS user_id FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = $1",
      [req.params.studentId]
    );
    if (studentRes.rows.length === 0) return res.status(404).json({ error: "Student not found" });

    const ins = await pool.query(
      "INSERT INTO messages (student_id, sender_user_id, body) VALUES ($1, $2, $3) RETURNING id, created_at",
      [req.params.studentId, req.user.id, body.trim()]
    );

    notifyNewMessage(studentRes.rows[0].user_id, req.user.full_name, null);

    res.status(201).json({ id: ins.rows[0].id, created_at: ins.rows[0].created_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not send message" });
  }
});

module.exports = router;
