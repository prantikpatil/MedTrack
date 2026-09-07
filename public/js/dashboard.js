// public/js/dashboard.js

let medicines = [];
let todayLogs = []; // logs for today
let currentUser = null;
let notifiedKeys = new Set(); // "medId|time|date" already alarmed this session
let snoozedUntil = new Map(); // "medId|time|date" -> timestamp ms
let activeAlarm = null; // { medId, time }
let alarmAudioTimer = null;
let audioCtx = null;

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const nowHM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ---------- Boot ----------

async function boot() {
  try {
    const me = await fetch("/api/auth/me");
  if (!me.ok) {
    window.location.href = "index.html";
    return;
  }
  currentUser = await me.json();
  renderUserChrome();
  initTheme();

  document.getElementById("today-date").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }

  await loadAll();
  setInterval(loadTodayLogs, 30000);
  setInterval(checkDueReminders, 15000);
    setInterval(renderHero, 20000);
  } catch (err) {
    console.error(err);
    document.body.innerHTML = `
      <div style="padding:40px;font-family:Arial,sans-serif">
        <h2>MedTrack could not load</h2>
        <p>Make sure the Node.js server is running and open <b>http://localhost:3000</b>.</p>
        <p>Then refresh this page.</p>
      </div>`;
  }
}

function renderUserChrome() {
  document.getElementById("user-name").textContent = currentUser.name;
  const topbarName = document.getElementById("topbar-name");
  if (topbarName) topbarName.textContent = (currentUser.name || "there").split(" ")[0];
  document.getElementById("user-disease").textContent = currentUser.disease || "";
  document.getElementById("avatar-initial").textContent = (currentUser.name || "?").trim().charAt(0).toUpperCase();

  document.getElementById("profile-name").value = currentUser.name || "";
  document.getElementById("profile-age").value = currentUser.age || "";
  document.getElementById("profile-disease").value = currentUser.disease || "";
  document.getElementById("profile-email").value = currentUser.email || "";
  const profileName = document.getElementById("profile-card-name");
  const profileCondition = document.getElementById("profile-card-condition");
  const profileAvatar = document.getElementById("profile-avatar");
  if (profileName) profileName.textContent = currentUser.name || "Your name";
  if (profileCondition) profileCondition.textContent = currentUser.disease || "No condition added";
  if (profileAvatar) profileAvatar.textContent = (currentUser.name || "?").trim().charAt(0).toUpperCase();
}

async function loadAll() {
  await Promise.all([loadMedicines(), loadTodayLogs(), loadHistory(), loadReports()]);
  renderMedList();
  renderHero();
  renderStats();
}

function renderStats(reportCount = null) {
  const activeMeds = medicines.filter((m) => m.active);
  const total = activeMeds.reduce((sum, m) => sum + m.times.length, 0);
  const taken = todayLogs.filter((l) => l.status === "taken").length;
  const upcoming = activeMeds.flatMap((m) => m.times.map((time) => ({ m, time })))
    .filter((x) => x.time >= nowHM() && !logFor(x.m.id, x.time))
    .sort((a, b) => a.time.localeCompare(b.time))[0];
  const percent = total ? Math.round((taken / total) * 100) : 0;
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  set("medicine-stat", activeMeds.length);
  set("taken-stat", taken);
  set("next-stat", upcoming ? upcoming.time : "—");
  set("next-stat-sub", upcoming ? upcoming.m.name : "No upcoming dose");
  if (reportCount !== null) {
    set("report-stat", reportCount);
    set("report-count-label", `${reportCount} ${reportCount === 1 ? "record" : "records"}`);
  }
  set("adherence-score", `${percent}%`);
  set("adherence-text", total ? `${taken} of ${total} scheduled doses completed today.` : "Add a medicine schedule to start tracking.");
  const fill = document.getElementById("adherence-bar-fill");
  if (fill) fill.style.width = `${percent}%`;
  set("progress-percent", `${percent}%`);
  const ring = document.getElementById("progress-ring");
  if (ring) ring.style.strokeDashoffset = String(264 - (264 * percent / 100));
}

