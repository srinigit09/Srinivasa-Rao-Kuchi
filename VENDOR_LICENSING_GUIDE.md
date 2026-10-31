# Vendor Licensing and Security Guide
### — Hospital Emergency Panic Alarm System (Server, Clients & Licensing Tool) —

This document is designed for **non-technical vendors, business owners, and managers**. It contains zero complex coding jargon and uses simple, real-world analogies to explain how your three installers operate, how to set them up, how to manage keys on both sides, and the step-by-step procedures for daily operations.

---

## Part 1: How the Licensing System Works (The Simple Analogy)

Your licensing system uses **Asymmetric Cryptography** (specifically a standard called *Ed25519*). Think of it like a secure **Lock & Key** system:

* **The Private Key (Your Master Stamp):** This is kept only in your private **Key Issuer** desktop app. This is like a high-security signature stamp that only you possess. You use it to stamp (sign) "Activation Codes" and "Reset Codes."
* **The Public Key (The Padlock):** This is built directly into the software you ship to the hospital (**Central Server**). It acts like a padlock. Anyone can look at this padlock, but only codes signed with your private **Master Stamp** can unlock it.
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
* **Where they live:** They are compiled directly inside the server application file (`server/license-keys.js`).
* **Security guarantee:** Since the customer's server contains *only* Public Keys, no matter how hard they look at the code, they can never reverse-engineer them to generate their own codes.

---

## Part 3: Installer 1 — The Vendor Key Issuer App (`Vendor.exe`)
*This is your private internal administrative app. Never send this installer to customers.*

### Step 3.1: Installation & First Launch
1. On your computer, run **`PanicAlarmKeyIssuer Setup.exe`** (or build and start it using the terminal `cd key-issuer && npm start`).
2. When the application window opens, it detects if a vault database has been initialized yet.
3. If this is the **very first launch**, you will be presented with the **Create Master Passphrase** screen.

### Step 3.2: Creating Your Master Passphrase & Keypairs (Done Once)
1. Choose a strong, secure passphrase of **at least 12 characters** (e.g., `AlphaOrangeHospital2026!`).
2. Type it into the input box and click **Create Vault**.
3. **What happens behind the scenes:** The app immediately runs a math generator that creates **3 unique keypairs** (3 private keys + 3 public keys). It encrypts the private keys with your passphrase and writes them to a secure local database file (`vault.json`).
4. *⚠️ CRITICAL: Write this passphrase down on a piece of paper and lock it in your office safe. If you lose this passphrase, your encrypted keys are lost forever, and you will not be able to issue any more licenses.*

### Step 3.3: Exporting Public Keys to your Server Code (Done Once)
1. Once unlocked, click on the **Export** tab or click **"Export license-keys.js"**.
2. A file browser will open. Navigate to your development folder's **`server/`** directory and click **Save**.
3. This writes the public keys into **`server/license-keys.js`** so your server builds will recognize your signature.

### Step 3.4: Daily Procedure — Signing Keys & Generating Activation Codes
When a hospital purchases your system and sends you their **Request Code**:
1. Open your **Key Issuer** app.
2. Enter your **Master Passphrase** to unlock it.
3. Go to the **"Issue License"** tab.
4. Fill in the following:
   * **Customer Name:** Enter the hospital name (e.g., `Mercy General Hospital`).
   * **Request Code:** Paste the exact Request Code they copied from their server screen.
   * **Expiration Date (Optional):** Pick a date if they purchased a 1-year or 3-year term. Leave it blank if they bought a **permanent** license.
5. Click **Generate Activation Code**.
6. Click **Copy Code** and paste it into an email or message to send back to the hospital.

### Step 3.5: Daily Procedure — Generating password Reset Codes
If a customer forgets their admin password and clicks "Forgot Password" on their server:
1. They will send you a **Reset Request Code**.
2. Unlock your **Key Issuer** app.
3. Go to the **"Reset Password"** tab.
4. Paste their Reset Request Code.
5. Click **Generate Reset Code**.
6. Copy this code and send it back to the customer. This single-use code lets them set a new password safely.

