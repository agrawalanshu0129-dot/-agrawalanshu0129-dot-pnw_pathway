const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { sendEmail } = require("../email");

const router = express.Router();

// Fixed business hours rather than a staff-editable calendar -- reasonable
// for a single-office prototype (see schema.sql note on the appointments
// table). All times are the server's local timezone, matching how the rest
// of the app (due dates, "days until") already treats dates as local with
// no explicit timezone conversion.
const BUSINESS_HOUR_START = 9;
const BUSINESS_HOUR_END = 17;
const SLOT_MINUTES = 30;
const WINDOW_DAYS = 14;
const MIN_LEAD_MINUTES = 60;

function isWeekday(d) {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

// All bookable 30-minute slots over the next WINDOW_DAYS, weekdays only,
// within business hours, at least MIN_LEAD_MINUTES from now.
function generateSlots() {
  const slots = [];
  const now = new Date();
  const earliest = new Date(now.getTime() + MIN_LEAD_MINUTES * 60000);

  for (let dayOffset = 0; dayOffset <= WINDOW_DAYS; dayOffset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    if (!isWeekday(day)) continue;

    for (let hour = BUSINESS_HOUR_START; hour < BUSINESS_HOUR_END; hour++) {
      for (let min = 0; min < 60; min += SLOT_MINUTES) {
        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, min);
        if (start < earliest) continue;
        const end = new Date(start.getTime() + SLOT_MINUTES * 60000);
        slots.push({ start, end });
      }
    }
  }
  return slots;
}

async function getAssignedStaff(studentId) {
  const res = await pool.query(
    `SELECT u.id, u.full_name, u.email
     FROM assignments a JOIN users u ON u.id = a.staff_user_id
     WHERE a.student_id = $1 AND a.ended_at IS NULL`,
    [studentId]
  );
  return res.rows[0] || null;
}

async function notifyNewAppointment(staffUserId, studentName, startTime) {
  try {
    const toRes = await pool.query("SELECT email, full_name FROM users WHERE id = $1", [staffUserId]);
    if (toRes.rows.length === 0) return;
    const to = toRes.rows[0];
    await sendEmail({
      to: to.email,
      subject: `PNW Pathway: new appointment booked with ${studentName}`,
      text: `Hi ${to.full_name.split(" ")[0]},\n\n${studentName} booked a 30-minute chat with you for ${startTime.toLocaleString()}.\n\n- PNW Pathway`,
    });
  } catch (err) {
    console.error("Appointment notification failed:", err.message);
  }
}

router.get("/availability", requireAuth, requireRole("student"), async (req, res) => {
  try {
    const studentRes = await pool.query("SELECT id FROM students WHERE user_id = $1", [req.user.id]);
    if (studentRes.rows.length === 0) return res.status(404).json({ error: "Complete onboarding first" });
    const studentId = studentRes.rows[0].id;

    const staff = await getAssignedStaff(studentId);
    if (!staff) return res.json({ staff: null, slots: [] });

    const slots = generateSlots();
    const windowEnd = slots.length > 0 ? slots[slots.length - 1].end : new Date();
    const bookedRes = await pool.query(
      `SELECT start_time FROM appointments
       WHERE staff_user_id = $1 AND status = 'scheduled' AND start_time >= now() AND start_time <= $2`,
      [staff.id, windowEnd]
    );
    const booked = new Set(bookedRes.rows.map((r) => new Date(r.start_time).getTime()));
    const openSlots = slots.filter((s) => !booked.has(s.start.getTime()));

    res.json({
      staff: { id: staff.id, full_name: staff.full_name },
      slots: openSlots.map((s) => s.start.toISOString()),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load availability" });
  }
});

router.get("/me", requireAuth, requireRole("student"), async (req, res) => {
  try {
    const studentRes = await pool.query("SELECT id FROM students WHERE user_id = $1", [req.user.id]);
    if (studentRes.rows.length === 0) return res.status(404).json({ error: "Complete onboarding first" });

    const result = await pool.query(
      `SELECT a.id, a.start_time, a.end_time, a.status, u.full_name AS staff_name
       FROM appointments a JOIN users u ON u.id = a.staff_user_id
       WHERE a.student_id = $1 AND a.status = 'scheduled' AND a.start_time >= now()
       ORDER BY a.start_time ASC`,
      [studentRes.rows[0].id]
    );
    res.json({ appointments: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load appointments" });
  }
});

router.post("/", requireAuth, requireRole("student"), async (req, res) => {
  const { start_time } = req.body || {};
  if (!start_time) return res.status(400).json({ error: "start_time is required" });
  const start = new Date(start_time);
  if (Number.isNaN(start.getTime())) return res.status(400).json({ error: "start_time is not a valid date" });

  try {
    const studentRes = await pool.query(
      "SELECT s.id, u.full_name FROM students s JOIN users u ON u.id = s.user_id WHERE s.user_id = $1",
      [req.user.id]
    );
    if (studentRes.rows.length === 0) return res.status(404).json({ error: "Complete onboarding first" });
    const student = studentRes.rows[0];

    const staff = await getAssignedStaff(student.id);
    if (!staff) return res.status(400).json({ error: "Your ISS contact hasn't been assigned yet" });

    // Re-derive the valid slot set server-side -- never trust a client-picked
    // arbitrary timestamp, even one that looks plausible.
    const validSlot = generateSlots().find((s) => s.start.getTime() === start.getTime());
    if (!validSlot) return res.status(400).json({ error: "That time isn't a bookable slot" });

    const ins = await pool.query(
      `INSERT INTO appointments (student_id, staff_user_id, start_time, end_time)
       VALUES ($1, $2, $3, $4) RETURNING id, start_time, end_time, status`,
      [student.id, staff.id, validSlot.start, validSlot.end]
    );

    await pool.query(
      `INSERT INTO audit_log (actor_user_id, action, entity, entity_id, detail)
       VALUES ($1,'book_appointment','appointment',$2,$3)`,
      [req.user.id, ins.rows[0].id, { staff_user_id: staff.id, start_time: validSlot.start }]
    );

    notifyNewAppointment(staff.id, student.full_name, validSlot.start);

    res.status(201).json({ ...ins.rows[0], staff_name: staff.full_name });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "That slot was just booked by someone else — please pick another." });
    }
    console.error(err);
    res.status(500).json({ error: "Could not book appointment" });
  }
});

router.delete("/:id", requireAuth, requireRole("student"), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE appointments SET status = 'cancelled'
       WHERE id = $1 AND status = 'scheduled'
         AND student_id = (SELECT id FROM students WHERE user_id = $2)
       RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Appointment not found" });

    await pool.query(
      `INSERT INTO audit_log (actor_user_id, action, entity, entity_id, detail)
       VALUES ($1,'cancel_appointment','appointment',$2,$3)`,
      [req.user.id, req.params.id, {}]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not cancel appointment" });
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

    const result = await pool.query(
      `SELECT id, start_time, end_time, status FROM appointments
       WHERE student_id = $1 AND status = 'scheduled' AND start_time >= now()
       ORDER BY start_time ASC`,
      [req.params.studentId]
    );
    res.json({ appointments: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load appointments" });
  }
});

module.exports = router;
