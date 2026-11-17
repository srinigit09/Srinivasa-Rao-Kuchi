'use strict';
/**
 * SMTP mail sending. Configuration comes ONLY from environment properties (server.env), never from code:
 *
 *   SMTP_HOST   mail server host name              (required)
 *   SMTP_PORT   587 (STARTTLS, default) or 465 (TLS from the start)
 *   SMTP_SECURE true = TLS from the start (implied for port 465)
 *   SMTP_USER   login user name                    (optional: leave empty for a relay that needs no login)
 *   SMTP_PASS   login password                     (keep it out of version control)
 *   SMTP_FROM   sender address, e.g. "Panic Alarm <alerts@hospital.org>"  (defaults to SMTP_USER)
 *
 * TLS 1.2 or higher is always required and the server certificate is always verified.
 */
const nodemailer = require('nodemailer');

const MAX_RECIPIENTS = 5;

function readConfig() {
  const host   = (process.env.SMTP_HOST || '').trim();
  const port   = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = /^(1|true|yes)$/i.test((process.env.SMTP_SECURE || '').trim()) || port === 465;
  const user   = (process.env.SMTP_USER || '').trim();
  const pass   = process.env.SMTP_PASS || '';
  const from   = (process.env.SMTP_FROM || user).trim();
  return { host, port, secure, user, pass, from };
}

function isConfigured() {
  const c = readConfig();
  return !!(c.host && c.from && Number.isInteger(c.port) && c.port > 0 && c.port < 65536 && !/[\r\n]/.test(c.from));
}

// Safe-to-show configuration (never the password)
function publicStatus() {
  const c = readConfig();
  return { configured: isConfigured(), host: c.host, port: c.port, secure: c.secure, from: c.from, auth: !!c.user };
}

const EMAIL_RE = /^[^\s@<>",;:\\]+@[^\s@<>",;:\\]+\.[^\s@<>",;:\\]+$/;
function isValidEmail(s) { return typeof s === 'string' && s.length <= 254 && EMAIL_RE.test(s); }

/** "a@x.com, b@y.com" -> ['a@x.com','b@y.com'] (valid, unique, at most MAX_RECIPIENTS). */
function parseRecipients(text) {
  const out = [];
  for (const part of String(text || '').split(/[,;\s]+/)) {
    const e = part.trim();
    if (e && isValidEmail(e) && !out.includes(e.toLowerCase())) out.push(e.toLowerCase());
    if (out.length >= MAX_RECIPIENTS) break;
  }
  return out;
}

async function sendMail({ to, subject, text, html, attachments }) {
  if (!isConfigured()) {
    const e = new Error('SMTP is not configured');
    e.code = 'SMTP_NOT_CONFIGURED';
    throw e;
  }
  const c = readConfig();
  const transporter = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    requireTLS: !c.secure,                                  // STARTTLS is mandatory on non-TLS ports
    auth: c.user ? { user: c.user, pass: c.pass } : undefined,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
  });
  try {
    return await transporter.sendMail({
      from: c.from, to, subject: String(subject || '').replace(/[\r\n]+/g, ' ').slice(0, 200), text, html, attachments,
    });
  } finally {
    transporter.close();
  }
}

module.exports = { isConfigured, publicStatus, isValidEmail, parseRecipients, sendMail, MAX_RECIPIENTS };
