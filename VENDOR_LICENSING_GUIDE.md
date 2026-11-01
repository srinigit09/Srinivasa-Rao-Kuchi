# Vendor Licensing and Security Guide
### — Hospital Emergency Panic Alarm System (Server, Clients & Licensing Tool) —

This document is designed for **non-technical vendors, business owners, and managers**. It contains zero complex coding jargon and uses simple, real-world analogies to explain how your three installers operate, how to set them up, how to manage keys on both sides, and the step-by-step procedures for daily operations.

---

## Part 1: How the Licensing System Works (The Simple Analogy)

Your licensing system uses **Asymmetric Cryptography** (specifically a standard called *Ed25519*). Think of it like a secure **Lock & Key** system:

* **The Private Key (Your Master Stamp):** This is kept only in your private **Key Issuer** desktop app. This is like a high-security signature stamp that only you possess. You use it to stamp (sign) "Activation Codes" and "Reset Codes."
* **The Public Key (The Padlock):** This is shipped alongside the software you give to the hospital (**Central Server**) as a small file called `license-keys.js`. It acts like a padlock. Anyone can look at this padlock, but only codes signed with your private **Master Stamp** can unlock it.
* **The Request Code (The Identification Tag):** When a hospital installs your server, it generates a unique "identification tag" based on their specific machine's physical parts. This ensures that an Activation Code created for Hospital A cannot be copied and used by Hospital B.

---

## Part 2: Key Management (How Keys are Stored on Both Sides)

To maintain absolute security while keeping the business flexible, the keys are divided into two isolated parts:

```
┌────────────────────────────────────────────────────────┐             ┌─────────────────────────────┐
│             VENDOR'S MACHINE (Private)                 │             │ CUSTOMER'S COMPUTER (Public)│
│                                                        │             │                             │
│  ┌────────────────────┐      2. Export Public Keys     │             │     ┌─────────────────┐     │
│  │   KEY ISSUER APP   │ ─────────────────────────────┼────────────┼───► │ CENTRAL SERVER  │     │
│  │ ├─ Private Keys    │                              │             │     │ (license-keys.js)     │
│  │ └─ Public Keys     │                              │             │     └─────────────────┘     │
│  └────────────────────┘                              │             │              ▲                │
│            │                                         │             │              │ Verify         │
│            ▼                                         │             │              │ Signature      │
│  Generates Activation Codes  ────────────────────────┼── Shipped ──┼──────────────┘                │
│  using Private Key                                   │   to Client │                               │
└────────────────────────────────────────────────────────┘             └─────────────────────────────┘
```

### A. The Vendor Side (Your Office)
* **What you hold:** 3 pairs of keys (Private and Public).
* **Where they live:** They are saved on your computer in an encrypted vault (`vault.json`).
* **How they are protected:** They are locked behind a **Master Passphrase** (chosen by you on first startup). Even if someone steals your computer, they cannot access your keys without knowing this passphrase.
* **Why there are 3 keys:** We pre-generate 3 keys so that if Key 1 is ever leaked or compromised, you can switch to Key 2 inside the app, and it will immediately work for all customers **without needing a new software release**.

### B. The Customer Side (The Hospital)
* **What they hold:** ONLY the 3 **Public Keys**.
* **Where they live:** A file called `license-keys.js` placed next to the server application. The server reads this file at startup — no rebuild is ever needed to update or replace keys.
* **Security guarantee:** Since the customer's server contains *only* Public Keys, no matter how hard they look at the code, they can never reverse-engineer them to generate their own codes.

---

## Part 3: Essential Security Rules for Your Team

To keep your licensing system 100% secure, please make sure your sales and management team follows these three rules:

1. **NEVER share the Key Issuer installer or files with anyone outside your company.** This is your company's master signing key.
2. **NEVER write your Key Issuer master passphrase in an email or plain text file.** If a hacker obtains both your vault file and your passphrase, they can print their own software keys.
3. **Backup your vault.** If your local computer breaks, you can lose your vault. In the Key Issuer app, backup your 3 keys and store the backup file (`panic-alarm-key-backup.json`) on an offline USB drive in your office safe. You can restore your keys on any new computer by importing this backup.

