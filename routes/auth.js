// routes/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db/database");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    age: user.age,
    disease: user.disease,
  };
}

// POST /api/auth/register
router.post("/register", (req, res) => {
  const { name, email, password, age, disease } = req.body;

  if (!name || !email || !password || age === undefined || age === "" || !disease) {
    return res
      .status(400)
      .json({ error: "Name, email, password, age, and condition are all required." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }
  const ageNum = Number(age);
  if (!Number.isInteger(ageNum) || ageNum <= 0 || ageNum > 130) {
    return res.status(400).json({ error: "Enter a valid age." });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  const result = db
    .prepare(
      "INSERT INTO users (name, email, password_hash, age, disease) VALUES (?, ?, ?, ?, ?)"
    )
    .run(name.trim(), email.toLowerCase().trim(), passwordHash, ageNum, disease.trim());

  req.session.userId = result.lastInsertRowid;
  req.session.userName = name.trim();

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(publicUser(user));
});

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }

  req.session.userId = user.id;
  req.session.userName = user.name;

  res.json(publicUser(user));
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId);
  if (!user) return res.status(401).json({ error: "Not signed in." });
  res.json(publicUser(user));
});

// PUT /api/auth/me - update profile info (name, age, disease)
router.put("/me", requireAuth, (req, res) => {
  const current = db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId);
  if (!current) return res.status(401).json({ error: "Not signed in." });

  const { name, age, disease } = req.body;
  let ageNum = current.age;
  if (age !== undefined) {
    ageNum = Number(age);
    if (!Number.isInteger(ageNum) || ageNum <= 0 || ageNum > 130) {
      return res.status(400).json({ error: "Enter a valid age." });
    }
  }

  db.prepare("UPDATE users SET name = ?, age = ?, disease = ? WHERE id = ?").run(
    name !== undefined && name.trim() ? name.trim() : current.name,
    ageNum,
    disease !== undefined ? disease.trim() : current.disease,
    current.id
  );

  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(current.id);
  req.session.userName = updated.name;
  res.json(publicUser(updated));
});

module.exports = router;
