import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, KeyboardAvoidingView,
  Platform, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthStackParamList } from '../../navigation/RootNavigator';
import { supabase } from '../../lib/supabase';
import Button from '../../components/common/Button';
import { COLORS } from '../../constants';
import { showAlert } from '../../utils';
import { Ionicons } from '@expo/vector-icons';

// ─────────────────────────────────────────────────────────────────────────────
// OTP SCREEN — handles both phone OTP and email OTP flows
//
// Phone OTP  (route.params.phone set):
//   • Verify default OTP from app_settings
//   • Sign in / create account using {phone}@rentease.app + Ph#{phone}!RE2026
//   • This is the same account used by Bypass mode → switching modes never breaks login
//
// Email OTP  (route.params.email set):
//   • Verify default OTP (or real Supabase OTP if use_supabase_otp=true)
//   • Sign in / create account using the real email + Pass#{sanitisedEmail}!2026
//   • Email address IS the Supabase Auth email
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_PHONE = '8247873377';
const SUPA_URL    = 'https://kauraxhcafonogggjhca.supabase.co';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'OTP'>;
  route:      RouteProp<AuthStackParamList, 'OTP'>;
};

export default function OTPScreen({ navigation, route }: Props) {
  const { phone, email } = route.params;
  const isPhoneFlow = !!phone;
  const insets = useSafeAreaInsets();

  const target = isPhoneFlow
    ? `+91 ${phone!.slice(0, 5)} ${phone!.slice(5)}`
    : (email ?? '');

  const [otp,           setOtp]           = useState(['', '', '', '', '', '']);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [useSmsGateway, setUseSmsGateway] = useState(false);
  const inputs = useRef<(TextInput | null)[]>([]);

  React.useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'use_sms_gateway').single()
      .then(({ data }) => { if ((data as any)?.value === 'true') setUseSmsGateway(true); });
  }, []);

  const handleChange = (text: string, index: number) => {
    setError(null);
    const next = [...otp];
    next[index] = text;
    setOtp(next);
    if (text && index < 5) inputs.current[index + 1]?.focus();
  };

  // ── Delete stale auth user via Admin REST API ─────────────────────────────
  const deleteAuthUser = async (userId: string, serviceKey: string) => {
    await fetch(`${SUPA_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    });
  };

  // ── Ensure/reset account when password doesn't match ─────────────────────
  const resetAndSignIn = async (authEmail: string, authPwd: string): Promise<string | null> => {
    const { data: keyRow } = await supabase
      .from('app_settings').select('value').eq('key', 'service_role_key').single();
    const serviceKey = (keyRow as any)?.value ?? '';

    if (serviceKey) {
      const listRes = await fetch(`${SUPA_URL}/auth/v1/admin/users?page=1&per_page=1000`, {
        headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      });
      if (listRes.ok) {
        const { users } = await listRes.json();
        const stale = (users ?? []).find((u: any) => u.email === authEmail);
        if (stale) await deleteAuthUser(stale.id, serviceKey);
      }
    }

    // Recreate fresh
    await supabase.auth.signUp({ email: authEmail, password: authPwd, options: { emailRedirectTo: undefined } });
    const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPwd });
    if (error || !data?.user) return null;
    return data.user.id;
  };

  // ── Finalise profile after successful auth ────────────────────────────────
  const finaliseProfile = async (
    userId: string,
    opts: { phone?: string; email?: string }
  ) => {
    const isAdminPhone = opts.phone === ADMIN_PHONE;
    const { data: existing } = await supabase
      .from('profiles').select('id, full_name, is_active, valid_until, role').eq('id', userId).single();

    if (existing?.is_active === false) {
      await supabase.auth.signOut();
      showAlert('Account Inactive', 'Your account has been deactivated. Contact the administrator.');
      return false;
    }
    if (existing?.valid_until && new Date(existing.valid_until) < new Date()) {
      await supabase.auth.signOut();
      showAlert('Subscription Expired', 'Your validity period has expired. Contact admin.');
      return false;
    }

    const isNew = !existing?.full_name;
    if (isNew) {
      // New user — create profile and send to setup
      await supabase.from('profiles').upsert({
        id:           userId,
        phone:        opts.phone ?? null,
        phone_number: opts.phone ?? null,
        email:        opts.email ?? null,
        role:         isAdminPhone ? 'admin' : 'client',
        is_active:    true,
        valid_until:  isAdminPhone ? null : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'id' });
      navigation.navigate('ProfileSetup', { phone: opts.phone, email: opts.email });
    } else {
      // Existing user — keep profile, ensure admin role
      if (isAdminPhone) {
        await supabase.from('profiles').update({ role: 'admin' }).eq('id', userId);
      }
      // RootNavigator detects session and navigates automatically
    }
    return true;
  };

  const handleVerify = async () => {
    const token = otp.join('');
    if (token.length < 6) { setError('Please enter all 6 digits.'); return; }

    setLoading(true);
    setError(null);

    try {
      // Load settings
      const { data: settingsRows } = await supabase
        .from('app_settings').select('key, value')
        .in('key', ['default_otp', 'use_supabase_otp', 'use_sms_gateway']);
      const s: Record<string, string> = {};
      (settingsRows ?? []).forEach((r: any) => { s[r.key] = r.value; });
      const defaultOtp     = s['default_otp']     ?? '123456';
      const useSupabaseOtp = s['use_supabase_otp'] === 'true';
      const useGateway     = s['use_sms_gateway']  === 'true';

      // ── PHONE OTP FLOW ──────────────────────────────────────────────────────
      if (isPhoneFlow) {
        if (useGateway) {
          // Real SMS via MSG91 Edge Function
          const { data, error: fnErr } = await supabase.functions.invoke('verify-otp', { body: { phone, otp: token } });
          setLoading(false);
          if (fnErr || data?.error) { setError(data?.error ?? fnErr?.message ?? 'Invalid OTP.'); return; }
          await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
          if (data.isNewUser || !data.profile?.full_name) navigation.navigate('ProfileSetup', { phone: phone! });
          return;
        }

        // Default OTP — verify against app_settings value
        if (token !== defaultOtp) { setLoading(false); setError('Invalid OTP. Please try again.'); return; }

        // Canonical account: {phone}@rentease.app / Ph#{phone}!RE2026
        // This is the SAME account used by Bypass mode — no conflict when switching
        const authEmail = `${phone}@rentease.app`;
        const authPwd   = `Ph#${phone}!RE2026`;

        let userId: string | null = null;

        // Try sign-in
        const si = await supabase.auth.signInWithPassword({ email: authEmail, password: authPwd });
        if (!si.error && si.data?.user) {
          userId = si.data.user.id;
        } else {
          // Account doesn't exist yet — create it
          const { data: suData, error: suErr } = await supabase.auth.signUp({
            email: authEmail, password: authPwd, options: { emailRedirectTo: undefined },
          });
          const alreadyExists = suErr?.message?.toLowerCase().includes('already registered')
            || suErr?.message?.toLowerCase().includes('already been registered');

          if (!suErr && suData?.user) {
            const si2 = await supabase.auth.signInWithPassword({ email: authEmail, password: authPwd });
            if (!si2.error && si2.data?.user) userId = si2.data.user.id;
          } else if (alreadyExists) {
            // Stale account — reset it
            userId = await resetAndSignIn(authEmail, authPwd);
          }
        }

        if (!userId) { setLoading(false); setError('Login failed. Please try again.'); return; }

        const ok = await finaliseProfile(userId, { phone: phone! });
        if (!ok) setLoading(false);
        else setLoading(false);
        return;
      }

      // ── EMAIL OTP FLOW ──────────────────────────────────────────────────────
      // The user's real email IS the Supabase Auth email.
      let userId: string | null = null;

      if (useSupabaseOtp) {
        // Real Supabase email OTP
        const { data, error: verifyErr } = await supabase.auth.verifyOtp({ email: email!, token, type: 'email' });
        if (verifyErr || !data?.user) { setLoading(false); setError(verifyErr?.message ?? 'Invalid OTP.'); return; }
        userId = data.user.id;
      } else {
        // Default OTP — verify then sign in / create account
        if (token !== defaultOtp) { setLoading(false); setError('Invalid OTP. Please try again.'); return; }

        const authPwd = `Pass#${email!.replace(/[^a-zA-Z0-9]/g, '')}!2026`;

        const si = await supabase.auth.signInWithPassword({ email: email!, password: authPwd });
        if (!si.error && si.data?.user) {
          userId = si.data.user.id;
        } else {
          const { data: suData, error: suErr } = await supabase.auth.signUp({
            email: email!, password: authPwd, options: { emailRedirectTo: undefined },
          });
          const alreadyExists = suErr?.message?.toLowerCase().includes('already registered')
            || suErr?.message?.toLowerCase().includes('already been registered');

          if (!suErr && suData?.user) {
            const si2 = await supabase.auth.signInWithPassword({ email: email!, password: authPwd });
            if (!si2.error && si2.data?.user) userId = si2.data.user.id;
          } else if (alreadyExists) {
            userId = await resetAndSignIn(email!, authPwd);
          }
        }
      }

      if (!userId) { setLoading(false); setError('Login failed. Please try again.'); return; }

      const ok = await finaliseProfile(userId, { email: email! });
      if (!ok) setLoading(false);
      else setLoading(false);

    } catch (e: any) {
      setLoading(false);
      setError(e.message ?? 'Verification failed. Please try again.');
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    setError(null);
    setOtp(['', '', '', '', '', '']);
    try {
      if (isPhoneFlow && useSmsGateway) {
        const { data, error: fnErr } = await supabase.functions.invoke('send-otp', { body: { phone } });
        if (fnErr || data?.error) setError(data?.error ?? fnErr?.message ?? 'Failed to resend OTP.');
        else inputs.current[0]?.focus();
      } else {
        navigation.goBack();
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to resend.');
    }
    setResendLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.banner, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>Enter OTP</Text>
          <Text style={styles.bannerSub} numberOfLines={1}>
            {isPhoneFlow ? '📱 Code for ' : '📧 Code for '}{target}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hintBox}>
          <Ionicons
            name={isPhoneFlow && useSmsGateway ? 'chatbubble-outline' : 'lock-closed-outline'}
            size={18} color={COLORS.primary}
          />
          <Text style={styles.hintText}>
            {isPhoneFlow && useSmsGateway
              ? <>Check your <Text style={styles.hintBold}>SMS messages</Text> for the 6-digit OTP.</>
              : <>Enter the <Text style={styles.hintBold}>default OTP</Text> set by your administrator.</>
            }
          </Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        ) : null}

        <Text style={styles.label}>6-digit OTP</Text>
        <View style={styles.otpRow}>
          {otp.map((digit, i) => (
            <TextInput
              key={i}
              ref={(r) => { inputs.current[i] = r; }}
              style={styles.otpBox}
              maxLength={1}
              keyboardType="number-pad"
              value={digit}
              onChangeText={(t) => handleChange(t, i)}
              onKeyPress={({ nativeEvent }) => {
                if (nativeEvent.key === 'Backspace' && !digit && i > 0) {
                  inputs.current[i - 1]?.focus();
                }
              }}
            />
          ))}
        </View>

        <Button title="Verify & Continue" onPress={handleVerify} loading={loading} style={{ marginTop: 28 }} />

        <TouchableOpacity style={styles.resendBtn} onPress={handleResend} disabled={resendLoading}>
          {resendLoading
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : <Text style={styles.resendText}>
                {isPhoneFlow ? '🔄 Resend OTP' : '← Change email / Resend'}
              </Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: COLORS.white },
  banner:    { backgroundColor: COLORS.primaryDark, paddingHorizontal: 16, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:   { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  bannerSub:   { fontSize: 13, color: 'rgba(255,255,255,0.78)', marginTop: 2 },
  body:      { paddingHorizontal: 24, paddingTop: 32 },
  hintBox:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: COLORS.primaryLight, borderRadius: 10, padding: 14, marginBottom: 20 },
  hintText:  { flex: 1, fontSize: 14, color: COLORS.primary, lineHeight: 20 },
  hintBold:  { fontWeight: '800' },
  errorBox:  { backgroundColor: COLORS.dangerLight, padding: 12, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#FCA5A5' },
  errorText: { color: COLORS.danger, fontSize: 13, fontWeight: '500' },
  label:     { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 12 },
  otpRow:    { flexDirection: 'row', gap: 8 },
  otpBox:    { flex: 1, height: 58, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10, textAlign: 'center', fontSize: 24, fontWeight: '700', color: COLORS.text, backgroundColor: COLORS.surface },
  resendBtn: { alignItems: 'center', marginTop: 20, paddingVertical: 8 },
  resendText:{ color: COLORS.primary, fontSize: 14, fontWeight: '600' },
});
