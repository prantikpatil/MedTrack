const path = require("path");
const express = require("express");
const session = require("express-session");

const authRoutes = require("./routes/auth");
const medicineRoutes = require("./routes/medicines");
const reportRoutes = require("./routes/reports");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "1mb" }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "medtrack-dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "MedTrack server is running." });
});

app.use("/api/auth", authRoutes);
app.use("/api/medicines", medicineRoutes);
app.use("/api/reports", reportRoutes);

app.use(express.static(path.join(__dirname, "public")));

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API route not found." });
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, () => {
  console.log("");
  console.log("======================================");
  console.log(" MedTrack is running");
  console.log(` http://localhost:${PORT}`);
  console.log("======================================");
  console.log("");
});
