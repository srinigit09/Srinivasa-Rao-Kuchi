# Vendor Licensing and Security Guide
### — Hospital Emergency Panic Alarm System (Server & Licensing Tool) —

This document is designed for **non-technical vendors, business owners, and managers**. It contains zero complex coding jargon and uses simple, real-world analogies to explain how your licensing and password reset security works, how keys are managed on both sides, and how you can run your business smoothly with just a few clicks.

---

## 1. How the Licensing System Works (The Simple Analogy)

Your licensing system uses **Asymmetric Cryptography** (specifically a standard called *Ed25519*). Think of it like a secure **Lock & Key** system:

* **The Private Key (Your Master Stamp):** This is kept only in your private **Key Issuer** desktop app. This is like a high-security signature stamp that only you possess. You use it to stamp (sign) "Activation Codes."
* **The Public Key (The Padlock):** This is built directly into the software you ship to the hospital (**Central Server**). It acts like a padlock. Anyone can look at this padlock, but only codes signed with your private **Master Stamp** can unlock it.
* **The Request Code (The Identification Tag):** When a hospital installs your server, it generates a unique "identification tag" based on their specific machine's physical parts. This ensures that an Activation Code created for Hospital A cannot be copied and used by Hospital B.

---

## 2. Key Management (How Keys are Stored on Both Sides)

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
* **Where they live:** They are saved on your computer in an encrypted vault.
* **How they are protected:** They are locked behind a **Master Passphrase** (chosen by you on first startup). Even if someone steals your computer, they cannot access your keys without knowing this passphrase.
* **Why there are 3 keys:** We pre-generate 3 keys so that if Key 1 is ever leaked or compromised, you can switch to Key 2 inside the app, and it will immediately work for all customers **without needing a new software release**.

### B. The Customer Side (The Hospital)
* **What they hold:** ONLY the 3 **Public Keys**.
* **Where they live:** They are compiled directly inside the server application file (`server/license-keys.js`).
* **Security guarantee:** Since the customer's server contains *only* Public Keys, no matter how hard they look at the code, they can never reverse-engineer them to generate their own codes.

---

## 3. Step-by-Step: First-Time Setup (Done ONCE by Vendor)

Follow these steps when you are setting up your business system for the first time:

### Step 3.1: Start the Key Issuer & Create Your Vault
1. Open your terminal in the `key-issuer` folder and start the application:
   ```bash
   cd key-issuer
   npm install
   npm start
   ```
2. On the screen, the **Key Issuer** app will ask you to **"Create Keys"**.
3. Choose a strong **Master Passphrase** (at least 12 characters). 
   *⚠️ Write this passphrase down and store it in a physical safe! If you lose this, you can never issue codes for your software again.*
4. Click **Create**. This automatically creates your 3 Master Keys and saves them.

### Step 3.2: Link Your Keys to the Server Build
1. In the Key Issuer app, click the button labeled **"Export license-keys.js"**.
2. A window will pop up. Navigate to the **`server/`** folder in your project and click **Save** (this replaces the empty placeholder file).
3. Close the Key Issuer app.

### Step 3.3: Build the Installer to send to Customers
1. Go to your main project folder.
2. **Double-click** the file named:
   * **`rebuild.bat`** (if you are on Windows)
   * **`rebuild.sh`** (if you are on macOS)
3. Wait for the window to finish compiling.
4. Your customer setup file is ready in **`server/dist/`** (e.g. `PanicAlarmServer Setup.exe`). This is the single file you will distribute to your hospital customers!

---

## 4. Step-by-Step: Activating a Customer (When they buy)

When a hospital purchases your software and installs it, they will see a lock screen asking for activation.

### Step 4.1: Customer sends you their Request Code
1. The hospital admin opens the newly installed server app.
2. On the screen, they copy their unique **Request Code** (a string of letters and numbers like `PANIC-REQ-XXXX-XXXX...`).
3. They email, text, or WhatsApp this code to you.

### Step 4.2: You generate their Activation Code
1. Open your local **Key Issuer** app.
2. Type in your **Master Passphrase** to unlock your vault.
3. In the **"Issue License"** tab:
   * **Customer Name:** Enter the hospital name (e.g., `City General Hospital`).
   * **Request Code:** Paste the Request Code sent by the hospital.
   * **Expiration Date:** Pick a date if they bought a 1-year license, or leave it blank if they bought a **permanent** license.
