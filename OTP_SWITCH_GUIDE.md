# RentEase — OTP Login Mode Switch Guide

## Current State
- Login mode: **Email OTP** (free, works right now)
- The app reads `login_mode` from the `app_settings` table in Supabase on every startup
- Changing the DB value **instantly switches the login UI and behavior** — no app update, no code change

---

## How the Switch Works (No Code Change Needed)

The login screen reads `app_settings` on startup:

| `login_mode` value | Login screen shows          | OTP sent via              | Cost     |
|--------------------|-----------------------------|---------------------------|----------|
| `email` (default)  | Email input → Get OTP       | Email (Supabase free)     | ₹0       |
| `phone`            | Mobile number input → Send OTP | SMS via MSG91 edge fn  | ₹0–paid  |

**The app code is already written for both modes.**
Switching is purely a database + deployment operation.

---

## SWITCH TO PHONE OTP — Step by Step

### Pre-requisite: Sign up at MSG91

1. Go to https://msg91.com → Sign Up (free, no card)
2. Verify your mobile number
3. Dashboard → **OTP** → **Create OTP Template**
   - Template text: `Your RentEase OTP is ##OTP##. Valid for 10 minutes.`
   - Save → note the **Template ID**
4. Dashboard → top-right → **API Keys** → copy your **Auth Key**

---

### Step 1 — Flip the login mode flag

Run this in **Supabase Dashboard → SQL Editor**:

```sql
INSERT INTO app_settings (key, value)
VALUES ('login_mode', 'phone')
ON CONFLICT (key) DO UPDATE SET value = 'phone';
```

This alone changes the login screen UI to show the phone number input.
(Users will see the phone input on next app open — no app update needed.)

---

### Step 2 — Deploy the Edge Functions

Run these commands in your terminal from the project folder:

```bash
# Install Supabase CLI (skip if already installed)
npm install -g supabase

# Login
supabase login

# Link to your Supabase project
# Find your project ref in: Supabase Dashboard → Settings → General → Reference ID
supabase link --project-ref YOUR_PROJECT_REF_HERE

# Set your MSG91 secrets (keep these safe — never commit to git)
supabase secrets set MSG91_AUTH_KEY=paste_your_auth_key_here
supabase secrets set MSG91_TEMPLATE_ID=paste_your_template_id_here

# Deploy both edge functions
supabase functions deploy send-otp
supabase functions deploy verify-otp
```

---

### Step 3 — Done ✅

Open the app → login screen now shows **mobile number input** → OTP sent via SMS.

---

## SWITCH BACK TO EMAIL — Instant Rollback

Run in **Supabase Dashboard → SQL Editor**:

```sql
UPDATE app_settings SET value = 'email' WHERE key = 'login_mode';
```

App immediately reverts to email OTP on next startup. No redeploy needed.

---

## IMPORTANT NOTES

### The login UI changes automatically — no app update needed
- `login_mode = 'email'` → email field + "Get OTP" button
- `login_mode = 'phone'` → phone number field + "Send OTP" button
- The switch happens on the **next time the user opens the app**
- Already-logged-in users are not affected (session stays active)

### MSG91 Free Plan
- MSG91 does NOT have a permanent free monthly quota
- You pay per SMS after the trial credits are used
- Approximate cost: ₹0.18–0.25 per SMS
- At 50 logins/month = ~₹10–13/month
- Initial trial credits cover the first few hundred SMS

### Edge Functions location
- `supabase/functions/send-otp/index.ts` — calls MSG91 to send OTP
- `supabase/functions/verify-otp/index.ts` — verifies OTP, creates/signs in Supabase user
- These are Deno (server-side) functions — they run on Supabase servers, not in the app
- Your MSG91 API key is stored as a Supabase secret — never exposed to the app

### Database column required
The `profiles` table needs a `phone_number` column (already added via migration).
If not done yet, run in Supabase SQL Editor:
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_number TEXT;
```

---

## SUMMARY TABLE

| What you want          | Action needed                                      | App update? |
|------------------------|----------------------------------------------------|-------------|
| Use email OTP (now)    | Nothing — already working                          | No          |
| Switch to SMS OTP      | Step 1 (SQL) + Step 2 (deploy) above               | No          |
| Switch back to email   | One SQL UPDATE                                     | No          |
| Change MSG91 keys      | `supabase secrets set ...` + redeploy functions    | No          |

---

## Quick Reference — Useful Commands

```bash
# Check deployed function logs
supabase functions logs send-otp
supabase functions logs verify-otp

# Update a secret
supabase secrets set MSG91_AUTH_KEY=new_key_here

# Redeploy after any changes to edge functions
supabase functions deploy send-otp
supabase functions deploy verify-otp

# List all secrets (shows names only, not values)
supabase secrets list
```

---

*Last updated: June 2025*
*RentEase — Property & Tenant Management*
