# Panic Alarm System — Complete Session History & Requirements

> **Last updated:** 2025-08-22  
> **Status:** ✅ All installers built and ready to distribute

---

## CONFIRMED REQUIREMENTS

### Product Overview
- **Two separate installable desktop applications** for hospitals/clinics — zero pre-requisites for end users
- **Intranet-based** — works entirely within the hospital LAN — no internet needed
- **Server managed by seller/admin** — not by hospital staff

### Server Application (`PanicAlarmServer`)
- One machine (admin's / seller's machine) per hospital deployment
- Electron desktop app — opens a login screen on launch
- Embeds a full Express + Socket.IO server on **port 4000**
- Admin panel opens as a BrowserWindow after login
- System tray keeps server running even when panel is closed
- Login credentials: `admin` / `admin@PanicAlarm2026` (change after first use)
- DB stored in user data dir (auto-migrating SQLite)
- Admin can: create hospitals, add/edit/delete users, view alarm logs, generate reports, change password

### Client Application (`PanicAlarmClient`)
- Installed on every room PC in the hospital
- **Single installer** — role selected at first-run setup wizard
- Roles: **Doctor** (gets floating red ALERT button) | **Staff/Nurse** | **Other** (both receive alert popups)
- Setup wizard fields: Server URL, Hospital (dropdown from server), User ID (mandatory/unique), Name, Room/Location, System/PC Number, Role
- After setup: runs silently in system tray — no visible window unless alarm fires
- Doctor button: frameless, always-on-top, movable, red circle with 🆘 ALERT
- Alert popup: always-on-top, ACKNOWLEDGE (always active), CLOSE (locked 15 seconds)
- Settings window (tray → My Details): edit all fields, changes sync to server immediately

---

## FILES & ARCHITECTURE

```
NewApp/
├── client/
│   ├── main.js                   ← Electron main: tray, windows, socket, IPC
│   ├── preload.js                ← contextBridge: electronAPI
│   ├── package.json              ← productName: PanicAlarmClient
│   ├── renderer/
│   │   ├── setup.html            ← 3-step wizard (role → details → done)
│   │   ├── alarm_button.html     ← floating round red ALERT button (doctor only)
│   │   ├── alert_popup.html      ← PANIC ALARM popup (15s close lock, ACK always active)
│   │   └── settings.html        ← My Details — edit all fields
│   ├── assets/
│   │   ├── icon.png / icon.icns  ← red circle icon (Mac)
│   │   └── icon.ico              ← red circle icon (Windows)
│   └── dist/
│       ├── PanicAlarmClient-1.0.0-arm64.dmg   ← Mac Apple Silicon
│       ├── PanicAlarmClient-1.0.0.dmg          ← Mac Intel
│       └── PanicAlarmClient Setup 1.0.0.exe    ← Windows x64 NSIS installer
│
├── server/
│   ├── server-main.js            ← Electron main: login, tray, embeds server, admin panel
│   ├── server-preload.js         ← contextBridge: serverAPI (login, getServerInfo)
│   ├── server.js                 ← Express + Socket.IO server (all REST APIs)
│   ├── db.js                     ← SQLite schema, migrations, prepared statements
│   ├── auth.js                   ← JWT auth middleware (admin 8h, client 365d)
│   ├── package.json              ← productName: PanicAlarmServer
│   ├── renderer/
│   │   └── server-login.html     ← Admin login screen (shows server IP on screen)
│   ├── public/
│   │   └── index.html            ← Full Admin Panel SPA (served at /admin/)
│   ├── assets/
│   │   ├── server-icon.png / .icns  ← blue circle icon (Mac)
│   │   └── server-icon.ico          ← blue circle icon (Windows)
│   └── dist/
│       ├── PanicAlarmServer-1.0.0-arm64.dmg   ← Mac Apple Silicon
│       ├── PanicAlarmServer-1.0.0.dmg          ← Mac Intel
│       └── PanicAlarmServer Setup 1.0.0.exe    ← Windows x64 NSIS installer
│
├── README.md
├── INSTALLATION_GUIDE.md
└── PANIC_ALARM_SESSION_HISTORY.md   ← this file
```