---

## Part 4: Installer 2 — The Central Server App (`Server.exe`)
*This is the central engine installed once on a hospital computer or server room machine.*

### Step 4.1: Installation
1. Provide the hospital's IT administrator with the single installer file: **`PanicAlarmServer Setup.exe`**.
2. The IT administrator runs the installer. It installs the background Node.js processes, SQLite database engines, and an administrative Electron window.
3. Once the setup finishes, the app launches automatically.

### Step 4.2: Configuring Properties (Optional)
Before starting, the hospital IT department can customize the server by placing a plain-text properties file named **`server.env`** in the same folder as the installed program. They can customize:
* **`PORT` (Default: `4000`):** If they already have another program using Port 4000, they can change this to `5000` or `8080`.
* **`DB_PATH`:** If they want to save the database on a secure, automated network backup drive (e.g., `D:\HospitalData\panic_alarm.db`) instead of the local hard drive.

### Step 4.3: Getting the Request Code & Activating
1. On launch, the server is locked. It displays a window saying: **"Activation Required."**
2. The screen shows a unique **Request Code** (e.g., `PANIC-REQ-A1B2-C3D4...`).
3. The IT admin copies this code and sends it to you (the vendor).
4. You generate the **Activation Code** (using Part 3.4) and send it back to them.
5. The IT admin pastes the Activation Code into their lock screen and clicks **Activate**.
6. The server validates the cryptographic signature with its internal padlock, saves the active license, and unlocks the login screen.

### Step 4.4: First-Time Login & Security Seeding
1. Once activated, the login screen appears.
2. The server reads the temporary file **`bootstrap.env`** (if provided next to the executable) to find the default admin credentials. If no file is provided, it seeds the default account:
   * **Username:** `admin`
   * **Password:** `admin@PanicAlarm2026`
3. The admin logs in using these credentials.
4. **Forced Password Change:** On successful first login, the application immediately forces the admin to type a strong, custom administrator password. 
5. Once saved, the default password is encrypted and overwritten in the database.
6. *🔒 IT Security Rule: After completing this first-run setup, the IT administrator should completely delete the `bootstrap.env` file from their computer for safety.*

---

## Part 5: Installer 3 — The Client Desktop App (`Client.exe`)
*This is the lightweight panic button application installed on nurse desks, doctor terminals, and reception PCs.*

### Step 5.1: Rollout & Installation
1. Provide the hospital with the desktop client installer: **`PanicAlarmClient Setup.exe`**.
2. IT administrators can run this installer on as many individual computers (desks, reception areas, rooms) as they want.
3. **No licensing or Activation Codes are required on these computers.** They are unlimited and free to install.

### Step 5.2: LAN Network Configuration
1. When a staff member launches the **Client App** for the first time, it will ask for the **Server's IP Address**.
2. The IT administrator simply types in the Central Server's local network IP address and port (e.g., `192.168.1.50:4000`).
3. The Client App instantly establishes a persistent, secure websocket connection to the Central Server.
4. The client is now fully active, showing the green status indicator. Staff can now trigger alarms, view location floor plans, and receive emergency notification alerts.

---

## Part 6: Detailed Properties Files & Configuration Guide
Your system allows full customizability of network connections, database storage, email alerts, and administrative user credentials. These configurations are split into **Raw Properties Files** (for IT setup) and the **Visual Admin Dashboard** (for daily use).

### A. Raw Properties Files (On the Central Server)
Hospital IT administrators can place these plain-text configuration files in the central server's installation directory (next to `PanicAlarmServer.exe`) to modify settings.

#### 1. `server.env` — Network & Storage Settings
Open this file in Notepad to configure IP bindings, database paths, and ports:
* **`HOST` (Updating Server IP Binding):**
  * *Default:* `0.0.0.0` (Binds the server to **all** network cards on that computer, letting any hospital client PC connect to it).
  * *Custom:* Change to `127.0.0.1` if you want to block all network access and only allow runs on the local machine for testing.
