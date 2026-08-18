const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { generateChecklist } = require("../rulesEngine");
const { precheckDocument } = require("../ai/documentPrecheck");

const router = express.Router();

// Document uploads: stored as bytea in Postgres rather than an object-storage
// bucket, so real uploads work without adding a paid dependency to the
// free-tier prototype (see README Known Limitations).
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = ["application/pdf", "image/png", "image/jpeg"];

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

    const staffRes = await pool.query(
      `SELECT u.full_name, u.email
       FROM assignments a JOIN users u ON u.id = a.staff_user_id
       WHERE a.student_id = $1 AND a.ended_at IS NULL`,
      [student.id]
    );
    const assignedStaff = staffRes.rows[0] || null;

    const itemsRes = await pool.query(
      `SELECT ci.id, ci.status, ci.due_date, ci.completed_at, ci.reviewer_note,
              rt.code, rt.title, rt.description, rt.owner_office, rt.visa_critical, rt.sort_order,
              EXISTS(SELECT 1 FROM documents d WHERE d.checklist_item_id = ci.id) AS has_document
       FROM checklist_items ci
       JOIN requirement_templates rt ON rt.id = ci.template_id
       WHERE ci.student_id = $1
       ORDER BY ci.due_date ASC`,
      [student.id]
    );

    // Journey roadmap: the same items, in the sequence they're meant to be
    // tackled (sort_order, i.e. the order ISS actually processes them),
    // rather than by deadline. "current" is the first open item in that
    // sequence; everything after it is "what comes next", with its due
    // date doubling as the ETA.
    const bySequence = [...itemsRes.rows].sort((a, b) => a.sort_order - b.sort_order);
    const isOpen = (s) => s === "not_started" || s === "in_progress" || s === "returned";
    const currentIndex = bySequence.findIndex((i) => isOpen(i.status));
    const roadmap = bySequence.map((item, idx) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      due_date: item.due_date,
      visa_critical: item.visa_critical,
      stage:
        item.status === "approved"
          ? "done"
          : currentIndex === idx
          ? "current"
          : currentIndex === -1 || idx < currentIndex
          ? "done"
          : "upcoming",
    }));

    res.json({ student, assigned_staff: assignedStaff, items: itemsRes.rows, roadmap });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load checklist" });
  }
});

// Hand-rolled iCalendar text rather than a new dependency -- the content
// here (short titles/descriptions) never approaches RFC 5545's 75-octet
// line-folding threshold, so that part of the spec is deliberately skipped.
function escapeICSText(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function formatICSDate(dateInput) {
  const d = new Date(dateInput);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function nowICSStamp() {
  return `${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

router.get("/me/checklist.ics", requireAuth, requireRole("student"), async (req, res) => {
  try {
    const studentRes = await pool.query("SELECT id FROM students WHERE user_id = $1", [req.user.id]);
    if (studentRes.rows.length === 0) return res.status(404).json({ error: "Complete onboarding first" });

    const itemsRes = await pool.query(
      `SELECT ci.id, ci.due_date, rt.title, rt.description, rt.owner_office, rt.visa_critical
       FROM checklist_items ci
       JOIN requirement_templates rt ON rt.id = ci.template_id
       WHERE ci.student_id = $1 AND ci.status != 'approved'
       ORDER BY ci.due_date ASC`,
      [studentRes.rows[0].id]
    );

    const stamp = nowICSStamp();
    const events = itemsRes.rows.map((item) => [
      "BEGIN:VEVENT",
      `UID:pnw-pathway-item-${item.id}@pnwpathway`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${formatICSDate(item.due_date)}`,
      `SUMMARY:${escapeICSText(`${item.visa_critical ? "[Visa-critical] " : ""}${item.title}`)}`,
      `DESCRIPTION:${escapeICSText(`${item.description || ""} (Owner: ${item.owner_office})`)}`,
      "END:VEVENT",
    ].join("\r\n"));

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//PNW Pathway//Checklist//EN",
      "CALSCALE:GREGORIAN",
      ...events,
      "END:VCALENDAR",
    ].join("\r\n");

    res.set("Content-Type", "text/calendar; charset=utf-8");
    res.set("Content-Disposition", 'attachment; filename="pnw-pathway-deadlines.ics"');
    res.send(ics);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not generate calendar file" });
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