---

## DATABASE SCHEMA

```sql
-- Admin login (server only)
admin_users (id, username, password[bcrypt], created_at)

-- Registered hospitals / organisations
clients (id, client_name, hospital_code[UNIQUE], system_limit, active, created_at)

-- Users (one row per PC registration or admin-added entry)
client_users (
  id, client_id[FK→clients], hospital_code,
  user_id TEXT,            -- mandatory, unique per hospital (e.g. EMP-001)
  room_number, system_number, user_name,
  role TEXT,               -- 'doctor' | 'staff' | 'other'
  source TEXT,             -- 'client' = self-registered | 'admin' = added from panel
  device_id TEXT UNIQUE,   -- UUID from client, or 'admin-<UUID>' for admin-added
  token TEXT,              -- JWT (1-year, refreshed on update)
  active, registered_at, updated_at
)

-- Panic alarm audit trail
alarm_log (
  id, alarm_id[UNIQUE], hospital_code,
  triggered_by, user_id, room_number, system_number, device_id,
  severity, message, acknowledged, ack_by, ack_at, triggered_at
)

-- Key-value settings store
settings (key, value)
```

### Auto-migrations (safe for existing DBs)
- `user_id` column added to `client_users` if missing
- `source` column added to `client_users` if missing (default `'client'`)
- `user_id` column added to `alarm_log` if missing

---

## REST API REFERENCE

### Public (no auth)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server health check |
| GET | `/api/public/hospitals` | Hospital dropdown for client setup wizard |

### Admin (Bearer JWT required)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/login` | Login → returns JWT |
| POST | `/api/admin/change-password` | Change admin password (auto-logout) |
| GET | `/api/admin/clients` | List all hospitals |
| POST | `/api/admin/clients` | Add hospital |
| PUT | `/api/admin/clients/:id` | Edit hospital |
| DELETE | `/api/admin/clients/:id` | Soft-delete hospital |
| GET | `/api/admin/clients/:id/users` | List users in hospital |
| POST | `/api/admin/clients/:id/users` | Admin-add user (source='admin') |
| PUT | `/api/admin/client-users/:id` | Edit user |
| DELETE | `/api/admin/client-users/:id` | Soft-delete user |
| GET | `/api/admin/logs` | All alarm logs (supports ?hospital_code, ?from, ?to) |
| GET/POST | `/api/admin/settings` | Key-value settings |

### Client (Bearer JWT required)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/client/register` | First-run wizard registration (source='client') |
| GET | `/api/client/me` | Get own user record |
| PUT | `/api/client/me` | Update own details (reissues token) |
| POST | `/api/client/alarm/trigger` | Doctor triggers alarm (broadcasts via Socket.IO) |
| POST | `/api/client/alarm/acknowledge` | Staff acknowledges alarm |

### Socket.IO events
| Event | Direction | Description |
|-------|-----------|-------------|
| `join` | client→server | Join hospital room: `{ hospitalCode, userName }` |
| `panic_alarm` | server→clients | Alarm broadcast to `hospital_<CODE>` room |
| `alarm_acknowledged` | server→clients | Ack broadcast: `{ alarmId, ackBy, ackAt }` |

---

## KEY DESIGN DECISIONS

