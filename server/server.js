'use strict';

require('dotenv').config();

const express     = require('express');
const http        = require('http');
const { Server }  = require('socket.io');
const cors        = require('cors');
const bcrypt      = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const os          = require('os');
const path        = require('path');
const cookieParser = require('cookie-parser');

const { requireAdmin, requireClient, adminLogin, signClientToken, signAdminToken } = require('./auth');
const {
  db,
  findAdmin, listAdmins, updateAdminPassword,
  listClients, findClientByCode, findClientById, createClient, updateClient, deleteClient, countClientUsers,
  listClientUsers, findClientUser, findClientUserById, findClientUserByUserId,
  createClientUser, createClientUserAdmin, updateClientUser,
  updateClientUserToken, deleteClientUser,
  insertLog, acknowledgeAlarm, listLogs, listLogsByHospital, listLogsByDate,
  getSetting, setSetting,
} = require('./db');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*', methods: ['GET','POST','PUT','DELETE'] } });

const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// ── Middleware ─────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
try {
  app.use(cookieParser());
} catch { /* cookie-parser optional */ }

// Serve web admin panel static files
app.use('/admin', express.static(path.join(__dirname, 'public')));

// ── Health ─────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Public: list hospitals for client dropdown (no auth) ───────
// Returns only id, client_name, hospital_code — safe to expose on intranet
app.get('/api/public/hospitals', (req, res) => {
  const rows = listClients.all();
  res.json(rows.map(r => ({
    id           : r.id,
    client_name  : r.client_name,
    hospital_code: r.hospital_code,
  })));
});

// ══════════════════════════════════════════════════════════════
//  ADMIN WEB PANEL ROUTES  (served to browser, protected by JWT)
// ══════════════════════════════════════════════════════════════

// POST /api/admin/login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });
  const token = adminLogin(username, password);
  if (!token) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token });
});

// POST /api/admin/change-password
app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = findAdmin.get(req.admin.username);
  if (!bcrypt.compareSync(currentPassword, user.password))
    return res.status(400).json({ error: 'Current password incorrect' });
  const hash = bcrypt.hashSync(newPassword, 12);
  updateAdminPassword.run(hash, user.id);
  res.json({ message: 'Password changed' });
});

// ── Client management ──────────────────────────────────────────

// GET /api/admin/clients
app.get('/api/admin/clients', requireAdmin, (req, res) => {
  const clients = listClients.all();
  const result  = clients.map(c => ({
    ...c,
    user_count: countClientUsers.get(c.id).cnt,
  }));
  res.json(result);
});

// POST /api/admin/clients  { client_name, hospital_code, system_limit }
app.post('/api/admin/clients', requireAdmin, (req, res) => {
  const { client_name, hospital_code, system_limit = 100 } = req.body || {};
  if (!client_name || !hospital_code)
    return res.status(400).json({ error: 'client_name and hospital_code required' });
  try {
    const r = createClient.run(client_name.trim(), hospital_code.trim().toUpperCase(), parseInt(system_limit));
    res.status(201).json({ id: r.lastInsertRowid, message: 'Client created' });
  } catch (e) {
    if (e.message.includes('UNIQUE'))
      return res.status(409).json({ error: 'Hospital code already exists' });
    throw e;
  }
});

// PUT /api/admin/clients/:id
app.put('/api/admin/clients/:id', requireAdmin, (req, res) => {
  const { client_name, hospital_code, system_limit } = req.body || {};
  const c = findClientById.get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Client not found' });
  updateClient.run(
    client_name  || c.client_name,
    (hospital_code || c.hospital_code).toUpperCase(),
    parseInt(system_limit || c.system_limit),
    req.params.id
  );
  res.json({ message: 'Client updated' });
});

// DELETE /api/admin/clients/:id
app.delete('/api/admin/clients/:id', requireAdmin, (req, res) => {
  deleteClient.run(req.params.id);
  res.json({ message: 'Client removed' });
});

// ── Client-users management ────────────────────────────────────

// GET /api/admin/clients/:id/users
app.get('/api/admin/clients/:id/users', requireAdmin, (req, res) => {
  res.json(listClientUsers.all(req.params.id));
});

// POST /api/admin/clients/:id/users  (admin can add users manually)
app.post('/api/admin/clients/:id/users', requireAdmin, (req, res) => {
  const client = findClientById.get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const { user_id, room_number, system_number, user_name, role = 'staff' } = req.body || {};
  if (!user_id || !user_id.trim())
    return res.status(400).json({ error: 'User ID is required' });
  if (!room_number || !system_number || !user_name)
    return res.status(400).json({ error: 'room_number, system_number and user_name required' });
  // Validate user_id uniqueness within hospital
  const existing = findClientUserByUserId.get(user_id.trim(), client.hospital_code);
  if (existing)
    return res.status(409).json({ error: `User ID "${user_id}" already exists in this hospital` });
  const normalizedRole = normalizeRole(role);
  // Use a special prefix to mark admin-generated device IDs (not a real device)
  const deviceId = 'admin-' + uuidv4();
  const token    = signClientToken({
    deviceId, hospital_code: client.hospital_code,
    user_id: user_id.trim(), room_number, system_number, user_name, role: normalizedRole,
  });
  createClientUserAdmin.run(client.id, client.hospital_code, user_id.trim(), room_number, system_number, user_name, normalizedRole, deviceId, token);
  res.status(201).json({ message: 'User added', token, deviceId });
});