---

## Part 4: Installer 1 — The Vendor Key Issuer App (`Vendor.exe`)
*This is your private internal administrative app. Never send this installer to customers.*

### Step 4.1: Installation & First Launch
1. On your computer, run and install **`PanicAlarmKeyIssuer Setup.exe`** (or open the already installed application).
2. When the application window opens, it detects if a vault database has been initialized yet.
3. If this is the **very first launch**, you will be presented with the **Create Master Passphrase** screen.

### Step 4.2: Creating Your Master Passphrase & Keypairs (Done Once)
1. Choose a strong, secure passphrase of **at least 12 characters** (e.g., `<YourWord><YourNumber><Symbol>`).
2. Type it into the input box and click **Create Vault**.
3. **What happens behind the scenes:** The app immediately runs a math generator that creates **3 unique keypairs** (3 private keys + 3 public keys). It encrypts the private keys with your passphrase and writes them to a secure local database file (`vault.json`).
4. *⚠️ CRITICAL: Write this passphrase down on a piece of paper and lock it in your office safe. If you lose this passphrase, your encrypted keys are lost forever, and you will not be able to issue any more licenses.*

### Step 4.3: Exporting Public Keys (Done Once per Key Generation)
1. Once unlocked, go to the **Keys** tab and click **"Export license-keys.js"**.
2. Save the file anywhere on your computer.
3. Copy this `license-keys.js` file to the **same folder as the `PanicAlarmServer.exe`** on the server machine. The server reads it automatically at startup — no rebuild required.

> **This replaces the old "build from source" step entirely.** You ship one server installer and update keys by dropping a new `license-keys.js` next to it.

### Step 4.4: Daily Procedure — Signing Keys & Generating Activation Codes
When a hospital purchases your system and sends you their **Request Code**:
1. Open your **Key Issuer** app.
2. Enter your **Master Passphrase** to unlock it.
3. Go to the **"Issue License"** tab.
4. Fill in the following:
   * **Customer Name:** Enter the hospital or clinic name.
   * **Request Code:** Paste the exact Request Code they copied from their server screen.
   * **Expiration Date (Optional):** Pick a date if they purchased a 1-year or 3-year term. Leave it blank if they bought a **permanent** license.
5. Click **Generate Activation Code**.
6. Click **Copy Code** and paste it into an email or message to send back to the hospital.

### Step 4.5: Daily Procedure — Generating Password Reset Codes
If a customer forgets their admin password and clicks "Forgot Password" on their server:
1. They will send you a **Reset Request Code**.
2. Unlock your **Key Issuer** app.
3. Go to the **"Reset Password"** tab.
4. Paste their Reset Request Code.
5. Click **Generate Reset Code**.
6. Copy this code and send it back to the customer. This single-use code lets them set a new password safely.

---

## Part 5: Installer 2 — The Central Server App (`Server.exe`)
*This is the central engine installed once on a hospital computer or server room machine.*

### Step 5.1: Installation
1. Provide the hospital's IT administrator with the single installer file: **`PanicAlarmServer Setup.exe`**.
2. The IT administrator runs the installer. It installs the background Node.js processes, SQLite database engines, and an administrative Electron window.
3. Once the setup finishes, the app launches automatically.

### Step 5.2: Configuring Properties (Optional)
Before starting, the hospital IT department can customize the server by placing a plain-text properties file named **`server.env`** in the same folder as the installed program. They can customize:
* **`PORT`:** Set the port the server listens on. Check which ports are free on the server machine and pick one (e.g. `5000`, `8080`).
* **`DB_PATH`:** If they want to save the database on a secure, automated network backup drive (e.g., `D:\HospitalData\panic_alarm.db`) instead of the local hard drive.

### Step 5.3: Placing the Public Keys File (Required Before First Launch)
Before the customer starts the server for the first time, the `license-keys.js` file you exported from the Key Issuer (Step 4.3) must be placed next to the server executable:

* **Windows:** same folder as `PanicAlarmServer.exe`
* **macOS:** same folder as the `PanicAlarmServer.app` package

