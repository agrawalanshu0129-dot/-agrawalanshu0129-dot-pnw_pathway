const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { sendEmail } = require("../email");

const router = express.Router();

const STAFF_ROLES = ["staff", "supervisor", "admin"];

// Best-effort: assignment succeeded regardless of whether this email goes
// out (or is just logged, per email.js's optional-key fallback), so a
// failure here is logged and swallowed rather than surfaced to the caller.
async function notifyAssignment(staffUserId, subject, body) {
  try {
    const staffRes = await pool.query("SELECT email, full_name FROM users WHERE id = $1", [staffUserId]);
    if (staffRes.rows.length === 0) return;
    const staff = staffRes.rows[0];
    await sendEmail({
      to: staff.email,
      subject,
      text: `Hi ${staff.full_name.split(" ")[0]},\n\n${body}\n\n- PNW Pathway`,
    });
  } catch (err) {
    console.error("Assignment notification failed:", err.message);
  }
}

// FR8: caseload -- which staff member currently owns which student.
// A student has at most one active (ended_at IS NULL) assignment at a time.
router.get("/", requireAuth, requireRole(...STAFF_ROLES), async (req, res) => {
  try {
    const mine = req.query.mine === "true" || req.user.role === "staff";
    const params = [];
    let where = "a.ended_at IS NULL";
    if (mine) {
      params.push(req.user.id);
      where += ` AND a.staff_user_id = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT a.id, a.student_id, a.staff_user_id, a.is_coverage, a.effective_at,
              su.full_name AS staff_name, su.email AS staff_email,
              stu.full_name AS student_name, stu.email AS student_email,
              s.program, s.population
       FROM assignments a
       JOIN users su ON su.id = a.staff_user_id
       JOIN students s ON s.id = a.student_id
       JOIN users stu ON stu.id = s.user_id
       WHERE ${where}
       ORDER BY a.effective_at DESC`,
      params
    );
    res.json({ assignments: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load assignments" });
  }
});

router.get("/staff", requireAuth, requireRole("supervisor", "admin"), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, role FROM users WHERE role = ANY($1::text[]) ORDER BY full_name`,
      [STAFF_ROLES]
    );
    res.json({ staff: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load staff list" });
  }
});

router.get("/unassigned", requireAuth, requireRole("supervisor", "admin"), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id AS student_id, u.full_name, u.email, s.program, s.population
       FROM students s
       JOIN users u ON u.id = s.user_id
       WHERE NOT EXISTS (
         SELECT 1 FROM assignments a WHERE a.student_id = s.id AND a.ended_at IS NULL
       )
       ORDER BY u.full_name`
    );
    res.json({ students: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load unassigned students" });
  }
});

// Assign (or reassign) a single student to a staff member.
router.post("/", requireAuth, requireRole("supervisor", "admin"), async (req, res) => {
  const { student_id, staff_user_id } = req.body || {};
  if (!student_id || !staff_user_id) {
    return res.status(400).json({ error: "student_id and staff_user_id are required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const staffRes = await client.query(
      "SELECT id FROM users WHERE id = $1 AND role = ANY($2::text[])",
      [staff_user_id, STAFF_ROLES]
    );
    if (staffRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "staff_user_id must belong to a staff, supervisor, or admin user" });
    }
    const studentRes = await client.query("SELECT id FROM students WHERE id = $1", [student_id]);
    if (studentRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Student not found" });
    }

    await client.query(
      "UPDATE assignments SET ended_at = now() WHERE student_id = $1 AND ended_at IS NULL",
      [student_id]
    );
    const ins = await client.query(
      `INSERT INTO assignments (staff_user_id, student_id, is_coverage) VALUES ($1, $2, false) RETURNING *`,
      [staff_user_id, student_id]
    );

    await client.query(
      `INSERT INTO audit_log (actor_user_id, action, entity, entity_id, detail)
       VALUES ($1, 'assign', 'student', $2, $3)`,
      [req.user.id, student_id, { staff_user_id }]
    );

    await client.query("COMMIT");

    const studentNameRes = await pool.query(
      "SELECT u.full_name FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = $1",
      [student_id]
    );
    notifyAssignment(
      staff_user_id,
      "PNW Pathway: new student assigned to your caseload",
      `${studentNameRes.rows[0].full_name} has been assigned to your caseload. Log in to view their checklist.`
    );

    res.status(201).json(ins.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Assignment failed" });
  } finally {
    client.release();
  }
});

// FR9: vacation coverage -- move an entire caseload from one staff member to
// another in one step. The new rows are flagged is_coverage=true so the
// dashboard/roster can distinguish "covering for someone" from a permanent
// caseload assignment.
router.post("/reassign", requireAuth, requireRole("supervisor", "admin"), async (req, res) => {
  const { from_staff_user_id, to_staff_user_id } = req.body || {};
  if (!from_staff_user_id || !to_staff_user_id) {
    return res.status(400).json({ error: "from_staff_user_id and to_staff_user_id are required" });
  }
  if (from_staff_user_id === to_staff_user_id) {
    return res.status(400).json({ error: "from_staff_user_id and to_staff_user_id must differ" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const toStaffRes = await client.query(
      "SELECT id FROM users WHERE id = $1 AND role = ANY($2::text[])",
      [to_staff_user_id, STAFF_ROLES]
    );
    if (toStaffRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "to_staff_user_id must belong to a staff, supervisor, or admin user" });
    }

    const activeRes = await client.query(
      "SELECT student_id FROM assignments WHERE staff_user_id = $1 AND ended_at IS NULL",
      [from_staff_user_id]
    );
    if (activeRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.json({ reassigned_count: 0 });
    }

    await client.query(
      "UPDATE assignments SET ended_at = now() WHERE staff_user_id = $1 AND ended_at IS NULL",
      [from_staff_user_id]
    );

    for (const row of activeRes.rows) {
      await client.query(
        `INSERT INTO assignments (staff_user_id, student_id, is_coverage) VALUES ($1, $2, true)`,
        [to_staff_user_id, row.student_id]
      );
    }

    await client.query(
      `INSERT INTO audit_log (actor_user_id, action, entity, entity_id, detail)
       VALUES ($1, 'reassign_coverage', 'staff_user', $2, $3)`,
      [req.user.id, from_staff_user_id, { to_staff_user_id, student_count: activeRes.rows.length }]
    );

    await client.query("COMMIT");

    notifyAssignment(
      to_staff_user_id,
      "PNW Pathway: caseload coverage assigned to you",
      `${activeRes.rows.length} student(s) have been reassigned to you for coverage. Log in to view your caseload.`
    );

    res.json({ reassigned_count: activeRes.rows.length });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Reassignment failed" });
  } finally {
    client.release();
  }
});

router.patch("/:id/end", requireAuth, requireRole("supervisor", "admin"), async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE assignments SET ended_at = now() WHERE id = $1 AND ended_at IS NULL RETURNING *",
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Active assignment not found" });
    }

    await pool.query(
      `INSERT INTO audit_log (actor_user_id, action, entity, entity_id, detail)
       VALUES ($1, 'end_assignment', 'assignment', $2, $3)`,
      [req.user.id, req.params.id, {}]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not end assignment" });
  }
});

module.exports = router;
