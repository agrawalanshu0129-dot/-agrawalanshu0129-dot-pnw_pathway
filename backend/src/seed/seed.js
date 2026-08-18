require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool, ensureSchema } = require("../db");
const templates = require("./requirementTemplates");
const { generateChecklist } = require("../rulesEngine");

const DEMO_PASSWORD = "Demo1234!";

const demoUsers = [
  { email: "admin@pnwu.edu", role: "admin", full_name: "Dana CIO-Delegate" },
  { email: "supervisor@pnwu.edu", role: "supervisor", full_name: "Sam Rivera" },
  { email: "staff@pnwu.edu", role: "staff", full_name: "Maria Delgado (ISS)" },
  { email: "student.intl@pnwu.edu", role: "student", full_name: "Alex Williams",
    profile: { population: "international", program: "MS Computer Science", country: "India", funding_type: "self" } },
  { email: "student.intl2@pnwu.edu", role: "student", full_name: "Wei Chen",
    profile: { population: "international", program: "MBA", country: "China", funding_type: "sponsored" } },
  { email: "student.domestic@pnwu.edu", role: "student", full_name: "Jordan Miller",
    profile: { population: "domestic", program: "BS Business Administration", country: null, funding_type: null } },
];

async function upsertTemplates(client) {
  for (const t of templates) {
    await client.query(
      `INSERT INTO requirement_templates
        (code, title, description, population, funding_types, owner_office, visa_critical, days_to_complete, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (code) DO UPDATE SET
         title=EXCLUDED.title, description=EXCLUDED.description, population=EXCLUDED.population,
         funding_types=EXCLUDED.funding_types, owner_office=EXCLUDED.owner_office,
         visa_critical=EXCLUDED.visa_critical, days_to_complete=EXCLUDED.days_to_complete,
         sort_order=EXCLUDED.sort_order`,
      [t.code, t.title, t.description, t.population, t.funding_types, t.owner_office,
       t.visa_critical, t.days_to_complete, t.sort_order]
    );
  }
  console.log(`Seeded ${templates.length} requirement templates.`);
}

// { studentEmail: [ { from: "staff"|"student", body, daysAgo, hoursAgo }, ... ] }
// Seeded so Messages doesn't open empty on a fresh install -- this is
// ordinary demo content, not flagged is_simulated (that flag is reserved for
// the live auto-reply feature; see backend/src/simulatedReplies.js).
const demoConversations = {
  "student.intl@pnwu.edu": [
    { from: "staff", body: "Hi Alex, welcome to PNW! I'm Maria, your ISS advisor. Let me know if you have any questions getting your checklist started.", daysAgo: 10 },
    { from: "student", body: "Hi Maria! Thank you. I just submitted my passport copy, does it look okay?", daysAgo: 10, hoursAgo: -1 },
    { from: "staff", body: "Yes, that one's approved. Next up is confirming your I-20 details so we can get it issued.", daysAgo: 9 },
    { from: "student", body: "Quick question -- does the bank statement need to be exactly 3 months old, or can it be more recent than that?", daysAgo: 6 },
    { from: "staff", body: "It just needs to be dated within the last 6 months and show the required funding amount. A current one is fine.", daysAgo: 6, hoursAgo: -2 },
    { from: "student", body: "Got it, thank you! I'll upload it this week.", daysAgo: 3 },
    { from: "staff", body: "Sounds good. Also, don't forget the SEVIS I-901 fee needs to be paid before your visa interview.", daysAgo: 1 },
  ],
  "student.intl2@pnwu.edu": [
    { from: "staff", body: "Hi Wei, welcome! Since you're on a sponsor letter, let me know once that's uploaded and I'll take a look.", daysAgo: 5 },
    { from: "student", body: "Thank you! I'll get that uploaded by this weekend.", daysAgo: 4 },
  ],
  "student.domestic@pnwu.edu": [
    { from: "staff", body: "Hi Jordan, welcome to PNW! Since you're a domestic student your checklist is shorter -- mainly housing and orientation. Let me know if you have questions.", daysAgo: 7 },
    { from: "student", body: "Thanks! Will housing applications open soon?", daysAgo: 6 },
    { from: "staff", body: "Yes, the on-campus housing portal opens next week -- I'll send a reminder.", daysAgo: 6, hoursAgo: -3 },
  ],
};