The server will detect this file at startup and load your public keys from it. Without this file the server has no keys configured and will not accept any Activation Codes.

### Step 5.4: Getting the Request Code & Activating
1. On launch, the server is locked. It displays a window saying: **"Activation Required."**
2. The screen shows a unique **Request Code**.
3. The IT admin copies this code and sends it to you (the vendor).
4. You generate the **Activation Code** (using Part 4.4) and send it back to them.
5. The IT admin pastes the Activation Code into their lock screen and clicks **Activate**.
6. The server validates the cryptographic signature with its internal padlock, saves the active license, and unlocks the login screen.

### Step 5.5: First-Time Login & Security Seeding
1. Once activated, the login screen appears.
2. The server reads the **`bootstrap.env`** file (placed next to the executable before first launch) to find the admin credentials you set. The file must contain:
   * **`ADMIN_USERNAME`** — the username you choose for the admin account.
   * **`ADMIN_PASSWORD`** — the password you choose for the admin account.
3. The admin logs in using those credentials.
4. **Forced Password Change:** On successful first login, the application immediately forces the admin to type a new, strong administrator password.
5. Once saved, the seeded password is overwritten and the `bootstrap.env` file has no further effect.
6. *🔒 IT Security Rule: After completing this first-run setup, the IT administrator should completely delete the `bootstrap.env` file from their computer for safety.*

---

## Part 6: Installer 3 — The Client Desktop App (`Client.exe`)
*This is the lightweight panic button application installed on nurse desks, doctor terminals, and reception PCs.*

### Step 6.1: Rollout & Installation
1. Provide the hospital with the desktop client installer: **`PanicAlarmClient Setup.exe`**.
2. IT administrators can run this installer on as many individual computers (desks, reception areas, rooms) as they want.
3. **No licensing or Activation Codes are required on these computers.** They are unlimited and free to install.

### Step 6.2: LAN Network Configuration
1. When a staff member launches the **Client App** for the first time, it will ask for the **Server's IP Address**.
2. The IT administrator types in the Central Server's local network IP address and port. The IP and port are shown on the server app's login screen once the server is running (e.g. `http://<server-ip>:<port>`).
3. The Client App instantly establishes a persistent, secure websocket connection to the Central Server.
4. The client is now fully active, showing the green status indicator. Staff can now trigger alarms, view location floor plans, and receive emergency notification alerts.

---

## Part 7: How to Reset or Change Your Master Passphrase

Because your Master Passphrase is used as a mathematical formula to encrypt your **Private Keys** inside `vault.json`, **your passphrase is the actual security lock**.

This means there is **no "forgot password" reset button, recovery email, or back-door** in the Key Issuer app. If you completely lose your passphrase, the private keys are locked forever.

However, depending on your situation, here is exactly how you can safely **change** or **reset** your setup:

### Scenario A: You know your old passphrase and just want to CHANGE it
If you are rotating employees or updating security and want to set a new passphrase:
1. Open the Key Issuer app, unlock it, and make sure you have **exported** and saved offline backups of your active keys (using the **"Backup Key"** buttons).
2. Close the Key Issuer app.
3. Delete the old local database file (`vault.json`) from your computer (see **Part 10, Section A** for its exact path).
4. Reopen the Key Issuer app. Since `vault.json` was deleted, it will treat this as a fresh start and ask you to **"Create Keys."**
5. Enter your **new Master Passphrase** and click Create. (This generates a brand-new set of 3 master keys).
6. Click **"Export license-keys.js"** and place the file next to `PanicAlarmServer.exe` on each customer's server machine. Restart the server app. No installer rebuild is needed.
*Note: Any hospital servers already activated in the field will continue to run with their existing license. Future activations will use the new keys.*

---

### Scenario B: You FORGOT your passphrase and are locked out
If you are completely locked out of the Key Issuer app, you must reset your database and follow one of these two recovery paths:

#### Recovery Path 1: If you have an offline Backup File (`panic-alarm-key-backup.json`)
If you made a backup file before getting locked out, and you still remember the passphrase that was active when you created that backup:
1. Delete the local `vault.json` database file from your computer (see **Part 10, Section A** for its exact path).
2. Launch the Key Issuer app and set up a fresh vault with your **new passphrase**.
3. Go to the **Restore** tab, select your backup JSON file, and type in the passphrase that belongs to that backup.
4. Your active private keys are restored!

