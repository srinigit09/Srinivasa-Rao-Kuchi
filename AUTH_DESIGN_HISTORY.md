# Server Authentication — Design History & Current State

> **Update (session 2): the signed activation-code design from section 4.3 is now built.** Sections 1–5 below are the session-1 history and are kept for reference. Section 0 is the current state.

## 0. Current state (session 2)

| Piece | Where |
|---|---|
| Code format, base32, Ed25519 sign/verify (shared) | `server/license-codec.js` = copy of `key-issuer/license-codec.js` (a test fails if they differ) |
| Server license logic: machine id, Request Code, verify, 5-try/15-min lockout, expiry | `server/license.js` |
| 3 vendor **public** keys (empty until you export them from the Key Issuer) | `server/license-keys.js` |
| Routes: `/api/public/install-status`, `activate`, `reset-request`, `reset-admin-password` (all localhost-only) | `server/server.js` |
| Login window: Request Code, paste Activation Code, forgot password via Reset Code | `server/renderer/server-login.html` |
| Vendor app: 3 passphrase-encrypted key pairs, issue codes, history, backup/restore, export `license-keys.js` | `key-issuer/` |
| Random JWT secret generated on first run (kept in the DB); forced change of the default admin password | `server/auth.js`, `server/public/index.html` |

Decisions taken: offline signed codes (no activation server), permanent **or** dated licenses, 3 pre-installed public keys for rotation, no OTP/email, no installer key page.

Removed: `server/install-key.js`, `server/build/installer.nsh`, the installer marker, the OTP routes, `nodemailer`, the hardcoded recipient email, the public default JWT secret. `oneClick` is `true` again.

Behaviour to know:
- The accepted code is stored in the DB and **re-verified on every status check**, so editing the DB does not activate, copying the DB to another computer does not stay activated, and an expired license locks again.
- A Request Code embeds a one-time number that changes after each successful use, so an old code cannot be replayed.
- Rotating to key 2/3: *Keys* tab → *Use this key*. Retiring a leaked key needs `retired: true` in `license-keys.js` plus a new server build.
- No revoke: a license ends only by expiry (agreed trade-off of the offline design).

Tested (automatic): `cd key-issuer && npm test` (22 tests), plus an end-to-end run of the real `server.js` against a stand-in SQLite (activation, forced password change, Reset Code, single use, LAN access refused).
**Not tested:** the Electron windows on screen (server login + Key Issuer), a real Windows/macOS installer build, and `better-sqlite3` (binary in `node_modules` is not a macOS build here).

### Next steps for the owner
1. Run the Key Issuer, create keys, back up all 3 + passphrase, export `license-keys.js` into `server/`.
2. Build and try the server on a real machine: activate, sign in, change password, try *Forgot admin password*.
3. Existing servers that were activated with the old 18-character key will ask for an Activation Code after updating.
4. Remaining known gaps: server binds `0.0.0.0` (needed for clients); the admin/client API has no brute-force limit on `/api/admin/login`.

---


Last updated: end of session 1. Branch: `PanicAlarm`. **Nothing below has been committed yet.**

> The actual installation key is intentionally NOT recorded in this file (keep secrets out of version control).
> It was given to the owner in chat. Only its one-way hashes exist in the code.

---

## 1. Goal

The server needs two separate authentications:

1. **Installation key** — asked as soon as the server is installed/started (18 characters, letters + digits). Stored so nobody can decode it.
2. **Admin login** — after the key is accepted. Default account: `admin` / `admin@PanicAlarm2026`.

---

## 2. What was built (current state of the code)

### Installation key (step 1)
| Item | Detail |
|---|---|
| Key format | Exactly 18 characters, `A-Z` and `0-9`, case-insensitive |
| Storage | Only a salted **scrypt** hash is stored (one-way, cannot be decoded). Constant-time comparison. See `server/install-key.js` |
| Removed | Old hardcoded key `panicalarm@09` and the reversible AES-256-GCM storage with its default secret |
| Activation flag | `install_activated = 1` in the `settings` table once the key is accepted |
| Enforcement | `POST /api/admin/login` returns HTTP 403 until activated |
| New routes | `GET /api/public/install-status`, `POST /api/public/verify-key` |
| Login window | `server/renderer/server-login.html` shows "STEP 1 OF 2 — INSTALLATION KEY", then "Step 2 of 2" admin login |

