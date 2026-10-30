'use strict';

const crypto = require('crypto');
const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { findAdmin, getSetting, setSetting } = require('./db');

const ADMIN_EXPIRY  = '8h';
const CLIENT_EXPIRY = '365d';  // Client tokens last 1 year — no re-login needed

// Seed password from db.js — while an admin still has it, they must change it before doing anything else
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin@PanicAlarm2026';

// JWT signing secret: JWT_SECRET from the environment if it is a real value, otherwise a random
// secret generated on first run and kept in the database (never a hardcoded default).
let secret = null;
function getSecret() {
  if (secret) return secret;
  const env = process.env.JWT_SECRET;
  if (env && env.length >= 32 && !env.startsWith('CHANGE_ME')) {
    secret = env;
    return secret;
  }
  const stored = getSetting.get('jwt_secret');
  if (stored && stored.value && stored.value.length >= 32) {
    secret = stored.value;
    return secret;
  }
  secret = crypto.randomBytes(48).toString('base64url');
  setSetting.run('jwt_secret', secret);
  return secret;
}

function signAdminToken(payload) {
  return jwt.sign({ ...payload, type: 'admin' }, getSecret(), { expiresIn: ADMIN_EXPIRY });
}

function signClientToken(payload) {
  return jwt.sign({ ...payload, type: 'client' }, getSecret(), { expiresIn: CLIENT_EXPIRY });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

// Middleware: protect admin web panel routes
function requireAdmin(req, res, next) {
  // Check Authorization header OR session cookie
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.adminToken;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const decoded = verifyToken(token);
    if (decoded.type !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    // Default password still in use: only the change-password call is allowed
    if (decoded.mustChangePassword && req.originalUrl.split('?')[0] !== '/api/admin/change-password') {
      return res.status(403).json({ error: 'You must change the default admin password first', mustChangePassword: true });
    }
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, please login again' });
  }
}

// Middleware: protect client API routes (called from Electron client)
function requireClient(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = verifyToken(token);
    if (decoded.type !== 'client') return res.status(403).json({ error: 'Client token required' });
    req.clientUser = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token expired — re-register the client' });
  }
}

// Login helper for admin panel. Returns { token, mustChangePassword } or null.
function adminLogin(username, password) {
  const user = findAdmin.get(username);
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password)) return null;
  const mustChangePassword = password === DEFAULT_ADMIN_PASSWORD;
  const token = signAdminToken({ id: user.id, username: user.username, ...(mustChangePassword && { mustChangePassword: true }) });
  return { token, mustChangePassword };
}

module.exports = {
  signAdminToken, signClientToken, verifyToken, requireAdmin, requireClient, adminLogin, DEFAULT_ADMIN_PASSWORD,
};
