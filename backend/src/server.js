require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { ensureSchema } = require("./db");

const authRoutes = require("./routes/auth");
const studentRoutes = require("./routes/students");
const dashboardRoutes = require("./routes/dashboard");
const aiRoutes = require("./routes/ai");
const cityRoutes = require("./routes/city");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true, service: "pnw-pathway-api" }));

app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/city", cityRoutes);

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
