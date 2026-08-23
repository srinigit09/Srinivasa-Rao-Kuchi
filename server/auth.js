'use strict';

const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { findAdmin } = require('./db');

const SECRET = process.env.JWT_SECRET || 'CHANGE_ME_USE_A_LONG_RANDOM_STRING';
const ADMIN_EXPIRY  = '8h';
const CLIENT_EXPIRY = '365d';  // Client tokens last 1 year — no re-login needed

function signAdminToken(payload) {
  return jwt.sign({ ...payload, type: 'admin' }, SECRET, { expiresIn: ADMIN_EXPIRY });
}

function signClientToken(payload) {
  return jwt.sign({ ...payload, type: 'client' }, SECRET, { expiresIn: CLIENT_EXPIRY });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
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

// Login helper for admin panel
function adminLogin(username, password) {
  const user = findAdmin.get(username);
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password)) return null;
  return signAdminToken({ id: user.id, username: user.username });
}

module.exports = { signAdminToken, signClientToken, verifyToken, requireAdmin, requireClient, adminLogin };
