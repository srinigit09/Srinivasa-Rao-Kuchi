# PANIC ALARM SYSTEM — INSTALLATION GUIDE

**Hospital / Clinic Intranet Emergency Notification System**
Version 1.0 · All software free & open-source · No cloud · No subscriptions

---

## WHAT YOU GET — TWO INSTALLER FILES

```
PanicAlarmServer-1.0.0.dmg  (Mac)   or   PanicAlarmServer Setup 1.0.0.exe  (Windows)
PanicAlarm-1.0.0.dmg        (Mac)   or   PanicAlarm Setup 1.0.0.exe        (Windows)
```

**That's it. No other software needs to be installed on any machine.**
Everything is bundled inside — Node.js, the database, all libraries, the desktop UI.

---

## WHAT EACH INSTALLER DOES

| Installer | Install on | What it does |
|---|---|---|
| **PanicAlarmServer** | ONE dedicated machine (always-on server PC) | Runs the alarm server + opens the admin panel in a window. Managed by the admin/seller. |
| **PanicAlarm** (Client) | EVERY hospital PC — doctors, nurses, staff, other | First-time wizard asks: choose role → done. Doctor gets a panic button. Others get alert popups. |

---

## STEP 1 — INSTALL THE SERVER (one machine, one time)

> Do this on the machine that stays switched on in the hospital/clinic.
> This is managed by the seller/IT admin — hospital staff never touch this machine.

### On Mac:
1. Double-click `PanicAlarmServer-1.0.0-arm64.dmg`
2. Drag **PanicAlarmServer** into the Applications folder
3. Open **PanicAlarmServer** from Applications (or Launchpad)
4. A login window appears — enter credentials:
   - **Username:** `admin`
   - **Password:** `admin@PanicAlarm2026`
5. The admin panel opens in a window ✅
6. The 🖥️ icon in the menu bar shows the server is running
7. Note the **Server IP address** shown on the login screen (e.g. `192.168.1.10`) — you need this for client setup

### On Windows:
1. Double-click `PanicAlarmServer Setup 1.0.0.exe`
2. Click through the installer wizard → Finish
3. **PanicAlarm Server** opens automatically
4. Login with `admin` / `admin@PanicAlarm2026`
5. The admin panel window opens ✅
6. Note the **Server IP address** shown on the login screen

> **Change the admin password** immediately after first login:
> Admin Panel → (top-right menu) → Change Password

---

## STEP 2 — ADD THE HOSPITAL IN ADMIN PANEL

Before installing on client machines, register the hospital/clinic:

1. In the admin panel, click **Add a Client** in the left sidebar
2. Fill in:
   - **Client Name** — e.g. `Apollo Hospital`
   - **Hospital Code** — e.g. `APL001` (you choose this — share it with the hospital)
   - **System Limit** — max number of PCs allowed (e.g. `50`)
3. Click **Add Client** ✅

The hospital code is what staff enter during client setup.

---

## STEP 3 — INSTALL THE CLIENT APP (every hospital PC)

> Same installer for **everyone** — doctors, nurses, staff. Role is chosen during setup.
> No Node.js. No technical knowledge needed.

### On Mac:
1. Double-click `PanicAlarm-1.0.0-arm64.dmg`
2. Drag **PanicAlarm** into the Applications folder
3. Open **PanicAlarm** from Applications (or Launchpad)
4. The Setup Wizard appears

### On Windows:
1. Double-click `PanicAlarm Setup 1.0.0.exe`
2. Installer runs automatically → app launches when done
3. The Setup Wizard appears

### Setup Wizard (takes ~1 minute):

**Step 1 — Select Role:**

| Choose | If this person is… |
|---|---|
| 👨‍⚕️ **Doctor** | Sends panic alarms → gets a floating red ALERT button on desktop |
| 🩺 **Staff / Nurse** | Responds to alarms → gets full-screen popup when alarm fires |
| 👤 **Other** | Any other hospital personnel → same as Staff |

**Step 2 — Enter Details:**

| Field | Example | Notes |
|---|---|---|
| Server URL | `http://192.168.1.10:4000` | The IP noted in Step 1 |
| Hospital / Clinic Name | *(dropdown)* | Click **Load Hospitals** → select from list |
| User ID | `DOC-001` | Unique ID for this person (e.g. employee number) |
| Your Name | `Dr. John Smith` | |
| Room / Location | `ICU-3` or `Ward B` | |
| System / PC Number | `PC-07` | Label on the computer |

Click **Load Hospitals from Server** after entering the Server URL, then select the hospital from the dropdown.

Click **REGISTER & START** → done ✅

---

## HOW IT WORKS DAILY

