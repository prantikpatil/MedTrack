// routes/reports.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../db/database");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();
router.use(requireAuth);

const uploadDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_EXT = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.session.userId}-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return cb(new Error("Only PDF, JPG, PNG, or WEBP files are allowed."));
    }
    cb(null, true);
  },
});

// GET /api/reports - list this user's reports
router.get("/", (req, res) => {
  const rows = db
    .prepare(
      "SELECT id, original_name, notes, uploaded_at FROM reports WHERE user_id = ? ORDER BY uploaded_at DESC"
    )
    .all(req.session.userId);
  res.json(rows);
});

// POST /api/reports - upload a report file
router.post("/", (req, res) => {
  upload.single("report")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Choose a file to upload." });

    const notes = (req.body.notes || "").trim();
    const result = db
      .prepare(
        "INSERT INTO reports (user_id, original_name, stored_name, notes) VALUES (?, ?, ?, ?)"
      )
      .run(req.session.userId, req.file.originalname, req.file.filename, notes);

    const created = db.prepare("SELECT id, original_name, notes, uploaded_at FROM reports WHERE id = ?").get(
      result.lastInsertRowid
    );
    res.status(201).json(created);
  });
});

// GET /api/reports/:id/file - view/download a specific report (owner only)
router.get("/:id/file", (req, res) => {
  const report = db
    .prepare("SELECT * FROM reports WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.session.userId);
  if (!report) return res.status(404).json({ error: "Report not found." });

  const filePath = path.join(uploadDir, report.stored_name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File is missing on the server." });
  }
  res.sendFile(filePath);
});

// DELETE /api/reports/:id
router.delete("/:id", (req, res) => {
  const report = db
    .prepare("SELECT * FROM reports WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.session.userId);
  if (!report) return res.status(404).json({ error: "Report not found." });

  fs.unlink(path.join(uploadDir, report.stored_name), () => {});
  db.prepare("DELETE FROM reports WHERE id = ?").run(report.id);
  res.json({ ok: true });
});

module.exports = router;