// Per-student overrides applied on top of the auto-generated checklist, so a
// fresh install shows a realistic mix (some approved, some overdue/due soon,
// some untouched) instead of every item sitting at "not_started" with a
// far-future due date -- a 0%-complete dashboard doesn't make for a good
// demo. Only listed codes are touched; everything else keeps whatever
// generateChecklist() produced. dueInDays may be negative (overdue).
const demoStatusOverrides = {
  "student.intl@pnwu.edu": [
    { code: "PASSPORT_COPY", status: "approved", dueInDays: -3, approvedDaysAgo: 2 },
    { code: "I20_REQUEST", status: "in_progress", dueInDays: -1 },
    { code: "BANK_STATEMENT", status: "in_progress", dueInDays: 3 },
    { code: "TRANSCRIPT_FINAL", status: "not_started", dueInDays: 5 },
    { code: "ENGLISH_PROFICIENCY", status: "approved", dueInDays: 11, approvedDaysAgo: 1 },
    { code: "SEVIS_FEE", status: "returned", dueInDays: 15, returnedDaysAgo: 0,
      reviewerNote: "Please rescan -- the receipt image is cut off at the bottom." },
  ],
  "student.intl2@pnwu.edu": [
    { code: "PASSPORT_COPY", status: "approved", dueInDays: -5, approvedDaysAgo: 4 },
    { code: "SPONSOR_LETTER", status: "in_progress", dueInDays: 2 },
    { code: "I20_REQUEST", status: "not_started", dueInDays: 6 },
  ],
  "student.domestic@pnwu.edu": [
    { code: "FAFSA", status: "approved", dueInDays: -2, approvedDaysAgo: 3 },
    { code: "HOUSING", status: "in_progress", dueInDays: 4 },
    { code: "ORIENTATION", status: "not_started", dueInDays: 1 },
  ],
};

function applyStatusOverrides(items, codeById, overrides) {
  if (!overrides) return items;
  const byCode = Object.fromEntries(overrides.map((o) => [o.code, o]));
  const now = new Date();
  return items.map((item) => {
    const code = codeById[item.template_id];
    const o = byCode[code];
    if (!o) return item;
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + o.dueInDays);
    return {
      ...item,
      status: o.status,
      due_date: dueDate.toISOString().slice(0, 10),
      completed_at: o.approvedDaysAgo != null ? new Date(now.getTime() - o.approvedDaysAgo * 86400000) : null,
      returned_at: o.returnedDaysAgo != null ? new Date(now.getTime() - o.returnedDaysAgo * 86400000) : null,
      reviewer_note: o.reviewerNote || null,
    };
  });
}

async function upsertAssignments(client) {
  const staffRes = await client.query("SELECT id FROM users WHERE email = 'staff@pnwu.edu'");
  if (staffRes.rows.length === 0) return;
  const staffId = staffRes.rows[0].id;

  for (const u of demoUsers) {
    if (!u.profile) continue;
    const studentRes = await client.query(
      "SELECT s.id FROM students s JOIN users usr ON usr.id = s.user_id WHERE usr.email = $1",
      [u.email]
    );
    if (studentRes.rows.length === 0) continue;
    const studentId = studentRes.rows[0].id;

    const existing = await client.query(
      "SELECT 1 FROM assignments WHERE student_id = $1 AND ended_at IS NULL",
      [studentId]
    );
    if (existing.rows.length === 0) {
      await client.query(
        "INSERT INTO assignments (staff_user_id, student_id, is_coverage) VALUES ($1, $2, false)",
        [staffId, studentId]
      );
    }
  }
}

