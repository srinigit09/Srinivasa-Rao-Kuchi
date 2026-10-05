// supabase/functions/reset-user-password/index.ts
// Force-resets a Supabase Auth user's password using the service-role key.
// Called during bypass login recovery when the stored password doesn't match
// any known formula. Requires the caller to supply the correct default_otp
// as proof of identity — the function verifies it against app_settings.
//
// Deploy:
//   supabase functions deploy reset-user-password
//
// The SUPABASE_SERVICE_ROLE_KEY secret is automatically available in all edge functions.

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
    const { email, newPassword, otp } = await req.json();

    if (!email || !newPassword || !otp) {
      return new Response(
        JSON.stringify({ error: 'email, newPassword and otp are required.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Admin client — can update any user
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify the OTP against app_settings.default_otp before changing anything
    const { data: settingRow } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'default_otp')
      .single();

    const defaultOtp = (settingRow as any)?.value ?? '123456';
    if (otp !== defaultOtp) {
      return new Response(
        JSON.stringify({ error: 'Invalid OTP. Password not changed.' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // Look up the user by email
    const { data: listData, error: listErr } = await admin.auth.admin.listUsers();
    if (listErr) {
      return new Response(
        JSON.stringify({ error: listErr.message }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    const target = (listData.users ?? []).find((u: any) => u.email === email);
    if (!target) {
      return new Response(
        JSON.stringify({ error: 'User not found.' }),
        { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // Force-update the password
    const { error: updateErr } = await admin.auth.admin.updateUserById(target.id, {
      password: newPassword,
    });

    if (updateErr) {
      return new Response(
        JSON.stringify({ error: updateErr.message }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? 'Unexpected error.' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});
