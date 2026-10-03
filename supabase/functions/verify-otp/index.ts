// supabase/functions/verify-otp/index.ts
// Verifies the OTP entered by the user against MSG91,
// then signs in / creates the Supabase user and returns a session.
//
// Deploy:
//   supabase functions deploy verify-otp
//
// Secrets needed (set once):
//   supabase secrets set MSG91_AUTH_KEY=your_authkey_here
//   supabase secrets set MSG91_TEMPLATE_ID=your_template_id_here
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { phone, otp } = await req.json();

    if (!phone || !otp) {
      return new Response(
        JSON.stringify({ error: 'Phone and OTP are required.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    const clean = String(phone).replace(/\D/g, '').replace(/^(91|0)/, '');
    if (clean.length !== 10) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    const authKey = Deno.env.get('MSG91_AUTH_KEY');
    if (!authKey) {
      return new Response(
        JSON.stringify({ error: 'OTP service not configured. Contact admin.' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // ── Step 1: Verify OTP with MSG91 ────────────────────────────────────────
    // Docs: https://docs.msg91.com/reference/verify-otp
    const verifyUrl = `https://control.msg91.com/api/v5/otp/verify?mobile=91${clean}&otp=${otp}&authkey=${authKey}`;
    const verifyRes  = await fetch(verifyUrl, { method: 'GET' });
    const verifyData = await verifyRes.json();

    // MSG91 returns { type: "success", message: "OTP verified success" } on match
    if (verifyData.type !== 'success') {
      return new Response(
        JSON.stringify({ error: 'Incorrect OTP. Please try again.' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // ── Step 2: Sign in / create Supabase user via admin client ─────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin       = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Deterministic synthetic email derived from phone (no real email required)
    const syntheticEmail = `${clean}@rentease.app`;
    const password       = `Ph#${clean}!RE2026`;

    // Try sign in first; create user if not found
    let { data: signInData, error: signInErr } = await admin.auth.signInWithPassword({
      email: syntheticEmail,
      password,
    });

    if (signInErr) {
      // User doesn't exist yet — create
      const { data: signUpData, error: signUpErr } = await admin.auth.admin.createUser({
        email: syntheticEmail,
        password,
        email_confirm: true,
        user_metadata: { phone: clean },
      });

      if (signUpErr || !signUpData?.user) {
        return new Response(
          JSON.stringify({ error: signUpErr?.message ?? 'Could not create account.' }),
          { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
        );
      }

      // Sign in the newly created user
      const reSignIn = await admin.auth.signInWithPassword({ email: syntheticEmail, password });
      signInData = reSignIn.data;

      if (reSignIn.error || !reSignIn.data?.session) {
        return new Response(
          JSON.stringify({ error: reSignIn.error?.message ?? 'Login failed after account creation.' }),
          { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
        );
      }
    }

    if (!signInData?.session) {
      return new Response(
        JSON.stringify({ error: 'Could not create session.' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // ── Step 3: Fetch / upsert profile ───────────────────────────────────────
    const userId = signInData.session.user.id;

    const { data: profile } = await admin
      .from('profiles')
      .select('id, full_name, is_active, valid_until')
      .eq('id', userId)
      .single();

    // Always keep phone_number in sync
    await admin.from('profiles').upsert(
      { id: userId, phone_number: clean },
      { onConflict: 'id' },
    );

    return new Response(
      JSON.stringify({
        success: true,
        session: signInData.session,
        profile:  profile ?? null,
        isNewUser: !profile?.full_name,
      }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? 'Unexpected error.' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});
