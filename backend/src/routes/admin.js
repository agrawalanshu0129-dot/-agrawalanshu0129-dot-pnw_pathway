const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

const STAFF_ROLES = ["staff", "supervisor", "admin"];

// FR11: admin console -- manage staff/supervisor/admin accounts. Student
// accounts are self-service via /api/auth/register and out of scope here.
router.get("/users", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { role } = req.query;
    if (role && !STAFF_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${STAFF_ROLES.join(", ")}` });
    }
    const params = [role ? [role] : STAFF_ROLES];
    const result = await pool.query(
      `SELECT id, email, role, full_name, created_at FROM users WHERE role = ANY($1::text[]) ORDER BY full_name`,
      params
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load users" });
  }
});

router.post("/users", requireAuth, requireRole("admin"), async (req, res) => {
  const { email, password, full_name, role } = req.body || {};
  if (!email || !password || !full_name || !role) {
    return res.status(400).json({ error: "email, password, full_name, and role are required" });
  }
  if (!STAFF_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${STAFF_ROLES.join(", ")}` });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "An account with that email already exists" });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, full_name)
       VALUES ($1, $2, $3, $4) RETURNING id, email, role, full_name, created_at`,
      [email.toLowerCase(), hash, role, full_name]
    );
    const user = result.rows[0];

    await pool.query(
      `INSERT INTO audit_log (actor_user_id, action, entity, entity_id, detail)
       VALUES ($1, 'create_user', 'user', $2, $3)`,
      [req.user.id, user.id, { role }]
    );

    res.status(201).json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create user" });
  }
});

// NFR2: audit_log is written on every mutating action but had no viewer
// anywhere in the UI -- an admin couldn't actually audit anything.
router.get("/audit-log", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const params = [limit];
    let where = "1=1";
    if (req.query.before_id) {
      params.push(req.query.before_id);
      where += ` AND al.id < $${params.length}`;
    }
    const result = await pool.query(
      `SELECT al.id, al.action, al.entity, al.entity_id, al.detail, al.created_at,
              u.full_name AS actor_name, u.email AS actor_email, u.role AS actor_role
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.actor_user_id
       WHERE ${where}
       ORDER BY al.id DESC
       LIMIT $1`,
      params
    );
    res.json({ entries: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load audit log" });
  }
});

router.patch("/users/:id/role", requireAuth, requireRole("admin"), async (req, res) => {
  const { role } = req.body || {};
  if (!STAFF_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${STAFF_ROLES.join(", ")}` });
  }
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: "Cannot change your own role" });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET role = $1 WHERE id = $2 AND role = ANY($3::text[])
       RETURNING id, email, role, full_name, created_at`,
      [role, req.params.id, STAFF_ROLES]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Staff, supervisor, or admin user not found" });
    }

    await pool.query(
      `INSERT INTO audit_log (actor_user_id, action, entity, entity_id, detail)
       VALUES ($1, 'change_role', 'user', $2, $3)`,
      [req.user.id, req.params.id, { role }]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update role" });
  }
});

module.exports = router;
