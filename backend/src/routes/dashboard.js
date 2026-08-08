const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { computeRisk } = require("../atRisk");
const { sendEmail } = require("../email");

const router = express.Router();

router.get("/", requireAuth, requireRole("staff", "supervisor", "admin"), async (req, res) => {
  const { population, program } = req.query;
  // FR8: staff see their own caseload by default; supervisor/admin see
  // everyone unless they explicitly ask to filter to their own (?mine=true).
  const mine = req.query.mine === "true" || req.user.role === "staff";

  try {
    const params = [];
    let where = "1=1";
    if (population) { params.push(population); where += ` AND s.population = $${params.length}`; }
    if (program) { params.push(program); where += ` AND s.program ILIKE $${params.length}`; }
    if (mine) { params.push(req.user.id); where += ` AND a.staff_user_id = $${params.length}`; }

    const studentsRes = await pool.query(
      `SELECT s.id, s.population, s.program, s.country, s.funding_type, s.onboarded_at,
              u.full_name, u.email,
              a.staff_user_id AS assigned_staff_id, su.full_name AS assigned_staff_name,
              a.is_coverage AS assignment_is_coverage
       FROM students s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN assignments a ON a.student_id = s.id AND a.ended_at IS NULL
       LEFT JOIN users su ON su.id = a.staff_user_id
       WHERE ${where}
       ORDER BY s.onboarded_at DESC NULLS LAST`,
      params
    );

    const students = studentsRes.rows;
    if (students.length === 0) return res.json({ students: [], summary: emptySummary() });

    const itemsRes = await pool.query(
      `SELECT ci.student_id, ci.status, ci.due_date, rt.visa_critical
       FROM checklist_items ci
       JOIN requirement_templates rt ON rt.id = ci.template_id
       WHERE ci.student_id = ANY($1::int[])`,
      [students.map((s) => s.id)]
    );

    const itemsByStudent = {};
    for (const row of itemsRes.rows) {
      (itemsByStudent[row.student_id] ||= []).push(row);
    }

    const enriched = students.map((s) => {
      const items = itemsByStudent[s.id] || [];
      const risk = computeRisk(items);
      const completed = items.filter((i) => i.status === "approved").length;
      return {
        ...s,
        total_items: items.length,
        completed_items: completed,
        percent_complete: items.length ? Math.round((completed / items.length) * 100) : 0,
        at_risk: risk.atRisk,
        overdue_count: risk.overdueCount,
        risk_reasons: risk.reasons,
      };
    });

    const summary = {
      total_students: enriched.length,
      at_risk_count: enriched.filter((s) => s.at_risk).length,
      avg_percent_complete: Math.round(enriched.reduce((a, s) => a + s.percent_complete, 0) / enriched.length),
    };

    enriched.sort((a, b) => (b.at_risk - a.at_risk) || (b.overdue_count - a.overdue_count));

    res.json({ students: enriched, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load dashboard" });
  }
});

// FR5: send reminder emails to the currently at-risk students in view
// (respects the same population/program/mine filters as the list above).
router.post("/remind", requireAuth, requireRole("staff", "supervisor", "admin"), async (req, res) => {
  const { population, program } = req.query;
  const mine = req.query.mine === "true" || req.user.role === "staff";

  try {
    const params = [];
    let where = "1=1";
    if (population) { params.push(population); where += ` AND s.population = $${params.length}`; }
    if (program) { params.push(program); where += ` AND s.program ILIKE $${params.length}`; }
    if (mine) { params.push(req.user.id); where += ` AND a.staff_user_id = $${params.length}`; }

    const studentsRes = await pool.query(
      `SELECT s.id, u.full_name, u.email
       FROM students s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN assignments a ON a.student_id = s.id AND a.ended_at IS NULL
       WHERE ${where}`,
      params
    );
    if (studentsRes.rows.length === 0) return res.json({ attempted: 0, sent: 0, fallback: 0 });

    const itemsRes = await pool.query(
      `SELECT ci.student_id, ci.due_date, ci.status, rt.title, rt.visa_critical
       FROM checklist_items ci
       JOIN requirement_templates rt ON rt.id = ci.template_id
       WHERE ci.student_id = ANY($1::int[])`,
      [studentsRes.rows.map((s) => s.id)]
    );
    const itemsByStudent = {};
    for (const row of itemsRes.rows) (itemsByStudent[row.student_id] ||= []).push(row);

    const isOpen = (s) => s === "not_started" || s === "in_progress" || s === "returned";
    let sent = 0, fallback = 0, attempted = 0;

    for (const student of studentsRes.rows) {
      const items = itemsByStudent[student.id] || [];
      const risk = computeRisk(items);
      if (!risk.atRisk) continue;

      const flagged = items.filter((i) => isOpen(i.status));
      const body = flagged
        .map((i) => `- ${i.title} (due ${new Date(i.due_date).toDateString()}${i.visa_critical ? ", visa-critical" : ""})`)
        .join("\n");

      attempted += 1;
      const result = await sendEmail({
        to: student.email,
        subject: "PNW Pathway: action needed on your checklist",
        text: `Hi ${student.full_name.split(" ")[0]},\n\nYour PNW Pathway checklist needs attention:\n\n${body}\n\nLog in to review and submit.\n\n- International Student Services`,
      });
      if (result.sent) sent += 1; else fallback += 1;

      await pool.query(
        `INSERT INTO audit_log (actor_user_id, action, entity, entity_id, detail)
         VALUES ($1,'send_reminder','student',$2,$3)`,
        [req.user.id, student.id, { mode: result.mode, reasons: risk.reasons }]
      );
    }

    res.json({ attempted, sent, fallback });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not send reminders" });
  }
});

// FR7: full checklist for one student, so staff have somewhere to actually
// click Approve/Return (the dashboard list above is summary-only).
router.get("/:studentId", requireAuth, requireRole("staff", "supervisor", "admin"), async (req, res) => {
  try {
    const studentRes = await pool.query(
      `SELECT s.id, s.population, s.program, s.country, s.funding_type, s.onboarded_at,
              u.full_name, u.email,
              a.staff_user_id AS assigned_staff_id, su.full_name AS assigned_staff_name,
              a.is_coverage AS assignment_is_coverage
       FROM students s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN assignments a ON a.student_id = s.id AND a.ended_at IS NULL
       LEFT JOIN users su ON su.id = a.staff_user_id
       WHERE s.id = $1`,
      [req.params.studentId]
    );
    if (studentRes.rows.length === 0) return res.status(404).json({ error: "Student not found" });
    const student = studentRes.rows[0];

    if (req.user.role === "staff" && student.assigned_staff_id !== req.user.id) {
      return res.status(403).json({ error: "This student is not on your caseload" });
    }

    const itemsRes = await pool.query(
      `SELECT ci.id, ci.status, ci.due_date, ci.completed_at, ci.reviewer_note,
              rt.code, rt.title, rt.description, rt.owner_office, rt.visa_critical,
              EXISTS(SELECT 1 FROM documents d WHERE d.checklist_item_id = ci.id) AS has_document
       FROM checklist_items ci
       JOIN requirement_templates rt ON rt.id = ci.template_id
       WHERE ci.student_id = $1
       ORDER BY ci.due_date ASC`,
      [student.id]
    );

    const risk = computeRisk(itemsRes.rows);
    res.json({ student, items: itemsRes.rows, at_risk: risk.atRisk, risk_reasons: risk.reasons });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load student" });
  }
});

function emptySummary() {
  return { total_students: 0, at_risk_count: 0, avg_percent_complete: 0 };
}

module.exports = router;
