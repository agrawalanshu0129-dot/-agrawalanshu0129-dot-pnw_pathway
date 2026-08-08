const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { pool } = require("../db");
const { signToken } = require("../middleware/auth");
const { sendEmail } = require("../email");

const router = express.Router();
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

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

// Always responds the same way whether or not the email exists, so this
// can't be used to enumerate registered accounts.
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "email is required" });

  const genericResponse = { message: "If an account exists for that email, a reset link has been sent." };

  try {
    const result = await pool.query("SELECT id, full_name FROM users WHERE email = $1", [email.toLowerCase()]);
    if (result.rows.length === 0) return res.json(genericResponse);
    const user = result.rows[0];

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await pool.query("UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3", [
      token, expires, user.id,
    ]);

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    await sendEmail({
      to: email.toLowerCase(),
      subject: "PNW Pathway: reset your password",
      text: `Hi ${user.full_name.split(" ")[0]},\n\nUse this link within the next hour to reset your password:\n${frontendUrl}/?reset_token=${token}\n\nIf you didn't request this, you can ignore this email.\n\n- PNW Pathway`,
    });

    res.json(genericResponse);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not process request" });
  }
});

router.post("/reset-password", async (req, res) => {
  const { reset_token, new_password } = req.body || {};
  if (!reset_token || !new_password) {
    return res.status(400).json({ error: "reset_token and new_password are required" });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  try {
    const result = await pool.query(
      "SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > now()",
      [reset_token]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: "This reset link is invalid or has expired" });
    }

    const hash = await bcrypt.hash(new_password, 10);
    await pool.query(
      "UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2",
      [hash, result.rows[0].id]
    );

    res.json({ message: "Password updated. You can now log in with your new password." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not reset password" });
  }
});

module.exports = router;