4. Click **Generate Activation Code**.
5. Copy the generated code (a long string of characters) and send it back to the customer.

### Step 4.3: Customer enters the code to Activate
1. The hospital admin pastes your Activation Code into their server screen and clicks **Activate**.
2. The server instantly unlocks. The system is activated!

---

## 5. Step-by-Step: Re-generating & Resetting Licenses

### Scenario A: The hospital's license expires
If you set an expiration date (e.g. 1 year) and their license runs out, their server will lock again.
* **How to fix:** 
  1. The hospital admin copies their current Request Code from the screen.
  2. You paste it into your Key Issuer, select a new future expiration date (or make it permanent), and click **Generate**.
  3. They paste the new Activation Code, and they are renewed instantly!

### Scenario B: The hospital upgrades their hardware (Lost License)
Because the Request Code is bound to their physical machine parts, if the hospital replaces their server motherboard or hard drive, their Request Code will change, and their license will show as invalid.
* **How to fix:**
  1. Simply ask them to send their new Request Code.
  2. Generate a fresh Activation Code for their new hardware free of charge.

---

## 6. Admin Password Reset (Forgot Password Flow)

If the hospital administrator forgets their login password, they cannot access the system. To prevent unauthorized hackers from resetting passwords, this is also handled through your secure offline Key Issuer.

```
[ Hospital Server Screen ]                             [ Vendor Office ]
     "Forgot Password?"                                  Key Issuer App
             │                                                 │
      Generates Reset                                          │
       Request Code  ───────── Sent by Email/Phone ───────────►│
             │                                                 │
             │                                         Generates One-Time
             │                                             Reset Code
             │                                                 │
      Pastes Reset   ◄──────── Sent back to Admin ─────────────┘
       Code to unlock
             ▼
     Set New Password
```

### Step-by-Step Password Reset:
1. **On the Server Screen:** The hospital admin clicks **"Forgot Password?"** on the login window.
2. The server displays a unique **Reset Request Code** (different from their activation code).
3. The customer sends this Reset Request Code to you.
4. **On Your Key Issuer:**
   * Go to the **Reset Password** section in your Key Issuer app.
   * Paste the Reset Request Code and click **Generate Reset Code**.
5. You send this temporary, single-use Reset Code back to the customer.
6. **On the Server Screen:** The admin pastes the Reset Code. The server verifies your signature and immediately unlocks a secure screen where they can type in a **new password**. 
7. Once they click save, the Reset Code becomes void and can never be reused.

---

## 7. Configuration Properties (Customizations)

Your software comes with two properties files in the **`server/`** folder. These are plain text files that hospital IT departments can easily edit using Notepad to configure settings without needing to build any code:

### File 1: `server.env` (Network & Database Customization)
IT administrators can open this file to configure how the server connects to their network:
* **`PORT` (Default: `4000`):** If the hospital already has another software using Port 4000, they can change this to `5000` or any other number.
* **`HOST` (Default: `0.0.0.0`):** Allows any computer inside the hospital network to connect.
* **`DB_PATH`:** If the hospital wants to save their database on a secure, automated backup drive (e.g. `D:\Backups\panic_alarm.db`), they can specify that path here.

### File 2: `bootstrap.env` (First-Launch Default Credentials)
This file is used **only once** on the very first startup of the application:
* **`ADMIN_USERNAME` / `ADMIN_PASSWORD`:** Sets the default username and password (`admin` / `admin@PanicAlarm2026`) to initialize the database.
* **Security Recommendation:** Once the app runs for the first time and the database is created, the administrator must change their password through the app's visual interface. Once changed, they can **completely delete or wipe `bootstrap.env`** from their disk for security.

---

## 8. Essential Security Rules for Your Team
To keep your licensing system 100% secure, please make sure your sales and management team follows these three rules:

1. **NEVER share the Key Issuer installer or files with anyone outside your company.** This is your company's master signing key.
2. **NEVER write your Key Issuer master passphrase in an email or plain text file.** If a hacker obtains both your vault file and your passphrase, they can print their own software keys.
3. **Backup your vault.** If your local computer breaks, you can lose your vault. In the Key Issuer app, backup your 3 keys and store the backup file (`panic-alarm-key-backup.json`) on an offline USB drive in your office safe. You can restore your keys on any new computer by importing this backup.