function initTheme() {
  const saved = localStorage.getItem("medtrack-theme");
  if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.textContent = document.documentElement.getAttribute("data-theme") === "dark" ? "☀" : "◐";
    btn.addEventListener("click", () => {
      const dark = document.documentElement.getAttribute("data-theme") !== "dark";
      if (dark) document.documentElement.setAttribute("data-theme", "dark");
      else document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("medtrack-theme", dark ? "dark" : "light");
      btn.textContent = dark ? "☀" : "◐";
    });
  }
}

// ---------- Navigation between sections ----------

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".page-section").forEach((s) => s.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`section-${btn.dataset.section}`).classList.add("active");
    document.querySelector(".sidebar")?.classList.remove("open");
    document.getElementById("mobile-overlay")?.classList.remove("show");
  });
});

// ---------- Medicines ----------

async function loadMedicines() {
  const res = await fetch("/api/medicines");
  medicines = res.ok ? await res.json() : [];
}

async function loadTodayLogs() {
  const res = await fetch(`/api/medicines/logs/day?date=${todayStr()}`);
  todayLogs = res.ok ? await res.json() : [];
  renderMedList();
  renderHero();
  renderStats();
}

async function loadHistory() {
  const res = await fetch("/api/medicines/logs/history");
  const rows = res.ok ? await res.json() : [];
  const list = document.getElementById("history-list");
  if (!rows.length) {
    list.innerHTML = '<div class="empty-state">No history yet — log a dose to see it here.</div>';
    return;
  }
  list.innerHTML = rows
    .slice(0, 20)
    .map(
      (r) => `
      <div class="history-row">
        <span>${escapeHtml(r.medicine_name)} — ${r.scheduled_time} on ${r.scheduled_date}</span>
        <span class="h-status ${r.status}">${r.status === "taken" ? "Taken" : "Skipped"}</span>
      </div>`
    )
    .join("");
}

function logFor(medId, time) {
  return todayLogs.find((l) => l.medicine_id === medId && l.scheduled_time === time);
}

function renderMedList() {
  const container = document.getElementById("med-list");
  if (!medicines.length) {
    container.innerHTML = '<div class="empty-state">No medicines yet. Add your first one to start getting reminders.</div>';
    return;
  }

  const now = nowHM();

  container.innerHTML = medicines
    .map((m) => {
      const chips = m.times
        .slice()
        .sort()
        .map((t) => {
          const log = logFor(m.id, t);
          let cls = "time-chip";
          if (log && log.status === "taken") cls += " taken";
          else if (log && log.status === "skipped") cls += " due";
          else if (t <= now) cls += " due";
          return `<button type="button" class="${cls}" data-med="${m.id}" data-time="${t}" title="Click to log this dose">${t}</button>`;
        })
        .join("");

      return `
        <div class="med-row" data-med-id="${m.id}">
          <div class="med-main">
            <div class="med-name">${escapeHtml(m.name)}</div>
            ${m.dosage ? `<div class="med-dosage">${escapeHtml(m.dosage)}</div>` : ""}
            <div class="time-chips">${chips}</div>
          </div>
          <div class="med-actions">
            <button class="icon-btn edit-btn" data-med="${m.id}" title="Edit">&#9998;</button>
            <button class="icon-btn delete-btn" data-med="${m.id}" title="Delete">&times;</button>
          </div>
        </div>`;
    })
    .join("");

  container.querySelectorAll(".time-chip").forEach((chip) => chip.addEventListener("click", onChipClick));
  container.querySelectorAll(".edit-btn").forEach((btn) => btn.addEventListener("click", () => openEditModal(Number(btn.dataset.med))));
  container.querySelectorAll(".delete-btn").forEach((btn) => btn.addEventListener("click", () => deleteMedicine(Number(btn.dataset.med))));
}