### Windows installer key page
| Item | Detail |
|---|---|
| Installer page | Custom NSIS page asks for the key and blocks install on a wrong key — `server/build/installer.nsh` |
| What the installer holds | Only a SHA-256 digest of the key, never the key |
| Installer mode | `oneClick` changed to `false` in `server/package.json` (wizard installer) |
| Hand-off to app | Installer writes `install-verified` marker next to the exe; the server (`consumeInstallerMarker()` in `server/server.js`) checks it on first launch, activates, then deletes it. Path set in `server/server-main.js` |
| Fallbacks | macOS DMG and silent Windows installs (`/S`) skip the page; the app asks for the key on first launch |

### Docs touched
`INSTALLATION_GUIDE.md`, `README.md` (two-step access described), `server/.env.example` (admin password default corrected to `...2026`).

### Files changed / added (uncommitted)
```
M  INSTALLATION_GUIDE.md
M  README.md
M  server/.env.example
M  server/package.json
M  server/renderer/server-login.html
M  server/server-main.js
M  server/server.js
?? server/build/installer.nsh
?? server/install-key.js
?? AUTH_DESIGN_HISTORY.md
```

### How it was tested
- Server endpoints run with an in-memory stand-in for the database (the installed `better-sqlite3` binary is not a macOS build, so the real server could not start in this environment): login blocked before activation; old key and wrong key rejected; correct key accepted; login allowed afterwards.
- Marker file: valid marker activates; forged or missing marker does not; marker deleted in every case.
- `electron-builder --win --x64` compiled the installer with the key page.
- **Not tested:** running the installer on a real Windows machine, and viewing the Electron login window on screen.

---

## 3. Known gaps in the current code

| # | Gap | Where |
|---|---|---|
| 1 | **Admin password has no reset**, only "change" (needs current password). Forgotten password = edit the DB by hand | `server/server.js` `/api/admin/change-password` |
| 2 | **"Forgot key?" is unreachable after activation** (it sits on the login form, shown only once activated). Key reset also does not clear the activated flag, so it has no visible effect | `server/renderer/server-login.html`, `/api/admin/reset-key` |
| 3 | **OTP is weak**: made with `Math.random()`, no attempt limit, server listens on all interfaces, 6 digits | `/api/admin/request-key-reset` |
| 4 | **OTP email is hardcoded** to `srinivasa.kuchi@gmail.com`; without SMTP settings the OTP only prints to the console | `server/server.js` |
| 5 | **Default `JWT_SECRET` is public** (`CHANGE_ME_USE_A_LONG_RANDOM_STRING`) — admin tokens can be forged if no secret is set. The desktop app ships no `.env` | `server/auth.js` |
| 6 | Default admin password is in docs and a console log line; the app does not force a change | `server/db.js`, docs |
| 7 | Server binds `0.0.0.0` by default (existing behaviour; clients on other PCs need to reach it) | `server/server-main.js` |
| 8 | Factory key is shared by every install (one key for all customers) | `server/install-key.js` |
| 9 | Installer marker is plain text next to the exe (low risk, install already needs write access) | `server/build/installer.nsh` |

---

## 4. Decisions discussed

