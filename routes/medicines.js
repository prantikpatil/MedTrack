// routes/medicines.js
const express = require("express");
const db = require("../db/database");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();
router.use(requireAuth);

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseTimes(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function validateTimes(times) {
  return times.length > 0 && times.every((t) => TIME_RE.test(t));
}

// GET /api/medicines - list all medicines for the logged-in user
router.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM medicines WHERE user_id = ? ORDER BY created_at DESC")
    .all(req.session.userId);

  const medicines = rows.map((m) => ({ ...m, times: parseTimes(m.times) }));
  res.json(medicines);
});

// POST /api/medicines - create a medicine
router.post("/", (req, res) => {
  const { name, dosage, notes, times } = req.body;
  const timeList = Array.isArray(times) ? times : parseTimes(times);

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Medicine name is required." });
  }
  if (!validateTimes(timeList)) {
    return res.status(400).json({ error: "Add at least one valid reminder time (HH:MM)." });
  }

  const result = db
    .prepare(
      "INSERT INTO medicines (user_id, name, dosage, notes, times) VALUES (?, ?, ?, ?, ?)"
    )
    .run(req.session.userId, name.trim(), dosage || "", notes || "", timeList.join(","));

  const created = db.prepare("SELECT * FROM medicines WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json({ ...created, times: parseTimes(created.times) });
});

// PUT /api/medicines/:id - update a medicine
router.put("/:id", (req, res) => {
  const med = db
    .prepare("SELECT * FROM medicines WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.session.userId);
  if (!med) return res.status(404).json({ error: "Medicine not found." });

  const { name, dosage, notes, times, active } = req.body;
  const timeList = times !== undefined ? (Array.isArray(times) ? times : parseTimes(times)) : parseTimes(med.times);

  if (times !== undefined && !validateTimes(timeList)) {
    return res.status(400).json({ error: "Add at least one valid reminder time (HH:MM)." });
  }

  db.prepare(
    `UPDATE medicines SET name = ?, dosage = ?, notes = ?, times = ?, active = ? WHERE id = ?`
  ).run(
    name !== undefined ? name.trim() : med.name,
    dosage !== undefined ? dosage : med.dosage,
    notes !== undefined ? notes : med.notes,
    timeList.join(","),
    active !== undefined ? (active ? 1 : 0) : med.active,
    med.id
  );

  const updated = db.prepare("SELECT * FROM medicines WHERE id = ?").get(med.id);
  res.json({ ...updated, times: parseTimes(updated.times) });
});

// DELETE /api/medicines/:id
router.delete("/:id", (req, res) => {
  const med = db
    .prepare("SELECT * FROM medicines WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.session.userId);
  if (!med) return res.status(404).json({ error: "Medicine not found." });

  db.prepare("DELETE FROM medicines WHERE id = ?").run(med.id);
  res.json({ ok: true });
});

// POST /api/medicines/:id/log - mark a scheduled dose taken or skipped
// body: { date: 'YYYY-MM-DD', time: 'HH:MM', status: 'taken' | 'skipped' }
router.post("/:id/log", (req, res) => {
  const med = db
    .prepare("SELECT * FROM medicines WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.session.userId);
  if (!med) return res.status(404).json({ error: "Medicine not found." });

  const { date, time, status } = req.body;
  if (!date || !time || !["taken", "skipped"].includes(status)) {
    return res.status(400).json({ error: "date, time, and a valid status are required." });
  }

  db.prepare(
    `INSERT INTO dose_logs (medicine_id, user_id, scheduled_date, scheduled_time, status)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(medicine_id, scheduled_date, scheduled_time)
     DO UPDATE SET status = excluded.status, logged_at = datetime('now')`
  ).run(med.id, req.session.userId, date, time, status);

  res.json({ ok: true });
});

// GET /api/medicines/logs?date=YYYY-MM-DD - logs for a given day (defaults to today)
router.get("/logs/day", (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const rows = db
    .prepare("SELECT * FROM dose_logs WHERE user_id = ? AND scheduled_date = ?")
    .all(req.session.userId, date);
  res.json(rows);
});

// GET /api/medicines/logs/history - last 14 days of logs, most recent first
router.get("/logs/history", (req, res) => {
  const rows = db
    .prepare(
      `SELECT dl.*, m.name AS medicine_name FROM dose_logs dl
       JOIN medicines m ON m.id = dl.medicine_id
       WHERE dl.user_id = ?
       ORDER BY dl.scheduled_date DESC, dl.scheduled_time DESC
       LIMIT 100`
    )
    .all(req.session.userId);
  res.json(rows);
});

module.exports = router;