router.post("/me/checklist/:itemId/document", requireAuth, requireRole("student"), async (req, res) => {
  const { filename, mime_type, content_base64 } = req.body || {};
  if (!filename || !mime_type || !content_base64) {
    return res.status(400).json({ error: "filename, mime_type, and content_base64 are required" });
  }
  if (!ALLOWED_DOCUMENT_TYPES.includes(mime_type)) {
    return res.status(400).json({ error: `mime_type must be one of: ${ALLOWED_DOCUMENT_TYPES.join(", ")}` });
  }

  let content;
  try {
    content = Buffer.from(content_base64, "base64");
  } catch {
    return res.status(400).json({ error: "content_base64 is not valid base64" });
  }
  if (content.length === 0 || content.length > MAX_DOCUMENT_BYTES) {
    return res.status(400).json({ error: `File must be between 1 byte and ${MAX_DOCUMENT_BYTES / (1024 * 1024)}MB` });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const studentRes = await client.query("SELECT id FROM students WHERE user_id = $1", [req.user.id]);
    if (studentRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Student profile not found" });
    }
    const studentId = studentRes.rows[0].id;

    const itemRes = await client.query(
      `SELECT ci.id, ci.status, rt.title FROM checklist_items ci
       JOIN requirement_templates rt ON rt.id = ci.template_id
       WHERE ci.id = $1 AND ci.student_id = $2`,
      [req.params.itemId, studentId]
    );
    if (itemRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Checklist item not found" });
    }
    if (itemRes.rows[0].status === "approved") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "This item is already approved; nothing to re-submit" });
    }

    await client.query("DELETE FROM documents WHERE checklist_item_id = $1", [req.params.itemId]);
    await client.query(
      `INSERT INTO documents (checklist_item_id, student_id, filename, mime_type, size_bytes, content)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.params.itemId, studentId, filename, mime_type, content.length, content]
    );

    const result = await client.query(
      `UPDATE checklist_items SET status='submitted' WHERE id=$1 RETURNING *`,
      [req.params.itemId]
    );

    await client.query(
      `INSERT INTO audit_log (actor_user_id, action, entity, entity_id, detail)
       VALUES ($1,'upload_document','checklist_item',$2,$3)`,
      [req.user.id, req.params.itemId, { filename, mime_type, size_bytes: content.length }]
    );

    await client.query("COMMIT");

    // Best-effort and outside the transaction (it's a network call, not a DB
    // write) -- the upload has already succeeded regardless of this result.
    const ai_precheck = await precheckDocument({
      mimeType: mime_type,
      base64Content: content_base64,
      itemTitle: itemRes.rows[0].title,
    });

    res.status(201).json({ ...result.rows[0], ai_precheck });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Upload failed" });
  } finally {
    client.release();
  }
});

router.get("/me/checklist/:itemId/document", requireAuth, requireRole("student"), async (req, res) => {
  try {
    const studentRes = await pool.query("SELECT id FROM students WHERE user_id = $1", [req.user.id]);
    if (studentRes.rows.length === 0) return res.status(404).json({ error: "Student profile not found" });

    const docRes = await pool.query(
      "SELECT filename, mime_type, content FROM documents WHERE checklist_item_id = $1 AND student_id = $2",
      [req.params.itemId, studentRes.rows[0].id]
    );
    if (docRes.rows.length === 0) return res.status(404).json({ error: "No document uploaded for this item" });

    const doc = docRes.rows[0];
    res.set("Content-Type", doc.mime_type);
    res.set("Content-Disposition", `inline; filename="${encodeURIComponent(doc.filename)}"`);
    res.send(doc.content);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load document" });
  }
});

router.get("/:studentId/checklist/:itemId/document", requireAuth, requireRole("staff", "supervisor", "admin"), async (req, res) => {
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

    const docRes = await pool.query(
      "SELECT filename, mime_type, content FROM documents WHERE checklist_item_id = $1 AND student_id = $2",
      [req.params.itemId, req.params.studentId]
    );
    if (docRes.rows.length === 0) return res.status(404).json({ error: "No document uploaded for this item" });

    const doc = docRes.rows[0];
    res.set("Content-Type", doc.mime_type);
    res.set("Content-Disposition", `inline; filename="${encodeURIComponent(doc.filename)}"`);
    res.send(doc.content);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load document" });
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