async function upsertDemoMessages(client) {
  for (const [email, script] of Object.entries(demoConversations)) {
    const res = await client.query(
      `SELECT s.id AS student_id, s.user_id AS student_user_id
       FROM students s JOIN users u ON u.id = s.user_id WHERE u.email = $1`,
      [email]
    );
    if (res.rows.length === 0) continue;
    const { student_id, student_user_id } = res.rows[0];

    const existing = await client.query("SELECT 1 FROM messages WHERE student_id = $1 LIMIT 1", [student_id]);
    if (existing.rows.length > 0) continue; // already seeded (or a real conversation has started)

    const staffRes = await client.query(
      `SELECT staff_user_id FROM assignments WHERE student_id = $1 AND ended_at IS NULL`,
      [student_id]
    );
    if (staffRes.rows.length === 0) continue;
    const staffUserId = staffRes.rows[0].staff_user_id;

    for (const m of script) {
      const senderId = m.from === "staff" ? staffUserId : student_user_id;
      const createdAt = new Date(Date.now() - m.daysAgo * 86400000 - (m.hoursAgo || 0) * 3600000);
      await client.query(
        "INSERT INTO messages (student_id, sender_user_id, body, created_at) VALUES ($1, $2, $3, $4)",
        [student_id, senderId, m.body, createdAt]
      );
    }
  }
}

async function upsertUsersAndStudents(client) {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const u of demoUsers) {
    const existing = await client.query("SELECT id, full_name FROM users WHERE email=$1", [u.email]);
    let userId;
    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;
      // Keep the demo persona's display name in sync with seed.js on
      // existing installs too (e.g. renaming a demo student), without
      // touching anything else about the account.
      if (existing.rows[0].full_name !== u.full_name) {
        await client.query("UPDATE users SET full_name=$1 WHERE id=$2", [u.full_name, userId]);
      }
    } else {
      const ins = await client.query(
        `INSERT INTO users (email, password_hash, role, full_name) VALUES ($1,$2,$3,$4) RETURNING id`,
        [u.email, hash, u.role, u.full_name]
      );
      userId = ins.rows[0].id;
    }

    if (u.profile) {
      const existingStudent = await client.query("SELECT id FROM students WHERE user_id=$1", [userId]);
      if (existingStudent.rows.length === 0) {
        const onboardedAt = new Date();
        const insS = await client.query(
          `INSERT INTO students (user_id, population, program, country, funding_type, onboarded_at)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [userId, u.profile.population, u.profile.program, u.profile.country, u.profile.funding_type, onboardedAt]
        );
        const studentId = insS.rows[0].id;

        const tmplRes = await client.query("SELECT * FROM requirement_templates");
        const codeById = Object.fromEntries(tmplRes.rows.map((t) => [t.id, t.code]));
        const items = applyStatusOverrides(
          generateChecklist(u.profile, tmplRes.rows, onboardedAt),
          codeById,
          demoStatusOverrides[u.email]
        );
        for (const item of items) {
          await client.query(
            `INSERT INTO checklist_items (student_id, template_id, due_date, status, completed_at, returned_at, reviewer_note)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [studentId, item.template_id, item.due_date, item.status,
             item.completed_at || null, item.returned_at || null, item.reviewer_note || null]
          );
        }
        console.log(`  Created student ${u.full_name} with ${items.length} checklist items.`);
      }
    }
  }
  console.log(`Seeded ${demoUsers.length} demo users (password for all: ${DEMO_PASSWORD}).`);
}

// Reusable entry point -- safe to call repeatedly (upserts only), and does
// not touch the shared pool's lifecycle, so it can run inside a long-lived
// process (see RUN_SEED_ON_BOOT in server.js) as well as standalone.
async function runSeed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await upsertTemplates(client);
    await upsertUsersAndStudents(client);
    await upsertAssignments(client);
    await upsertDemoMessages(client);
    await client.query("COMMIT");
    console.log("\nSeed complete. Demo logins:");
    demoUsers.forEach((u) => console.log(`  ${u.role.padEnd(9)} ${u.email}  /  ${DEMO_PASSWORD}`));
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  await ensureSchema();
  try {
    await runSeed();
  } catch (err) {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { runSeed };