#### Recovery Path 2: If you do NOT have any backups
If you have no backup file and forgot your passphrase, you must start from scratch:
1. Delete the local `vault.json` database file from your computer (see **Part 10, Section A** for its exact path).
2. Launch the Key Issuer app.
3. Select a **new Master Passphrase** and click Create (this generates 3 fresh keys).
4. Click **"Export license-keys.js"** and place the new file next to `PanicAlarmServer.exe` on each customer's server machine. Restart the server.
*⚠️ Crucial Warning: Because you have brand-new keys, any existing customer servers already activated in the field cannot accept your new Activation Codes until they have the new `license-keys.js` file placed next to their server executable and the server is restarted.*

---

## Part 8: Disaster Recovery & Business Continuity Plan

As a business owner, you must have a plan for worst-case scenarios, such as office fires, local computer hard drive failures, or the complete loss of your Master Passphrase. Here is how your system is pre-engineered to withstand these disasters:

### A. What happens to your existing hospital clients if your computer crashes?
* **They are 100% unaffected.**
* Because your licensing system is **fully offline** (the Central Server does *not* ping your office over the internet to check its license), active hospital servers will continue to run with **zero downtime or interruptions**. They can still trigger alarms, log events, and log in to their panels normally.

---

### B. Moving the Key Issuer to a New Computer (No Keys Lost)
If you are upgrading your office computer or moving to a new machine, you do **not** need to generate new keys or rebuild any installer. Simply transfer the vault:

1. On the **old computer**, locate `vault.json` (see **Part 10, Section A** for the exact path).
2. Copy that single file to a USB drive or secure transfer method.
3. On the **new computer**, install the Key Issuer app and let it open once (it will show the "Create Keys" screen — do not create yet).
4. Close the app, paste the `vault.json` into the same AppData path on the new computer.
5. Reopen the Key Issuer app — it will show the **Unlock** screen. Enter your passphrase. All 3 keys are restored exactly as they were.

No new `license-keys.js` needed. No server restart needed. Nothing changes for customers.

---

### C. The 3-Step Recovery Plan (If you completely lose your keys and backups)
If your computer is wiped and you have no backups, you can start fresh without disrupting active clients:

1. **Start Fresh on a New Computer:** Open the Key Issuer app on a new computer, choose a new Master Passphrase, and let it generate a **brand-new set of 3 keypairs**.
2. **Update Public Keys on Customer Servers:** Export `license-keys.js` from the new Key Issuer and send it to each customer's IT admin to place next to their `PanicAlarmServer.exe`. A server restart is all that is needed — no installer rebuild, no reinstall.
3. **Re-activate Old Customers (Only if they need a new code):** If a customer needs a new Activation Code after the key change, they send you their current Request Code and you issue a fresh one with the new keys. Their server data, logs, and history remain 100% intact.

---

### D. The "Rule of Threes" Backup Strategy (Preventing Disasters)
Your Key Issuer's backup file (`panic-alarm-key-backup.json`) is **heavily encrypted** using state-of-the-art cryptography (scrypt + AES-256-GCM) with your Master Passphrase. This means the file is mathematically impossible to read without knowing your passphrase.

Because the file is 100% secure, you should store copies of your backup file in **three different locations**:
1. **On your primary workstation** (inside your local app database).
2. **On a physical USB drive** locked in your office safe.
3. **On your company's secure cloud storage** (such as OneDrive, Google Drive, iCloud, or a secure password manager like 1Password or Bitwarden). Even if the cloud account is compromised, hackers only get a heavily encrypted file that they cannot open.

*By adhering to this backup strategy, you are 100% immune to hardware failures, office fires, or lost files!*

---

## Part 9: FAQ — The Keys Screen

This section answers common questions about the buttons on the **Keys** tab of the Key Issuer app.

### Q1: What does "Backup…" do?
Think of it as **photocopying your key and locking the copy in a safe.**

