/**
 * Intentional vulnerabilities for Subrunner testing.
 * Add to your repo, push, and open a PR.
 */

// 1. Reflected XSS - user input in HTML without escaping
function renderSearchResult(query) {
  return "<div>Results for: " + query + "</div>";
}

// 2. Prototype pollution via JSON.parse of untrusted input
function mergeConfig(userInput) {
  const config = JSON.parse(userInput);
  return Object.assign({}, config);
}

// 3. ReDoS - regex built from user input
function validateEmail(email) {
  const regex = new RegExp("^[a-zA-Z0-9._%+-]+@" + email + "\\.com$");
  return regex.test(email);
}

// 4. Insecure randomness for security-sensitive value
function generateSessionId() {
  return "sess_" + Math.random().toString(36).slice(2);
}

// 5. SSRF - fetch URL from user input without validation
async function fetchUserData(url) {
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