// PUT /api/admin/client-users/:id
app.put('/api/admin/client-users/:id', requireAdmin, (req, res) => {
  const u = findClientUserById.get(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const { user_id, room_number, system_number, user_name, role } = req.body || {};
  // Check user_id uniqueness (allow same record to keep its own user_id)
  if (user_id && user_id !== u.user_id) {
    const existing = findClientUserByUserId.get(user_id, u.hospital_code);
    if (existing && existing.id !== u.id)
      return res.status(409).json({ error: `User ID "${user_id}" already exists in this hospital` });
  }
  const normalizedRole = normalizeRole(role || u.role);
  updateClientUser.run(
    user_id       !== undefined ? user_id       : u.user_id,
    room_number   || u.room_number,
    system_number || u.system_number,
    user_name     || u.user_name,
    normalizedRole,
    req.params.id
  );
  res.json({ message: 'User updated' });
});

// DELETE /api/admin/client-users/:id
app.delete('/api/admin/client-users/:id', requireAdmin, (req, res) => {
  deleteClientUser.run(req.params.id);
  res.json({ message: 'User removed' });
});

// ── Logs ───────────────────────────────────────────────────────

app.get('/api/admin/logs', requireAdmin, (req, res) => {
  const { from, to, hospital_code } = req.query;
  if (from && to) return res.json(listLogsByDate.all(from, to));
  if (hospital_code) return res.json(listLogsByHospital.all(hospital_code));
  res.json(listLogs.all());
});

// ── Settings ───────────────────────────────────────────────────

app.get('/api/admin/settings', requireAdmin, (req, res) => {
  const allSettings = db.prepare('SELECT * FROM settings').all();
  const obj = {};
  allSettings.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

app.post('/api/admin/settings', requireAdmin, (req, res) => {
  const { key, value } = req.body || {};
  if (!key) return res.status(400).json({ error: 'key required' });
  setSetting.run(key, String(value));
  res.json({ message: 'Setting saved' });
});

// ══════════════════════════════════════════════════════════════
//  CLIENT API  (called from Electron desktop app)
// ══════════════════════════════════════════════════════════════

// POST /api/client/register  — called once at first-run wizard
// Body: { hospital_code, user_id, room_number, system_number, user_name, role, device_id }
app.post('/api/client/register', (req, res) => {
  const {
    hospital_code, user_id, room_number, system_number, user_name,
    role = 'staff', device_id,
  } = req.body || {};

  if (!hospital_code || !room_number || !system_number || !user_name || !device_id)
    return res.status(400).json({ error: 'Required: hospital_code, room_number, system_number, user_name, device_id' });
  if (!user_id || !user_id.trim())
    return res.status(400).json({ error: 'User ID is required' });

  const code   = hospital_code.trim().toUpperCase();
  const uid    = user_id.trim();
  const client = findClientByCode.get(code);
  if (!client) return res.status(404).json({ error: 'Hospital code not recognised. Contact your administrator.' });

  // Check system limit
  const { cnt } = countClientUsers.get(client.id);
  // Allow re-registration of same device
  const existingDevice = findClientUser.get(device_id);

  // Check user_id uniqueness within the hospital (but allow same device to re-register with same user_id)
  if (!existingDevice) {
    const existingUid = findClientUserByUserId.get(uid, code);
    if (existingUid)
      return res.status(409).json({ error: `User ID "${uid}" is already registered in this hospital. Use a unique ID.` });
  }

  if (!existingDevice && cnt >= client.system_limit)
    return res.status(403).json({ error: `System limit reached (${client.system_limit}). Contact administrator.` });

  const normalizedRole = normalizeRole(role);
  const token = signClientToken({
    deviceId: device_id, hospital_code: code, user_id: uid,
    room_number, system_number, user_name, role: normalizedRole,
  });

  if (existingDevice) {
    // Update existing registration
    updateClientUser.run(uid, room_number, system_number, user_name, normalizedRole, existingDevice.id);
    updateClientUserToken.run(token, device_id);
    return res.json({
      message: 'Re-registered', token, deviceId: device_id,
      clientName: client.client_name, hospitalCode: code,
    });
  }

  // source = 'client' (self-registered via setup wizard)
  createClientUser.run(client.id, code, uid, room_number, system_number, user_name, normalizedRole, 'client', device_id, token);
  res.status(201).json({
    message: 'Registered', token, deviceId: device_id,
    clientName: client.client_name, hospitalCode: code,
  });
});

// GET /api/client/me — client verifies its own token + gets latest details
app.get('/api/client/me', requireClient, (req, res) => {
  const u = findClientUser.get(req.clientUser.deviceId);
  if (!u || !u.active) return res.status(404).json({ error: 'Client not found or deactivated' });
  res.json(u);
});

// PUT /api/client/me  — client updates its own details
app.put('/api/client/me', requireClient, (req, res) => {
  const u = findClientUser.get(req.clientUser.deviceId);
  if (!u) return res.status(404).json({ error: 'Not found' });
  const { user_id, room_number, system_number, user_name, role } = req.body || {};

  // Check user_id uniqueness if changing
  const newUserId = (user_id || u.user_id || '').trim();
  if (newUserId && newUserId !== u.user_id) {
    const existingUid = findClientUserByUserId.get(newUserId, u.hospital_code);
    if (existingUid && existingUid.id !== u.id)
      return res.status(409).json({ error: `User ID "${newUserId}" is already taken in this hospital` });
  }

  const normalizedRole = normalizeRole(role || u.role);
  updateClientUser.run(
    newUserId     || u.user_id,
    room_number   || u.room_number,
    system_number || u.system_number,
    user_name     || u.user_name,
    normalizedRole,
    u.id
  );
  // Re-issue token with updated fields
  const updated = findClientUser.get(req.clientUser.deviceId);
  const newToken = signClientToken({
    deviceId: updated.device_id, hospital_code: updated.hospital_code,
    user_id: updated.user_id,
    room_number: updated.room_number, system_number: updated.system_number,
    user_name: updated.user_name, role: updated.role,
  });
  updateClientUserToken.run(newToken, updated.device_id);
  res.json({ message: 'Updated', token: newToken });
});

// POST /api/client/alarm/trigger
app.post('/api/client/alarm/trigger', requireClient, (req, res) => {
  const u = req.clientUser;
  // Only doctors can trigger alarms
  const role = normalizeRole(u.role);
  if (role !== 'doctor')
    return res.status(403).json({ error: 'Only doctors can trigger alarms' });

  const alarmId  = uuidv4();
  const userId   = u.user_id || u.userId || '';
  const message  = `🚨 PANIC ALARM — ${u.user_name}${userId ? ' (ID: ' + userId + ')' : ''} in Room ${u.room_number} needs IMMEDIATE HELP!`;
  const severity = 'PANIC';

  insertLog.run(alarmId, u.hospital_code, u.user_name, userId, u.room_number, u.system_number, u.deviceId, severity, message);

  // Broadcast only to clients of the same hospital_code
  io.to(`hospital_${u.hospital_code}`).emit('panic_alarm', {
    alarmId,
    hospitalCode : u.hospital_code,
    triggeredBy  : u.user_name,
    userId       : userId,
    roomNumber   : u.room_number,
    systemNumber : u.system_number,
    severity,
    message,
    triggeredAt  : new Date().toISOString(),
  });

  console.log(`[ALARM] ${new Date().toISOString()} | ${u.hospital_code} | ${u.user_name} (${userId}) | Room ${u.room_number}`);
  res.json({ alarmId, message: 'Alarm sent' });
});

// POST /api/client/alarm/acknowledge
app.post('/api/client/alarm/acknowledge', requireClient, (req, res) => {
  const { alarmId } = req.body || {};
  if (!alarmId) return res.status(400).json({ error: 'alarmId required' });
  const u = req.clientUser;
  acknowledgeAlarm.run(u.user_name, alarmId);
  io.to(`hospital_${u.hospital_code}`).emit('alarm_acknowledged', {
    alarmId, ackBy: u.user_name, ackAt: new Date().toISOString(),
  });
  res.json({ message: 'Acknowledged' });
});

// ── Socket.IO ──────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[WS] Connected: ${socket.id}`);

  socket.on('join', (data) => {
    // Normalise: accept both hospitalCode and hospital_code, always uppercase
    const code = (data && (data.hospitalCode || data.hospital_code || ''))
      .toString().trim().toUpperCase();
    if (code) {
      socket.join(`hospital_${code}`);
      console.log(`[WS] ${socket.id} joined hospital_${code} (${data.userName || data.user_name || ''})`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Disconnected: ${socket.id}`);
  });
});

// ── Error handler ──────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ──────────────────────────────────────────────────────
server.listen(PORT, HOST, () => {
  const ips = Object.values(os.networkInterfaces())
    .flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);

  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   🚨  PANIC ALARM SERVER — RUNNING  🚨           ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Port        : ${PORT}`);
  console.log(`║  Intranet IP : ${ips.join(' | ') || 'N/A'}`);
  console.log(`║  Admin Panel : http://${ips[0] || 'localhost'}:${PORT}/admin/`);
  console.log('║  DB          : SQLite ./data/panic_alarm.db');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
});

process.on('SIGINT',  () => { db.close(); process.exit(0); });
process.on('SIGTERM', () => { db.close(); process.exit(0); });

// ── Helpers ────────────────────────────────────────────────────
// Normalise role: map legacy 'viewer' to 'staff', accept doctor/staff/other
function normalizeRole(role) {
  if (!role) return 'staff';
  const r = role.toString().toLowerCase().trim();
  if (r === 'doctor') return 'doctor';
  if (r === 'other')  return 'other';
  return 'staff';  // 'staff', 'viewer', 'nurse', etc. → 'staff'
}
