/**
 * Intentional vulnerabilities for Subrunner testing.
 * Add to your repo, push, and open a PR.
 */

const { randomBytes } = require('crypto');

// 1. Reflected XSS - escape user input before inserting into HTML
function renderSearchResult(query) {
  const escaped = String(query)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  return "<div>Results for: " + escaped + "</div>";
}

// 2. Prototype pollution - sanitize parsed config by using Object.create(null)
// and stripping dangerous keys before merging
function mergeConfig(userInput) {
  const parsed = JSON.parse(userInput);
  // Guard against prototype pollution keys
  const safe = Object.create(null);
  for (const key of Object.keys(parsed)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    safe[key] = parsed[key];
  }
  return Object.assign({}, safe);
}

// 3. ReDoS - use a fixed, safe regex instead of building one from user input
function validateEmail(email) {
  const regex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.com$/;
  return regex.test(email);
}

// 4. Secure randomness for security-sensitive value
function generateSessionId() {
  return 'sess_' + randomBytes(16).toString('hex');
}

// 5. SSRF - validate URL against an allowlist of permitted hosts before fetching
async function fetchUserData(url) {
  const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || '')
    .split(',')
    .map(h => h.trim())
    .filter(Boolean);

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Disallowed protocol: ' + parsed.protocol);
  }

  if (ALLOWED_HOSTS.length === 0 || !ALLOWED_HOSTS.includes(parsed.hostname)) {
    throw new Error('Host not allowed: ' + parsed.hostname);
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