function renderHero() {
  const now = nowHM();
  const slots = [];
  medicines.filter((m) => m.active).forEach((m) => {
    m.times.forEach((t) => {
      const log = logFor(m.id, t);
      slots.push({ med: m, time: t, taken: !!log });
    });
  });

  const totalToday = slots.length;
  const takenCount = slots.filter((s) => s.taken).length;
  document.getElementById("taken-count").textContent = `${takenCount}/${totalToday}`;

  const upcoming = slots.filter((s) => !s.taken && s.time >= now).sort((a, b) => a.time.localeCompare(b.time))[0];
  const overdue = slots.filter((s) => !s.taken && s.time < now).sort((a, b) => a.time.localeCompare(b.time));

  const title = document.getElementById("next-dose-title");
  const sub = document.getElementById("next-dose-sub");

  if (!totalToday) {
    title.textContent = "No reminders set for today";
    sub.textContent = "Add a medicine to start building your schedule.";
  } else if (overdue.length) {
    title.textContent = `${overdue[0].med.name} was due at ${overdue[0].time}`;
    sub.textContent = overdue.length > 1 ? `${overdue.length} doses are waiting to be logged.` : "Tap its time chip once it's taken.";
  } else if (upcoming) {
    title.textContent = `Next up: ${upcoming.med.name} at ${upcoming.time}`;
    sub.textContent = "You're all caught up until then.";
  } else {
    title.textContent = "All doses logged for today";
    sub.textContent = "Nicely done — see you tomorrow.";
  }
}

// ---------- Alarm system ----------
// Checks every 15s for a dose whose time has arrived. When one is found (and
// not snoozed/logged/already alarmed), it opens a full-screen alarm with a
// looping tone using the Web Audio API — no external sound file needed.

function checkDueReminders() {
  if (activeAlarm) return; // one alarm at a time
  const now = nowHM();
  const date = todayStr();

  for (const m of medicines.filter((m) => m.active)) {
    for (const t of m.times) {
      const key = `${m.id}|${t}|${date}`;
      const log = logFor(m.id, t);
      const snoozeTime = snoozedUntil.get(key);
      const isSnoozed = snoozeTime && Date.now() < snoozeTime;

      if (t <= now && !log && !isSnoozed && !notifiedKeys.has(key)) {
        notifiedKeys.add(key);
        openAlarm(m, t);
        return;
      }
    }
  }
}

function beep() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch (e) {
    // Web Audio might be blocked until the user interacts with the page once — that's fine, the visual alarm still shows.
  }
}

function startAlarmSound() {
  beep();
  alarmAudioTimer = setInterval(beep, 900);
}

function stopAlarmSound() {
  if (alarmAudioTimer) clearInterval(alarmAudioTimer);
  alarmAudioTimer = null;
}

function openAlarm(medicine, time) {
  activeAlarm = { medId: medicine.id, time, medName: medicine.name };
  document.getElementById("alarm-title").textContent = medicine.name;
  document.getElementById("alarm-sub").textContent = `${medicine.dosage ? medicine.dosage + " — " : ""}scheduled for ${time}`;
  document.getElementById("alarm-modal").classList.remove("hidden");
  startAlarmSound();

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Time for your medicine", { body: `${medicine.name} is due now (${time}).` });
  }
}

function closeAlarm() {
  document.getElementById("alarm-modal").classList.add("hidden");
  stopAlarmSound();
  activeAlarm = null;
}

async function handleAlarmTaken() {
  if (!activeAlarm) return;
  const { medId, time } = activeAlarm;
  await logDose(medId, time, "taken");
  toast("Marked as taken");
  closeAlarm();
}

function handleAlarmSnooze() {
  if (!activeAlarm) return;
  const { medId, time } = activeAlarm;
  const key = `${medId}|${time}|${todayStr()}`;
  snoozedUntil.set(key, Date.now() + 5 * 60 * 1000);
  notifiedKeys.delete(key); // allow it to alarm again once the snooze passes
  toast("Snoozed for 5 minutes");
  closeAlarm();
}

