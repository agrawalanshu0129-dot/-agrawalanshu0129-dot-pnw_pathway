require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool, ensureSchema } = require("../db");
const templates = require("./requirementTemplates");
const { generateChecklist } = require("../rulesEngine");

const DEMO_PASSWORD = "Demo1234!";

const demoUsers = [
  { email: "admin@pnwu.edu", role: "admin", full_name: "Dana CIO-Delegate" },
  { email: "staff@pnwu.edu", role: "staff", full_name: "Maria Delgado (ISS)" },
  { email: "student.intl@pnwu.edu", role: "student", full_name: "Priya Sharma",
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

async function upsertUsersAndStudents(client) {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const u of demoUsers) {
    const existing = await client.query("SELECT id FROM users WHERE email=$1", [u.email]);
    let userId;
    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;
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
        const items = generateChecklist(u.profile, tmplRes.rows, onboardedAt);
        for (const item of items) {
          await client.query(
            `INSERT INTO checklist_items (student_id, template_id, due_date, status) VALUES ($1,$2,$3,$4)`,
            [studentId, item.template_id, item.due_date, item.status]
          );
        }
        console.log(`  Created student ${u.full_name} with ${items.length} checklist items.`);
      }
    }
  }
  console.log(`Seeded ${demoUsers.length} demo users (password for all: ${DEMO_PASSWORD}).`);
}

async function main() {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await upsertTemplates(client);
    await upsertUsersAndStudents(client);
    await client.query("COMMIT");
    console.log("\nSeed complete. Demo logins:");
    demoUsers.forEach((u) => console.log(`  ${u.role.padEnd(9)} ${u.email}  /  ${DEMO_PASSWORD}`));
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