* **`PORT` (Updating Server Port):**
  * *Default:* `4000`.
  * *Custom:* If port 4000 is occupied by another system, change this line to e.g., `PORT=8080`. (Note: If you change this, your Client Apps must also connect to port `8080`).
* **`DB_PATH` (Database Location):**
  * *Default:* Saves to the local computer's secure AppData folder.
  * *Custom:* Set `DB_PATH=D:\Backups\Database\panic_alarm.db` to save the SQLite database on an external backup drive or network-attached storage (NAS).

#### 2. `bootstrap.env` — Initial Security & Admin Credentials
This file is used **only once** when launching the server on a blank database to set up the default accounts:
* **`ADMIN_USERNAME` (Updating Default Username):** Change this line to set the initial admin account name (e.g., `ADMIN_USERNAME=hospital_root`).
* **`ADMIN_PASSWORD` (Updating Default Password):** Change this line to set a temporary default password (e.g., `ADMIN_PASSWORD=SeedPass2026!`).
* **`JWT_SECRET` (Security Token Key):** Uncomment and set this to a long random secret key if you need static token verification across multiple independent server clusters. If left blank, a random key is securely generated for them.
* *🔒 IT Security Rule: After completing the first-run installation and changing the password in the UI, delete `bootstrap.env` for safety.*

---

### B. Visual Admin Dashboard Configuration (No Files Needed!)
For daily administration, your non-technical users do **not** edit any text files. They can manage credentials and alerts visually:

#### 1. How to Update Admin Username & Password
1. Log in to the Central Server's **Admin Panel** web interface.
2. Go to **Settings** / **Change Password**.
3. Type in the current password, enter the new strong password, and click **Save**.
4. The database instantly updates, and the old credentials are void.

#### 2. How to Update Client Names, Room IPs, and Contact Emails
You can customize alert details and routing directly inside the Admin Panel:
1. Open the Admin Panel and navigate to the **Clients Management** tab.
2. Click **"Add Client Station"** or click **"Edit"** on an existing station.
3. You can visually customize the following fields:
   * **Station Name / User Name:** (e.g., `ER Desk 1`)
   * **Location / Room Number:** (e.g., `Room 102`)
   * **Hospital Code:** (e.g., `MERCY-01`)
   * **System Limit:** Max client allowance limit (e.g., `50`).
   * **Contact Email (Email Updates):** Type in the staff or IT administrator's email address (e.g., `er-nurse-lead@hospital.com`).
   * **Email Logs / Email Reports Checkboxes:** Turn on/off whether this specific station should receive automated email alert history and monthly status reports.

---

### C. Client-Side Config File (`panic-alarm-config.json`)
The Client App (`Client.exe`) does not use raw `.env` files. It saves all parameters inside a local JSON file in its AppData profile.
* **How to configure:** When a client app is launched for the first time, a visual settings window prompts the installer to type the **Server URL**, **Hospital Code**, **Station User Name**, **Room Number**, and **Staff Role** (Doctor, Nurse, etc.).
* **Automated Deployments:** For mass-rollouts across 100+ computers, hospital IT can simply configure one client PC, copy its generated **`panic-alarm-config.json`** file, and deploy it to the AppData directories of the other 99 computers to configure them instantly!

---

## Part 7: Essential Security Rules for Your Team

To keep your licensing system 100% secure, please make sure your sales and management team follows these three rules:

1. **NEVER share the Key Issuer installer or files with anyone outside your company.** This is your company's master signing key.
2. **NEVER write your Key Issuer master passphrase in an email or plain text file.** If a hacker obtains both your vault file and your passphrase, they can print their own software keys.
3. **Backup your vault.** If your local computer breaks, you can lose your vault. In the Key Issuer app, backup your 3 keys and store the backup file (`panic-alarm-key-backup.json`) on an offline USB drive in your office safe. You can restore your keys on any new computer by importing this backup.
