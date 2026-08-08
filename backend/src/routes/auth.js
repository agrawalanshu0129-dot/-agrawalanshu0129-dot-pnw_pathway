const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { signToken } = require("../middleware/auth");

const router = express.Router();

router.post("/register", async (req, res) => {
  const { email, password, full_name } = req.body || {};
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: "email, password, and full_name are required" });
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
       VALUES ($1, $2, 'student', $3) RETURNING id, email, role, full_name`,
      [email.toLowerCase(), hash, full_name]
    );
    const user = result.rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password are required" });

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

module.exports = router;