```
Doctor clicks 🔴 ALERT button
         ↓
All staff PCs on the same hospital network immediately show:

┌─────────────────────────────────────────┐
│  🚨 🚨 🚨  PANIC ALARM  🚨 🚨 🚨       │
│                                         │
│  Dr. John Smith (ID: DOC-001)           │
│  Room: ICU-3  ·  Apollo Hospital        │
│  Triggered at: 10:32:15 AM              │
│                                         │
│  [ACKNOWLEDGE]      [CLOSE — 14s...]    │
└─────────────────────────────────────────┘

CLOSE button is locked for 15 seconds — staff must see the alert first.
ACKNOWLEDGE logs a response in the audit trail.
```

---

## MAKE THE APP START AUTOMATICALLY WITH THE COMPUTER

### Windows (Client or Server):
1. Press `Win + R`, type `shell:startup`, press Enter
2. Right-click in the folder → New → Shortcut
3. For the client: point to `C:\Program Files\PanicAlarm\PanicAlarm.exe`
4. For the server: point to `C:\Program Files\PanicAlarmServer\PanicAlarmServer.exe`

### Mac (Client):
1. Open **System Settings → General → Login Items**
2. Click `+` → add `/Applications/PanicAlarm.app`

### Mac (Server):
1. Open **System Settings → General → Login Items**
2. Click `+` → add `/Applications/PanicAlarmServer.app`

---

## CHANGING YOUR DETAILS (any time)

Click the tray icon (🚨 in menu bar on Mac / system tray on Windows) → **My Details**

You can update your name, room, User ID, or change your role at any time.

---

## ADMIN PANEL — WHAT YOU CAN DO

Access: open **PanicAlarmServer** app and log in, OR open a browser on the server machine at `http://localhost:4000/admin/`

| Section | What you can do |
|---|---|
| **Dashboard** | See total alarms, active users, alarms today |
| **Add a Client** | Register a new hospital/clinic |
| **List of Clients** | View/Edit/Delete hospitals; click a hospital to manage its users |
| **Reports** | Filter alarm history by hospital and date range |
| **Alarm Logs** | Full audit trail — every panic alarm, who triggered it, who acknowledged |

---

## FIREWALL NOTE (Windows Server machine only)

If client machines cannot connect, Windows Firewall may be blocking port 4000.

Open **Command Prompt as Administrator** on the server machine and run:
```
netsh advfirewall firewall add rule name="PanicAlarm" dir=in action=allow protocol=TCP localport=4000
```

---

## TROUBLESHOOTING

| Problem | Fix |
|---|---|
| **"Cannot connect to server"** during client setup | Check Server URL is correct (e.g. `http://192.168.1.10:4000`) · Make sure server app is running · Check firewall (see above) |
| **Hospital dropdown is empty** | Click "Load Hospitals from Server" after entering the Server URL · Make sure a hospital was added in the admin panel first |
| **"User ID already registered"** | Each person needs a unique User ID · Try `DOC-002` instead of `DOC-001` |
| **No popup on alarm** | Check client is connected — tray icon shows 🟢 Connected · Check both machines are on the same hospital network |
| **Server login fails** | Default: `admin` / `admin@PanicAlarm2026` · If changed, use the new password |
| **App won't open (Mac)** | Right-click the app → Open → Open (bypasses Gatekeeper on first launch) |
| **Close button never appears** | The CLOSE button is intentionally locked for 15 seconds by design |

---

## WHAT GETS INSTALLED — NOTHING EXTRA

| Machine | What's installed | Pre-requisites |
|---|---|---|
| Server PC | PanicAlarmServer app (self-contained) | **None** |
| Any client PC | PanicAlarm app (self-contained) | **None** |

- ✅ No Node.js to install
- ✅ No database to set up
- ✅ No configuration files to edit manually
- ✅ No command-line usage
- ✅ No internet connection required (intranet only)
- ✅ No cloud accounts or subscriptions

---

## FOR DEVELOPERS — BUILDING THE INSTALLERS

> End users never need to do this. This is only for building the `.dmg`/`.exe` files.

Requirements: Node.js 18+ and npm (developer machine only, one-time).

```bash
# Clone / copy the source
# Install dependencies
cd NewApp/server  &&  npm install
cd NewApp/client  &&  npm install

# Build client installer
cd NewApp/client
npm run build-mac-arm    # → client/dist/PanicAlarm-1.0.0-arm64.dmg
npm run build-win        # → client/dist/PanicAlarm Setup 1.0.0.exe

# Build server installer
cd NewApp/server
npm run build-mac        # → server/dist/PanicAlarmServer-1.0.0-arm64.dmg
npm run build-win        # → server/dist/PanicAlarmServer Setup 1.0.0.exe
```

Default admin credentials (change after first login):
- **Username:** `admin`
- **Password:** `admin@PanicAlarm2026`

---

*Panic Alarm System — Hospital Intranet Emergency Notification*
*All open-source: Node.js (MIT) · Electron (MIT) · SQLite (Public Domain) · Socket.IO (MIT)*
*No cloud. No subscriptions. No pre-installed software required. Lifetime use.*
