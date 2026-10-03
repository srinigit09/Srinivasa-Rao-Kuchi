// supabase/functions/send-otp/index.ts
// Sends an SMS OTP via MSG91 API (free: 100 OTP/month)
//
// Deploy:
//   supabase functions deploy send-otp
//
// Set secret (once):
//   supabase secrets set MSG91_AUTH_KEY=your_authkey_here
//   supabase secrets set MSG91_TEMPLATE_ID=your_template_id_here
//
// MSG91 setup steps:
//   1. Sign up at msg91.com (free, no card needed)
//   2. Dashboard → OTP → Create OTP Template → note the Template ID
//   3. Dashboard → API Keys → copy your Auth Key

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { phone } = await req.json();

    if (!phone) {
      return new Response(
        JSON.stringify({ error: 'Phone number is required.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // Normalise: strip +91 or leading 0, keep 10 digits
    const clean = String(phone).replace(/\D/g, '').replace(/^(91|0)/, '');
    if (clean.length !== 10) {
      return new Response(
        JSON.stringify({ error: 'Please enter a valid 10-digit mobile number.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    const authKey    = Deno.env.get('MSG91_AUTH_KEY');
    const templateId = Deno.env.get('MSG91_TEMPLATE_ID');

    if (!authKey || !templateId) {
      return new Response(
        JSON.stringify({ error: 'OTP service not configured. Contact admin.' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // MSG91 Send OTP API v5
    // Docs: https://docs.msg91.com/reference/send-otp
    const url = `https://control.msg91.com/api/v5/otp?template_id=${templateId}&mobile=91${clean}&authkey=${authKey}`;

    const res  = await fetch(url, { method: 'GET' });
    const data = await res.json();

    // MSG91 returns { type: "success", message: "3a4b5c..." } on success
    // where message is the request_id used for verification
    if (data.type === 'success') {
      return new Response(
        JSON.stringify({ success: true, requestId: data.message }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ error: data.message ?? 'Failed to send OTP. Please try again.' }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? 'Unexpected error.' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});
