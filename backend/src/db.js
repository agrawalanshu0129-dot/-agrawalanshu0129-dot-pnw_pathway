const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const useSSL = (process.env.DATABASE_URL || "").includes("render.com") ||
               (process.env.DATABASE_URL || "").includes("neon.tech") ||
               process.env.PGSSL === "true";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/pnw_pathway",
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

async function ensureSchema() {
  const schema = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
  await pool.query(schema);
}

module.exports = { pool, ensureSchema };
