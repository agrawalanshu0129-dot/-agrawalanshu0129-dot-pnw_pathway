require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { ensureSchema } = require("./db");

const authRoutes = require("./routes/auth");
const studentRoutes = require("./routes/students");
const dashboardRoutes = require("./routes/dashboard");
const aiRoutes = require("./routes/ai");
const cityRoutes = require("./routes/city");
const assignmentRoutes = require("./routes/assignments");
const adminRoutes = require("./routes/admin");
const newsRoutes = require("./routes/news");

const app = express();
app.use(cors());
// Higher-than-default limit so document uploads (base64-encoded in JSON,
// see routes/students.js) fit; MAX_DOCUMENT_BYTES there is the real cap.
app.use(express.json({ limit: "8mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true, service: "pnw-pathway-api" }));

app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/city", cityRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/news", newsRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;

// Render's free plan has no Shell/One-Off Jobs access, so `npm run seed`
// can't be run manually there. Set RUN_SEED_ON_BOOT=true (one-time, then
// unset it) to seed on startup instead -- the seed itself is upsert-only,
// so it's safe even if it runs more than once.
async function start() {
  await ensureSchema();
  if (process.env.RUN_SEED_ON_BOOT === "true") {
    try {
      await require("./seed/seed").runSeed();
    } catch (err) {
      console.error("RUN_SEED_ON_BOOT failed (server will still start):", err);
    }
  }
  app.listen(PORT, () => console.log(`PNW Pathway API listening on port ${PORT}`));
}

start().catch((err) => {
  console.error("Failed to initialize database schema:", err);
  process.exit(1);
});