Clicking **Backup…** saves an encrypted file (e.g., `panic-alarm-key-2-backup.json`) to wherever you choose. The private key inside that file is locked with your Master Passphrase — nobody can read it without knowing your passphrase. Save this file on an offline USB drive and lock it away.

> **Do this for every key, every time you generate a new vault.**

### Q2: If we click "Backup…" on the Active key (Key 1), what happens?
**Nothing changes.** Key 1 stays on your computer, fully active. You can keep issuing codes as normal.

You are simply making an **offline copy** in case your computer breaks or is stolen. If that ever happens, you bring the backup file to a new computer and restore Key 1 from it so you can sign codes again straight away.

> Note: Key 1 has no "Remove private part" button — the app deliberately prevents you from accidentally deleting your active signing key.

### Q3: What does "Remove private part" do?
It **deletes the private half of a spare key from this computer**, leaving only the public key behind.

You would do this for Key 2 and Key 3 after you have backed them up. Here is why that is smart:

* Spare keys sit idle — you only need them if Key 1 is ever compromised.
* If a hacker steals your laptop, they find **zero trace** of Key 2 or Key 3.
* The private keys are safe offline on your USB backup.

To use a spare key later, simply restore it from its backup file first (see Q4).

### Q4: What does "Restore a key from backup" do?
It **brings a key's private part back** from a backup file onto your computer.

**When would you use this?**
- Key 2 or 3 was removed via "Remove private part" for offline safety, but now you need to switch to it (e.g., Key 1 was leaked).
- You are on a new computer and want to restore Key 1 so you can issue codes again.

**How it works:**
1. Click **"Restore a key from backup"**.
2. Select the backup `.json` file.
3. Enter your Master Passphrase.
4. Done — the key's private part is back on this computer.

For spare keys, you can then click **"Use this key"** to make it your new active signing key.

### Q5: Can we have 9 keys instead of 3 key pairs?
**Technically yes, but 3 is the right number.**

- You only need to rotate keys if one is ever leaked or compromised — a rare event in a professionally run app.
- 3 keys already gives you **two full emergency rotations** without any server reinstall. Simply export a new `license-keys.js` and drop it next to the server executable.
- Adding more keys (e.g., 9) just means more backups to manage with no real security benefit.

**Stick with 3.**

---

## Part 10: File Location & Property Configuration Reference

Here is the exact technical reference guide showing where every configuration, properties, database, and vault file is stored on the system, along with the specific parameters you can edit inside them.

### A. Summary of File Locations (Windows & macOS Paths)

| Component | File Name | Purpose / Description | Location on Windows (Default) | Location on macOS (Default) |
| :--- | :--- | :--- | :--- | :--- |
| **Vendor App** | `vault.json` | Stores encrypted private signing keys. | `C:\Users\<Username>\AppData\Roaming\PanicAlarmKeyIssuer\vault.json` | `/Users/<Username>/Library/Application Support/PanicAlarmKeyIssuer/vault.json` |
| **Server App** | `license-keys.js` | Public keys used to verify Activation Codes. Drop next to the exe to update without rebuilding. | Place directly in the installation folder (next to `PanicAlarmServer.exe`) | Place directly in the installation folder (next to the main App package) |
| **Server App** | `server.env` | Configures port, IP bind, and database directory. | Place directly in the installation folder (next to `PanicAlarmServer.exe`) | Place directly in the installation folder (next to the main App package) |
| **Server App** | `bootstrap.env` | One-time initial admin username and password seed. | Place directly in the installation folder (next to `PanicAlarmServer.exe`) | Place directly in the installation folder (next to the main App package) |
| **Server App** | `panic_alarm.db` | Core SQLite database storing accounts, logs, etc. | `C:\Users\<Username>\AppData\Roaming\PanicAlarmServer\data\panic_alarm.db` | `/Users/<Username>/Library/Application Support/PanicAlarmServer/data/panic_alarm.db` |
| **Client App** | `panic-alarm-config.json` | Stores essential server IP / URL connection properties. | `C:\Users\<Username>\AppData\Roaming\PanicAlarmClient\panic-alarm-config.json` | `/Users/<Username>/Library/Application Support/PanicAlarmClient/panic-alarm-config.json` |

