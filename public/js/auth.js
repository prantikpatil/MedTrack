// public/js/auth.js
const tabs = document.querySelectorAll(".auth-tab");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const isLogin = tab.dataset.tab === "login";
    loginForm.style.display = isLogin ? "block" : "none";
    registerForm.style.display = isLogin ? "none" : "block";
  });
});

// If already signed in, skip straight to the dashboard.
fetch("/api/auth/me")
  .then((r) => (r.ok ? (window.location.href = "dashboard.html") : null))
  .catch(() => {});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const msg = document.getElementById("login-message");
  msg.textContent = "";

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      msg.textContent = data.error || "Something went wrong.";
      return;
    }
    window.location.href = "dashboard.html";
  } catch (err) {
    msg.textContent = "Couldn't reach the server. Is it running?";
  }
});

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("reg-name").value.trim();
  const age = document.getElementById("reg-age").value;
  const disease = document.getElementById("reg-disease").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  const msg = document.getElementById("register-message");
  msg.textContent = "";

  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, age, disease, email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      msg.textContent = data.error || "Something went wrong.";
      return;
    }
    window.location.href = "dashboard.html";
  } catch (err) {
    msg.textContent = "Couldn't reach the server. Is it running?";
  }
});
