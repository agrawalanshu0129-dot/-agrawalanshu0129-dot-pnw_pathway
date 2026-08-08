const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { generateChecklist } = require("../rulesEngine");

const router = express.Router();

router.post("/onboard", requireAuth, requireRole("student"), async (req, res) => {
  const { population, program, country, funding_type } = req.body || {};
  if (!population || !program) {
    return res.status(400).json({ error: "population and program are required" });
  }
  if (!["domestic", "international"].includes(population)) {
    return res.status(400).json({ error: "population must be 'domestic' or 'international'" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query("SELECT id FROM students WHERE user_id = $1", [req.user.id]);
    let studentId;
    const onboardedAt = new Date();

    if (existing.rows.length > 0) {
      studentId = existing.rows[0].id;
      await client.query(
        `UPDATE students SET population=$1, program=$2, country=$3, funding_type=$4, onboarded_at=$5
         WHERE id=$6`,
        [population, program, country || null, funding_type || null, onboardedAt, studentId]
      );
      await client.query("DELETE FROM checklist_items WHERE student_id = $1", [studentId]);
    } else {
      const ins = await client.query(
        `INSERT INTO students (user_id, population, program, country, funding_type, onboarded_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [req.user.id, population, program, country || null, funding_type || null, onboardedAt]
      );
      studentId = ins.rows[0].id;
    }

    const templatesRes = await client.query("SELECT * FROM requirement_templates");
    const items = generateChecklist({ population, funding_type }, templatesRes.rows, onboardedAt);

    for (const item of items) {
      await client.query(
        `INSERT INTO checklist_items (student_id, template_id, due_date, status) VALUES ($1,$2,$3,$4)`,
        [studentId, item.template_id, item.due_date, item.status]
      );
    }

    await client.query(
      `INSERT INTO audit_log (actor_user_id, action, entity, entity_id, detail)
       VALUES ($1,'onboard','student',$2,$3)`,
      [req.user.id, studentId, { population, program, funding_type, items_generated: items.length }]
    );

    await client.query("COMMIT");
    res.status(201).json({ student_id: studentId, items_generated: items.length });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Onboarding failed" });
  } finally {
    client.release();
  }
});

router.get("/me/checklist", requireAuth, requireRole("student"), async (req, res) => {
  try {
    const studentRes = await pool.query("SELECT * FROM students WHERE user_id = $1", [req.user.id]);
    if (studentRes.rows.length === 0) {
      return res.status(404).json({ error: "Complete onboarding first" });
    }
    const student = studentRes.rows[0];

    const itemsRes = await pool.query(
      `SELECT ci.id, ci.status, ci.due_date, ci.completed_at, ci.reviewer_note,
              rt.code, rt.title, rt.description, rt.owner_office, rt.visa_critical
       FROM checklist_items ci
       JOIN requirement_templates rt ON rt.id = ci.template_id
       WHERE ci.student_id = $1
       ORDER BY ci.due_date ASC`,
      [student.id]
    );

    res.json({ student, items: itemsRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load checklist" });
  }
});

router.patch("/me/checklist/:itemId", requireAuth, requireRole("student"), async (req, res) => {
  const { status } = req.body || {};
  if (!["in_progress", "submitted"].includes(status)) {
    return res.status(400).json({ error: "status must be 'in_progress' or 'submitted'" });
  }
  try {
    const studentRes = await pool.query("SELECT id FROM students WHERE user_id = $1", [req.user.id]);
    if (studentRes.rows.length === 0) return res.status(404).json({ error: "Student profile not found" });

    const result = await pool.query(
      `UPDATE checklist_items SET status=$1 WHERE id=$2 AND student_id=$3 RETURNING *`,
      [status, req.params.itemId, studentRes.rows[0].id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Checklist item not found" });

    await pool.query(
      `INSERT INTO audit_log (actor_user_id, action, entity, entity_id, detail)
       VALUES ($1,'update_status','checklist_item',$2,$3)`,
      [req.user.id, req.params.itemId, { status }]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update item" });
  }
});

router.patch("/:studentId/checklist/:itemId/review", requireAuth, requireRole("staff", "supervisor", "admin"), async (req, res) => {
  const { status, reviewer_note } = req.body || {};
  if (!["approved", "returned"].includes(status)) {
    return res.status(400).json({ error: "status must be 'approved' or 'returned'" });
  }
  try {
    const result = await pool.query(
      `UPDATE checklist_items
       SET status=$1, reviewer_note=$2, completed_at = CASE WHEN $1='approved' THEN now() ELSE completed_at END
       WHERE id=$3 AND student_id=$4 RETURNING *`,
      [status, reviewer_note || null, req.params.itemId, req.params.studentId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Checklist item not found" });

    await pool.query(
      `INSERT INTO audit_log (actor_user_id, action, entity, entity_id, detail)
       VALUES ($1,'review','checklist_item',$2,$3)`,
      [req.user.id, req.params.itemId, { status, reviewer_note }]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Review failed" });
  }
});

module.exports = router;
