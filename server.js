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
    secret:
      process.env.SESSION_SECRET ||
      "medtrack-dev-secret-change-me",

    resave: false,
    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "MedTrack server is running.",
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/medicines", medicineRoutes);
app.use("/api/reports", reportRoutes);

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

// Handle unknown routes
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      error: "API route not found.",
    });
  }

  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);

  res.status(500).json({
    error: "Internal server error.",
  });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log("======================================");
  console.log(" MedTrack is running");
  console.log(` Port: ${PORT}`);
  console.log("======================================");
});
