/**
 * utils/sanitize.js
 * -----------------
 * PII scrubber for free-text `description` fields. The spec explicitly forbids
 * shaming / doxxing, so we strip obvious identifiers before persisting text:
 *
 *   1. Emails
 *   2. Phone numbers (international and Indian 10-digit formats)
 *   3. Social handles (@username across Twitter/Instagram/Facebook/TikTok)
 *   4. URLs
 *   5. Excess whitespace
 *
 * We intentionally DO NOT attempt to detect/block personal names — that is a
 * rabbit hole that will mutilate legitimate reports ("guy in blue shirt was
 * following me"). Names are low-value for shaming without other PII; handles,
 * phones, and emails are the high-risk patterns.
 */

// Order matters: emails/URLs first so we don't accidentally mangle their @/:
const SANITIZERS = [
  // Emails (RFC-lite — good enough for PII scrubbing). Run BEFORE @handles.
  { re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, repl: '[email]' },

  // URLs / links
  { re: /\bhttps?:\/\/[^\s<>"']+/gi, repl: '[link]' },
  { re: /\bwww\.[^\s<>"']+/gi, repl: '[link]' },

  // Phone numbers — matched in two passes so we don't over-scrub things like
  // 6-digit postal codes or short house numbers. Each pass uses digit-count
  // heuristics to avoid false positives.
  //
  // Pass 1: International / landline / parenthesized forms, e.g.:
  //   +91 98765-43210, +919876543210, +1 (415) 555-1234, (033) 2345-6789
  {
    re: /(?<!\d)(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,5}[\s.-]?\d{3,5}(?!\d)/g,
    repl: (m) => {
      const digits = m.replace(/\D/g, '');
      return digits.length >= 9 && digits.length <= 15 ? '[phone]' : m;
    },
  },
  // Pass 2: Bare 10-digit mobile numbers (common in India / South Asia):
  //   98765 43210, 98765-43210, 9876543210 (no country code / parens).
  {
    re: /(?<!\d)[6-9]\d{4}[\s.-]?\d{5}(?!\d)/g,
    repl: '[phone]',
  },

  // Social media @mentions/handles (runs after emails so we don't eat the
  // tail of an email address — emails are already replaced at this point).
  { re: /@[A-Za-z0-9_.-]{2,30}\b/g, repl: '[handle]' },
];

/**
 * Scrub PII from a free-text description.
 * @param {string|null|undefined} input
 * @returns {string} Sanitized string (empty string if input falsy).
 */
export function sanitizeText(input) {
  if (!input) return '';
  let out = String(input);

  for (const { re, repl } of SANITIZERS) {
    out = out.replace(re, repl);
  }

  // Collapse repeated [phone]/[handle]/[email] tokens from overlapping matches
  out = out.replace(/(?:\[(?:phone|email|handle|link)\]\s*){2,}/g, (m) => m.trim().split(/\s+/)[0] + ' ');

  // Trim and collapse internal whitespace
  out = out.replace(/\s+/g, ' ').trim();

  // Cap length to prevent abuse (1000 chars is plenty for a hazard report)
  if (out.length > 1000) out = out.slice(0, 1000).trimEnd() + '…';

  return out;
}
