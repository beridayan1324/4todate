/**
 * Intentional vulnerabilities for Subrunner testing.
 * Add to your repo, push, and open a PR.
 */

// 1. Reflected XSS - user input in HTML without escaping
function renderSearchResult(query) {
  return "<div>Results for: " + query + "</div>";
}

// 2. Prototype pollution fix: validate parsed JSON does not contain __proto__, constructor, or prototype keys
function mergeConfig(userInput) {
  let config;
  try {
    config = JSON.parse(userInput);
  } catch (e) {
    throw new Error("Invalid JSON input");
  }
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Config must be a plain object");
  }
  const sanitized = {};
  for (const key of Object.keys(config)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
    sanitized[key] = config[key];
  }
  return Object.assign({}, sanitized);
}

// 3. ReDoS fix: validate email against a static regex instead of building one from user input
function validateEmail(email) {
  if (typeof email !== "string") return false;
  const regex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.com$/;
  return regex.test(email);
}

// 4. Insecure randomness for security-sensitive value
function generateSessionId() {
  return "sess_" + Math.random().toString(36).slice(2);
}

// 5. SSRF fix: restrict fetch to allowed hosts only
const ALLOWED_HOSTS = (process.env.ALLOWED_FETCH_HOSTS || "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

async function fetchUserData(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    throw new Error("Invalid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS protocols are allowed");
  }
  if (ALLOWED_HOSTS.length > 0 && !ALLOWED_HOSTS.includes(parsed.hostname)) {
    throw new Error("Host not allowed: " + parsed.hostname);
  }
  const res = await fetch(url);
  return res.json();
}

module.exports = {
  renderSearchResult,
  mergeConfig,
  validateEmail,
  generateSessionId,
  fetchUserData,
};