| Decision | Rationale |
|----------|-----------|
| Electron wraps both apps | Zero pre-requisites — Node.js, server runtime all bundled |
| `socket.io-client` in main process | No renderer window needed for background connection |
| JWT `CLIENT_EXPIRY = 365d` | Client never needs to re-login — "install once and use" |
| DB in `app.getPath('userData')` | Survives app updates, correct location per OS |
| `source TEXT` column | Reliable self-registered vs admin-added detection (was heuristic, now explicit) |
| `device_id` prefix `admin-` | Admin-added users get a prefixed UUID — no real device behind them |
| `normalizeRole()` at API layer | Legacy `'viewer'` role works as `'staff'` — no schema migration needed |
| `identity: null` in mac build | Skip Apple codesigning (no Developer ID) — works on local network |

---

## KNOWN BEHAVIOURS / EDGE CASES

- **Admin-added users** appear in the users table with `Admin-added` badge. They have no real device — the admin panel creates a placeholder `device_id` prefixed `admin-`. They cannot actually connect to the socket or trigger alarms unless a real machine registers under the same `user_id`.
- **Re-registration**: if the same `device_id` tries to register again (e.g. settings changed), the existing record is updated, not duplicated.
- **User ID uniqueness** is per-hospital, not global.
- **System limit** prevents too many PCs registering to the same hospital code.
- **Alert popup**: CLOSE button is locked for 15 seconds; ACKNOWLEDGE is always active. Both buttons can work independently.
- **Doctor role change**: if a user changes from Doctor→Staff via Settings, the alarm button window is not automatically closed (it stays until app restart). This is acceptable behaviour.

---

## DEFAULT CREDENTIALS

| Field | Value |
|-------|-------|
| Admin username | `admin` |
| Admin password | `admin@PanicAlarm2026` |
| Server port | `4000` |
| Client token expiry | 1 year (auto-refreshed on settings update) |

⚠️ **Change the admin password on first login.**

---

## BUILD COMMANDS

```bash
# Server — Mac (Apple Silicon + Intel)
cd server && npx electron-builder --mac --arm64
# Server — Windows x64
cd server && npx electron-builder --win --x64

# Client — Mac (Apple Silicon + Intel)
cd client && npx electron-builder --mac --arm64
# Client — Windows x64
cd client && npx electron-builder --win --x64
```

If macOS quarantine blocks builds:
```bash
xattr -cr server/node_modules/
xattr -cr client/node_modules/
```

---

## COMPLETED WORK LOG

| Date | Work Done |
|------|-----------|
| Session 1 | Project scaffolded, Electron + Express + Socket.IO wiring |
| Session 2 | Client setup wizard (3 roles), alert popup (15s lock), alarm button |
| Session 3 | DB schema, user_id, JWT auth, admin panel SPA |
| Session 4 | Server Electron wrapper (login screen, tray, admin panel window) |
| Session 5 | Admin panel: Change Password page, improved Add User form, Source badge |
| Session 6 | productName renamed (PanicAlarmClient / PanicAlarmServer), password → 2026 |
| Session 7 | **source column** added to DB for reliable Self/Admin badge; admin-added device_id uses `admin-` prefix; admin add-user User ID made mandatory; all 6 installers rebuilt |

---

## INSTALLER CHECKLIST

| File | Platform | Size | Built |
|------|----------|------|-------|
| `server/dist/PanicAlarmServer-1.0.0-arm64.dmg` | Mac Apple Silicon | ~97 MB | ✅ 2025-08-22 |
| `server/dist/PanicAlarmServer-1.0.0.dmg` | Mac Intel x64 | ~102 MB | ✅ 2025-08-22 |
| `server/dist/PanicAlarmServer Setup 1.0.0.exe` | Windows x64 | ~77 MB | ✅ 2025-08-22 |
| `client/dist/PanicAlarmClient-1.0.0-arm64.dmg` | Mac Apple Silicon | ~91 MB | ✅ 2025-08-22 |
| `client/dist/PanicAlarmClient-1.0.0.dmg` | Mac Intel x64 | ~96 MB | ✅ 2025-08-22 |
| `client/dist/PanicAlarmClient Setup 1.0.0.exe` | Windows x64 | ~72 MB | ✅ 2025-08-22 |
