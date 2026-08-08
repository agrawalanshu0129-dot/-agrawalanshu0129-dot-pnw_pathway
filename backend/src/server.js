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

app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;

ensureSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`PNW Pathway API listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to initialize database schema:", err);
    process.exit(1);
  });
