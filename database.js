// db/database.js
// Sets up a local SQLite database file (medtrack.db) and creates tables
// the first time the app runs. Uses better-sqlite3 (synchronous, simple API).

const path = require("path");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "..", "medtrack.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    age INTEGER,
    disease TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS medicines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    dosage TEXT,
    notes TEXT,
    times TEXT NOT NULL,       -- comma-separated HH:MM values, e.g. "08:00,20:00"
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS dose_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    medicine_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    scheduled_date TEXT NOT NULL,   -- YYYY-MM-DD
    scheduled_time TEXT NOT NULL,   -- HH:MM
    status TEXT NOT NULL,           -- 'taken' | 'skipped'
    logged_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(medicine_id, scheduled_date, scheduled_time)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    notes TEXT,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Safety net: if an older medtrack.db (from before profile fields existed)
// is already sitting in the project folder, add the missing columns instead
// of crashing.
const userColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userColumns.includes("age")) {
  db.exec("ALTER TABLE users ADD COLUMN age INTEGER");
}
if (!userColumns.includes("disease")) {
  db.exec("ALTER TABLE users ADD COLUMN disease TEXT");
}

module.exports = db;
