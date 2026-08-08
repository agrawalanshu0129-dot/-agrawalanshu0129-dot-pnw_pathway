const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { computeRisk } = require("../atRisk");

const router = express.Router();

router.get("/", requireAuth, requireRole("staff", "supervisor", "admin"), async (req, res) => {
  const { population, program } = req.query;

  try {
    const params = [];
    let where = "1=1";
    if (population) { params.push(population); where += ` AND s.population = $${params.length}`; }
    if (program) { params.push(program); where += ` AND s.program ILIKE $${params.length}`; }

    const studentsRes = await pool.query(
      `SELECT s.id, s.population, s.program, s.country, s.funding_type, s.onboarded_at,
              u.full_name, u.email
       FROM students s JOIN users u ON u.id = s.user_id
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

function emptySummary() {
  return { total_students: 0, at_risk_count: 0, avg_percent_complete: 0 };
}

module.exports = router;
