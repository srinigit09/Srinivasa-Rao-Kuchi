# 🚨 Panic Alarm System — Hospital / Clinic Emergency Notification

An **intranet-only** desktop alarm system for hospitals and clinics.
A doctor presses a panic button on their desktop; every registered machine on the network instantly shows a full-screen alert popup.

**No pre-installed software needed on any machine.** No Node.js. No database setup. No command-line.
Two self-contained installers — double-click and use.

---

## 📐 Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      INTRANET  (LAN only)                        │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │          SERVER PC  (one dedicated machine)                 │ │
│  │  PanicAlarmServer.dmg / .exe  — installable desktop app    │ │
│  │  Embedded HTTP + WebSocket server  ·  Port 4000            │ │
│  │  SQLite database  ·  Admin panel (web UI in window)        │ │
│  │  ✅ Client app can also run here (role = Staff/Other)       │ │
│  └──────────────────────────────────┬──────────────────────────┘ │
│                                     │ Real-time broadcast        │
│  ┌──────────────┐  ┌──────────────┐ │ ┌───────────────────────┐  │
│  │  Doctor PC   │  │  Nurse PC    │ └►│  Any hospital PC      │  │
│  │  PanicAlarm  │  │  PanicAlarm  │   │  PanicAlarm           │  │
│  │  🔴 ALERT    │  │  🚨 Popup    │   │  🚨 Popup             │  │
│  │  button      │  │  (receiver)  │   │  (receiver)           │  │
│  └──────────────┘  └──────────────┘   └───────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

**Same client installer for everyone.** Role (Doctor / Staff/Nurse / Other) is chosen during the first-run setup wizard on each machine. Only Doctor machines get the floating red ALERT button.

---

## 📦 Two Installers — That's All

| Installer | Who installs it | What it does |
|---|---|---|
| **PanicAlarmServer** (`.dmg` / `.exe`) | IT admin / seller — one machine only | Starts the server, shows admin panel, manages hospitals & users |
| **PanicAlarm** (`.dmg` / `.exe`) | Every hospital PC — doctor, nurse, staff | First-run wizard: choose role → ALERT button (Doctor) or Alert receiver (Staff/Other) |

---

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| Server runtime | Node.js (embedded in installer) |
| Server framework | Express.js |
| Real-time push | Socket.IO |
| Database | SQLite (better-sqlite3) |
| Authentication | JWT + bcrypt |
| Desktop apps | Electron |
| Installer builder | electron-builder |

---

## 📁 Folder Structure

```
NewApp/
├── server/                      ← Server app source
│   ├── server-main.js           ← Electron main (desktop app wrapper)
│   ├── server-preload.js        ← IPC bridge for login window
│   ├── server.js                ← Express + Socket.IO server
│   ├── db.js                    ← SQLite schema + queries
│   ├── auth.js                  ← JWT authentication
│   ├── package.json
│   ├── renderer/
│   │   └── server-login.html    ← Login screen for server app
│   └── public/
│       └── index.html           ← Admin panel web UI
│
├── client/                      ← Client app source (same installer for all roles)
│   ├── main.js                  ← Electron main process
│   ├── preload.js               ← Secure IPC bridge
│   ├── package.json
│   ├── renderer/
│   │   ├── setup.html           ← First-run setup wizard (role + details)
│   │   ├── alarm_button.html    ← Doctor's floating panic button
│   │   ├── alert_popup.html     ← Alert popup (Staff/Nurse/Other)
│   │   └── settings.html        ← Edit my details (tray menu)
│   └── assets/
│       ├── icon.png
│       └── icon.icns
│
└── PANIC_ALARM_SESSION_HISTORY.md  ← Full dev history (keyword: PANICALARM_SESSION)
```

---

## 🚀 Running in Development

### Server

```bash
cd server
npm install
node server.js          # bare Node.js (terminal)
# — or —
npm run start-desktop   # Electron desktop app (with login window)
```

Admin panel: `http://localhost:4000/admin/`  
Default login: `admin` / `admin@PanicAlarm2026`

### Client

```bash
cd client
npm install
npm start
```

---

## 🏗️ Building Installers

```bash
# Client (macOS ARM)
cd client && npm run build-mac-arm    → client/dist/PanicAlarm-1.0.0-arm64.dmg

# Client (Windows)
cd client && npm run build-win        → client/dist/PanicAlarm Setup 1.0.0.exe

# Server (macOS ARM)
cd server && npm run build-mac        → server/dist/PanicAlarmServer-1.0.0-arm64.dmg

# Server (Windows)
cd server && npm run build-win        → server/dist/PanicAlarmServer Setup 1.0.0.exe
```

---

## 👤 User Roles (all from the same client installer)

| Role | Chosen at | Desktop experience |
|---|---|---|
| **Doctor** | First-run wizard | Floating red 🔴 ALERT button (always on top, movable) |
| **Staff / Nurse** | First-run wizard | Silent background app; full-screen 🚨 popup when alarm fires |
| **Other** | First-run wizard | Same as Staff — receives alert popups |

Role can be changed any time via **tray icon → My Details**.

---

## 📋 How Alarms Work

1. Doctor clicks the red ALERT button
2. Client sends `POST /api/client/alarm/trigger` with JWT
3. Server validates token (only `doctor` role allowed)
4. Server writes audit log entry (alarm_id, hospital, user, room, timestamp)
5. Server broadcasts `panic_alarm` event via Socket.IO to **all clients in the same hospital**
6. Every client machine shows a **full-screen red alert popup** with:
   - Doctor's name + User ID + room
   - Hospital name + timestamp
   - **ACKNOWLEDGE** button (always enabled — logs response)
   - **CLOSE** button (disabled for **15 seconds**, then unlocks)

---

## 🔐 Admin Panel (Server App)

Access via the server desktop app login screen, or directly at `http://<server-ip>:4000/admin/`

| Section | Purpose |
|---|---|
| Dashboard | Live stats — total clients, users, alarms today |
| Add a Client | Register a new hospital / clinic |
| List of Clients | View / Edit / Delete hospitals; drill in to manage users |
| Reports | Filter alarm history by hospital + date range |
| Alarm Logs | Full audit trail — all panic alarms with acknowledgement status |

---

## 🔒 Security Notes

- All alarm triggers require a valid JWT — clients cannot spoof alarms
- User ID must be unique per hospital — enforced at registration
- Passwords are bcrypt-hashed (cost 12)
- JWT secret in `server/.env` — never commit to git
- Designed for **LAN/intranet only** — do not expose port 4000 to the internet
- Server app requires admin login before the admin panel is accessible

---

*Panic Alarm System — Hospital Intranet Emergency Notification*  
*Built with Node.js + Electron + SQLite — no cloud, no subscription*