### 4.1 OTP hardening (owner chose: 3 attempts)
- Lock belongs to the **server**, not the OTP — otherwise "Send OTP" again would give 3 fresh guesses every time.
- After 3 wrong entries: block reset for a lockout period (proposed 15 min). After that, "Send OTP" issues a fresh OTP. OTP valid 10 min, single use, requests limited (e.g. 1/min).
- Lock kept in memory (restart clears it; a remote attacker cannot restart the server). Can be stored in the DB if wanted.
- `RESET_EMAIL` = move the hardcoded OTP recipient into a setting (config file in the app's data folder for the desktop app), keeping the current address as default.

### 4.2 Vendor key issuing (owner concern: vendor is not technical, no source code, no rebuilds)
Options compared:

| Option | Summary | Verdict |
|---|---|---|
| A | OTP goes to vendor, vendor chooses a new key by phone | Nothing to build, manual |
| B | Key tool + new build per customer | Needs rebuild — rejected by the owner's constraint |
| C | Signed recovery file | Good, more work |
| **Recommended** | **Machine-bound activation codes signed with Ed25519, plus a ready-made "Key Issuer" app for the vendor** | See below |

### 4.3 Recommended design (awaiting the owner's go-ahead)
1. Server shows a **Request Code** (identifies that machine).
2. Customer sends it to the vendor. Vendor opens the **Key Issuer** app (installable exe/dmg, no source), pastes the Request Code, picks customer + expiry, clicks Generate.
3. Customer pastes the **Activation Code** into the server. Server verifies the signature with an embedded **public key**, checks machine binding and expiry, then activates.
4. Same flow covers first install, lost key, new key, expired key.
5. **Admin password reset** uses the same mechanism (Request Code → vendor Reset Code). No email/OTP needed, removing gaps 3 and 4.

Why it is secure: server holds only a public key (cannot mint codes); private key stays in the Key Issuer, passphrase-protected; codes are machine-bound; expiry supported; works offline; no rebuilds; no shared secret in the installer.

Trade-offs the owner must accept:
- Activation code is ~100 characters, not 18 (a signature cannot fit in 18). Exactly-18-characters would require a shared secret in the app, which is extractable and much weaker.
- The Windows installer key page would be removed (the code depends on the machine, which only exists after install). Activation moves to first launch on both Mac and Windows.
- The vendor's **private key is the crown jewel**: back it up; if lost, existing installs cannot be re-licensed without an app update; if leaked, anyone can issue codes.
- No offline app is fully tamper-proof (a user with admin rights could patch the app). Code signing and asar integrity make that harder, not impossible.
- Machine ID changes after hardware change; vendor simply issues a new code.

---

## 5. Open questions (need the owner's answers)

1. **Go ahead with the recommended activation-code design (4.3)?** Or keep the simple 18-character key + OTP approach and only fix the gaps?
2. Should activation codes carry an **expiry date**, or be **permanent**?
3. Lockout duration after 3 wrong OTPs (if OTP is kept): 15 minutes OK?
4. Reset-email address: keep `srinivasa.kuchi@gmail.com`, or another? (Only relevant if OTP is kept.)
5. After a key reset, should the next launch ask for the new key (clear the activated flag)?
6. Add auto-generated random `JWT_SECRET` on first run (stored in the app data folder)? (gap 5 — recommended either way.)
7. Force a change of the default admin password at first login? (gap 6)

---

## 6. How to continue

**First, review and save the current work**
```bash
git status
git add -A
git commit -m "Add installation key activation (scrypt hash) and Windows installer key page"
```
Do this before any new work so the next changes are easy to review. Do NOT commit any file containing the real key.

**Then tell Bob which path to take** (paste one of these in a new chat and mention `AUTH_DESIGN_HISTORY.md`):

- **Path 1 — Recommended:** "Read AUTH_DESIGN_HISTORY.md. Build the signed activation-code design (section 4.3) with permanent licenses / with expiry. Include the Key Issuer app, admin password reset via vendor code, and updated guides."
- **Path 2 — Quick fixes only:** "Read AUTH_DESIGN_HISTORY.md. Keep the 18-character key. Add admin password reset via OTP, 3-attempt lockout of N minutes, `crypto.randomInt` OTP, RESET_EMAIL setting, and make the key reset work after activation."
- **Path 3 — Security basics first (small, independent):** "Read AUTH_DESIGN_HISTORY.md. Fix gaps 5 and 6 only (random JWT secret, force admin password change)."

**Before shipping any build, check**
- Run the installer once on a real Windows machine and look at the key page and the wrong-key message.
- Open the Electron login window on macOS and check the "Step 1 of 2" screen.
- Rebuild `better-sqlite3` for your platform if you want to run `node server.js` locally (the current binary in `server/node_modules` is not a macOS build).
- Remember the old hardcoded key `panicalarm@09` and the default JWT secret were public; treat any server that has run before as needing the new key.