function handleAlarmDismiss() {
  closeAlarm();
}

// ---------- Logging a dose ----------

async function logDose(medId, time, status) {
  const res = await fetch(`/api/medicines/${medId}/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: todayStr(), time, status }),
  });
  if (res.ok) {
    await loadTodayLogs();
    await loadHistory();
  }
  return res.ok;
}

async function onChipClick(e) {
  const medId = Number(e.currentTarget.dataset.med);
  const time = e.currentTarget.dataset.time;
  const log = logFor(medId, time);
  const nextStatus = log && log.status === "taken" ? "skipped" : "taken";
  const ok = await logDose(medId, time, nextStatus);
  if (ok) toast(nextStatus === "taken" ? "Marked as taken" : "Marked as skipped");
}

// ---------- Add / edit medicine modal ----------

let editingTimes = [];
let editingId = null;

function openAddModal() {
  editingId = null;
  editingTimes = [];
  document.getElementById("modal-title").textContent = "Add a medicine";
  document.getElementById("med-id").value = "";
  document.getElementById("med-name").value = "";
  document.getElementById("med-dosage").value = "";
  document.getElementById("med-notes").value = "";
  document.getElementById("med-message").textContent = "";
  renderTimesEditor();
  document.getElementById("med-modal").classList.remove("hidden");
}

function openEditModal(medId) {
  const m = medicines.find((x) => x.id === medId);
  if (!m) return;
  editingId = medId;
  editingTimes = m.times.slice();
  document.getElementById("modal-title").textContent = "Edit medicine";
  document.getElementById("med-id").value = m.id;
  document.getElementById("med-name").value = m.name;
  document.getElementById("med-dosage").value = m.dosage || "";
  document.getElementById("med-notes").value = m.notes || "";
  document.getElementById("med-message").textContent = "";
  renderTimesEditor();
  document.getElementById("med-modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("med-modal").classList.add("hidden");
}

function renderTimesEditor() {
  const editor = document.getElementById("times-editor");
  if (!editingTimes.length) {
    editor.innerHTML = '<span style="color: var(--ink-soft); font-size: 13px;">No times added yet.</span>';
  } else {
    editor.innerHTML = editingTimes
      .slice()
      .sort()
      .map((t) => `<span class="time-tag">${t} <button type="button" data-time="${t}">&times;</button></span>`)
      .join("");
    editor.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingTimes = editingTimes.filter((t) => t !== btn.dataset.time);
        renderTimesEditor();
      });
    });
  }
}

async function deleteMedicine(medId) {
  if (!confirm("Delete this medicine and its reminder times?")) return;
  const res = await fetch(`/api/medicines/${medId}`, { method: "DELETE" });
  if (res.ok) {
    toast("Medicine deleted");
    await loadAll();
  }
}

// ---------- Reports ----------

async function loadReports() {
  const res = await fetch("/api/reports");
  const rows = res.ok ? await res.json() : [];
  const list = document.getElementById("report-list");
  if (!rows.length) {
    list.innerHTML = '<div class="empty-state">No reports uploaded yet.</div>';
    renderStats(0);
    return;
  }
  list.innerHTML = rows
    .map(
      (r) => `
      <div class="report-row" data-report-id="${r.id}">
        <div class="report-main">
          <div class="report-name"><a href="/api/reports/${r.id}/file" target="_blank" rel="noopener">${escapeHtml(r.original_name)}</a></div>
          <div class="report-meta">${r.notes ? escapeHtml(r.notes) + " · " : ""}uploaded ${new Date(r.uploaded_at).toLocaleDateString()}</div>
        </div>
        <button class="icon-btn delete-report-btn" data-id="${r.id}" title="Delete">&times;</button>
      </div>`
    )
    .join("");

  renderStats(rows.length);
  list.querySelectorAll(".delete-report-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteReport(Number(btn.dataset.id)));
  });
}

async function deleteReport(id) {
  if (!confirm("Delete this report?")) return;
  const res = await fetch(`/api/reports/${id}`, { method: "DELETE" });
  if (res.ok) {
    toast("Report deleted");
    await loadReports();
  }
}

// ---------- Wire up events ----------

document.addEventListener("DOMContentLoaded", () => {
  boot();

  document.getElementById("open-add-modal").addEventListener("click", openAddModal);
  const add2 = document.getElementById("open-add-modal-2");
  if (add2) add2.addEventListener("click", openAddModal);
  const modalX = document.getElementById("modal-x");
  if (modalX) modalX.addEventListener("click", closeModal);
  const menuBtn = document.getElementById("menu-btn");
  const mobileClose = document.getElementById("mobile-close");
  const overlay = document.getElementById("mobile-overlay");
  const sidebar = document.querySelector(".sidebar");
  const closeMenu = () => { sidebar?.classList.remove("open"); overlay?.classList.remove("show"); };
  menuBtn?.addEventListener("click", () => { sidebar?.classList.add("open"); overlay?.classList.add("show"); });
  mobileClose?.addEventListener("click", closeMenu);
  overlay?.addEventListener("click", closeMenu);
  document.getElementById("cancel-modal").addEventListener("click", closeModal);

  document.getElementById("add-time-btn").addEventListener("click", () => {
    const input = document.getElementById("new-time-input");
    if (!input.value) return;
    if (!editingTimes.includes(input.value)) {
      editingTimes.push(input.value);
      renderTimesEditor();
    }
    input.value = "";
  });

  document.getElementById("med-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("med-message");
    const name = document.getElementById("med-name").value.trim();
    const dosage = document.getElementById("med-dosage").value.trim();
    const notes = document.getElementById("med-notes").value.trim();

    if (!name) {
      msg.textContent = "Medicine name is required.";
      return;
    }
    if (!editingTimes.length) {
      msg.textContent = "Add at least one reminder time.";
      return;
    }

    const payload = { name, dosage, notes, times: editingTimes };
    const url = editingId ? `/api/medicines/${editingId}` : "/api/medicines";
    const method = editingId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      msg.textContent = data.error || "Something went wrong.";
      return;
    }
    closeModal();
    toast(editingId ? "Medicine updated" : "Medicine added");
    await loadAll();
  });

  // Reports
  document.getElementById("report-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById("report-file");
    const notes = document.getElementById("report-notes").value.trim();
    const msg = document.getElementById("report-message");
    msg.textContent = "";

    if (!fileInput.files.length) {
      msg.textContent = "Choose a file first.";
      return;
    }

    const formData = new FormData();
    formData.append("report", fileInput.files[0]);
    formData.append("notes", notes);

    const res = await fetch("/api/reports", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) {
      msg.textContent = data.error || "Upload failed.";
      return;
    }
    fileInput.value = "";
    document.getElementById("report-notes").value = "";
    toast("Report uploaded");
    await loadReports();
  });

  // Profile
  document.getElementById("profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("profile-message");
    const name = document.getElementById("profile-name").value.trim();
    const age = document.getElementById("profile-age").value;
    const disease = document.getElementById("profile-disease").value.trim();
    msg.textContent = "";

    const res = await fetch("/api/auth/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, age, disease }),
    });
    const data = await res.json();
    if (!res.ok) {
      msg.textContent = data.error || "Couldn't save changes.";
      return;
    }
    currentUser = data;
    renderUserChrome();
    msg.style.color = "#3C6B32";
    msg.textContent = "Profile updated.";
    setTimeout(() => {
      msg.textContent = "";
      msg.style.color = "";
    }, 2500);
  });

  // Alarm modal buttons
  document.getElementById("alarm-taken-btn").addEventListener("click", handleAlarmTaken);
  document.getElementById("alarm-snooze-btn").addEventListener("click", handleAlarmSnooze);
  document.getElementById("alarm-dismiss-btn").addEventListener("click", handleAlarmDismiss);

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "index.html";
  });
});