*💡 Windows Tip: To quickly open the AppData folder on Windows, press `Win + R`, type `%appdata%`, and hit Enter.*

---

### B. Property Configuration Reference (What you can edit in the files)

#### 1. `server.env` (Server Network & Database Settings)
Open this file in Notepad next to the executable to customize server launch properties. *Note: These settings cannot be changed via any UI because the server needs them to start in the first place.*
* **`PORT`:** Sets the port the server listens on. Choose any free port on the server machine (e.g., `PORT=5000`).
* **`HOST`:** Sets network IP binding. Use `0.0.0.0` to allow client apps on other network computers to connect, or `127.0.0.1` for localhost only.
* **`DB_PATH`:** Overrides the database storage path (e.g., `DB_PATH=D:\Backups\Database\panic_alarm.db`).

#### 2. `bootstrap.env` (First-Run Admin Seeding Settings)
Open this file in Notepad next to the executable to set the first administrator account. *Note: These values are only used on the very first launch to create the admin account.*
* **`ADMIN_USERNAME`:** The username for the admin account (choose your own).
* **`ADMIN_PASSWORD`:** The password for the admin account (choose a strong password).
* **`JWT_SECRET`:** Optional custom token signing secret. Leave commented out to auto-generate.

#### 3. `panic-alarm-config.json` (Client Connection Settings)
Used to back up or mass-deploy the network configuration required to launch and connect the Client app to the server:
* **`serverUrl`:** The server URL shown on the server app's login screen after startup (format: `http://<server-ip>:<port>`).
* *Note: Staff details, room numbers, station names, and roles are configured visually inside the application GUI and are NOT managed in raw properties files.*

---

## Part 11: Rebuilding the Installers (For Code or Configuration Changes)

Most day-to-day operations — key rotation, port changes, admin credentials — do **not** require a rebuild. They are handled by dropping a file or editing a `.env` file next to the executable.

A rebuild is only needed when the **application code itself changes** (e.g. a new feature, a bug fix, or a UI update delivered by your development team).

---

### When you DO need to rebuild

| Situation | Rebuild needed? | What to do instead |
| :--- | :---: | :--- |
| Rotate signing keys (Key 1 → Key 2) | ❌ No | Export `license-keys.js` from Key Issuer, drop next to server exe, restart |
| Change server port or host | ❌ No | Edit `server.env` next to the server exe, restart |
| Change admin username / password (first run) | ❌ No | Edit `bootstrap.env` next to the server exe before first launch |
| Move Key Issuer to a new computer | ❌ No | Copy `vault.json` to the new machine (see Part 8B) |
| Application code update (new features, bug fixes) | ✅ Yes | Run the rebuild script below |
| UI or behaviour change from your dev team | ✅ Yes | Run the rebuild script below |

---

### How to rebuild — Server App

The `rebuild` script at the root of the project folder handles dependencies and packaging in one step.

**On Windows** — double-click `rebuild.bat`

**On macOS** — open Terminal, navigate to the project folder, and run:
```
bash rebuild.sh
```

The new installer will appear in:
* **Windows:** `server/dist/PanicAlarmServer Setup <version>.exe`
* **macOS:** `server/dist/PanicAlarmServer-<version>-arm64.dmg`

After distributing the new installer, customers run it as an **in-place upgrade** — their database, logs, and configuration are fully preserved.

---

### How to rebuild — Client App

If the client app code changes, build it from the project folder:

**On Windows:**
```
cd client
npm install
npm run build-win
```

**On macOS:**
```
cd client
npm install
npm run build-mac
```

The new installer will appear in `client/dist/`.

---

### How to rebuild — Key Issuer App

If the Key Issuer code changes, build it from the project folder:

**On Windows:**
```
cd key-issuer
npm install
npm run build-win
```

**On macOS:**
```
cd key-issuer
npm install
npm run build-mac
```

The new installer will appear in `key-issuer/dist/`.

> ⚠️ **Important:** Rebuilding the Key Issuer does **not** affect `vault.json`. Your existing keys and issued-code history are stored separately in AppData and are untouched by a reinstall.
