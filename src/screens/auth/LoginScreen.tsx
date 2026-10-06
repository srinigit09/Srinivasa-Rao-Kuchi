import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, TouchableOpacity, TextInput, StatusBar, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { AuthStackParamList } from '../../navigation/RootNavigator';
import { supabase } from '../../lib/supabase';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import { COLORS } from '../../constants';
import { showAlert } from '../../utils';
import { Profile } from '../../types';

// ─────────────────────────────────────────────────────────────────────────────
// AUTH DESIGN — single account per phone number, works across all 3 modes
//
// Every user (admin + clients) has ONE Supabase Auth account:
//   email:    {phone}@rentease.app
//   password: Ph#{phone}!RE2026   (synthetic, never shown to user)
//
// Login modes only change how the user reaches that account:
//   bypass  — phone + name → sign in directly (no OTP)
//   phone   — phone → enter default OTP → sign in
//   email   — email address → enter default OTP → sign in (email = auth email)
//
// Switching modes never breaks existing accounts.
// ─────────────────────────────────────────────────────────────────────────────

const PHONE_RE   = /^\d{10}$/;
const EMAIL_RE   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BIOMETRIC_KEY = 'rentease_biometric_enabled';
const ADMIN_PHONE   = '8247873377';
const SUPA_URL      = 'https://kauraxhcafonogggjhca.supabase.co';

type LoginMode = 'bypass' | 'email' | 'phone';

// Derive the canonical Supabase Auth credentials from a phone number
const authCredentials = (phone: string) => ({
  email: `${phone}@rentease.app`,
  password: `Ph#${phone}!RE2026`,
});

const friendlyError = (msg: string): string => {
  const m = msg.toLowerCase();
  if (m.includes('fetch') || m.includes('network') || m.includes('networkerror') || m.includes('timeout') || m.includes('abort'))
    return 'No internet connection. Please check your network and try again.';
  if (m.includes('too many requests') || m.includes('rate limit'))
    return 'Too many attempts. Please wait a moment and try again.';
  return msg;
};

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'> };

export default function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  const [loginMode, setLoginMode]   = useState<LoginMode>('bypass');
  const [modeLoaded, setModeLoaded] = useState(false);

  // Bypass fields
  const [bypassPhone,   setBypassPhone]   = useState('');
  const [bypassName,    setBypassName]    = useState('');
  const [bypassLoading, setBypassLoading] = useState(false);
  const [bypassError,   setBypassError]   = useState<string | null>(null);

  // Email OTP fields
  const [email,        setEmail]        = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError,   setEmailError]   = useState<string | null>(null);

  // Phone OTP fields
  const [phone,        setPhone]        = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError,   setPhoneError]   = useState<string | null>(null);

  const [hasBiometrics, setHasBiometrics] = useState(false);

  useEffect(() => {
    checkBiometrics();
    loadLoginMode();
  }, []);

  const loadLoginMode = async () => {
    const { data } = await supabase
      .from('app_settings').select('value').eq('key', 'login_mode').single();
    setLoginMode(((data as any)?.value as LoginMode) || 'bypass');
    setModeLoaded(true);
  };

  const checkBiometrics = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled   = await LocalAuthentication.isEnrolledAsync();
      const enabled    = await AsyncStorage.getItem(BIOMETRIC_KEY);
      if (compatible && enrolled && enabled === 'true') setHasBiometrics(true);
    } catch { /* ignore */ }
  };

  const handleBiometricAuth = async () => {
    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock RentEase with Biometrics',
        fallbackLabel: 'Use Email / Phone',
      });
      if (res.success) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) showAlert('Session Expired', 'Please log in again.');
      }
    } catch (e: any) { showAlert('Biometric Error', e.message); }
  };

  // ── Shared: ensure a Supabase Auth account exists for a phone number ────────
  // Uses the canonical email + password formula. If the account doesn't exist
  // it's created silently. If a stale account exists (wrong password) it's
  // deleted via the Admin API (service_role_key from app_settings) and recreated.
  const ensureAccount = async (cleanPhone: string): Promise<{ userId: string } | { error: string }> => {
    const { email: authEmail, password: authPwd } = authCredentials(cleanPhone);

    // Try to sign in with canonical credentials first
    const signIn = await supabase.auth.signInWithPassword({ email: authEmail, password: authPwd });
    if (!signIn.error && signIn.data?.user) {
      return { userId: signIn.data.user.id };
    }

    // Sign-in failed — try to create the account
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: authEmail, password: authPwd,
      options: { emailRedirectTo: undefined },
    });

    const alreadyExists = signUpErr?.message?.toLowerCase().includes('already registered')
      || signUpErr?.message?.toLowerCase().includes('already been registered');

    if (!signUpErr && signUpData?.user) {
      // Fresh account created — sign in now
      const si = await supabase.auth.signInWithPassword({ email: authEmail, password: authPwd });
      if (!si.error && si.data?.user) return { userId: si.data.user.id };
      return { error: 'Account created but sign-in failed. Please try again.' };
    }

    if (alreadyExists) {
      // Account exists but password doesn't match the canonical formula.
      // Use service_role_key to delete and recreate it.
      const { data: keyRow } = await supabase
        .from('app_settings').select('value').eq('key', 'service_role_key').single();
      const serviceKey = (keyRow as any)?.value ?? '';

      if (!serviceKey) {
        return {
          error:
            'Account conflict detected. Run this SQL once in Supabase Dashboard:\n\n' +
            `DELETE FROM auth.users WHERE email LIKE '%${cleanPhone}%';`,
        };
      }

      // List all auth users and delete any that match this phone
      const listRes = await fetch(`${SUPA_URL}/auth/v1/admin/users?page=1&per_page=1000`, {
        headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      });
      if (listRes.ok) {
        const { users } = await listRes.json();
        const matches = (users ?? []).filter((u: any) =>
          u.email === authEmail || u.email === cleanPhone
        );
        await Promise.all(matches.map((u: any) =>
          fetch(`${SUPA_URL}/auth/v1/admin/users/${u.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
          })
        ));
      }

      // Recreate with canonical credentials
      const { error: su2 } = await supabase.auth.signUp({
        email: authEmail, password: authPwd,
        options: { emailRedirectTo: undefined },
      });
      if (su2) return { error: friendlyError(su2.message) };

      const si2 = await supabase.auth.signInWithPassword({ email: authEmail, password: authPwd });
      if (!si2.error && si2.data?.user) return { userId: si2.data.user.id };
      return { error: 'Account reset but sign-in failed. Please try again.' };
    }

    return { error: friendlyError(signUpErr?.message ?? 'Login failed. Please try again.') };
  };

  // ── Shared: check profile status and upsert after successful auth ───────────
  const finaliseLogin = async (
    userId: string,
    opts: { phone?: string; name?: string; email?: string }
  ): Promise<{ error: string } | null> => {
    const { data: existing } = await supabase
      .from('profiles').select('*')
      .eq('id', userId).single();
    const profile = existing as Profile | null;

    if (profile?.is_active === false) {
      await supabase.auth.signOut();
      return { error: 'Your account has been deactivated. Contact the administrator.' };
    }
    if (profile?.valid_until && new Date(profile.valid_until) < new Date()) {
      await supabase.auth.signOut();
      return { error: 'Your validity period has expired. Contact admin.' };
    }

    const isAdminPhone = opts.phone === ADMIN_PHONE;
    const isNew        = !profile?.full_name;

    await supabase.from('profiles').upsert({
      id:           userId,
      full_name:    opts.name  ?? profile?.full_name ?? '',
      phone:        opts.phone ?? profile?.phone     ?? null,
      phone_number: opts.phone ?? profile?.phone     ?? null,
      email:        opts.email ?? profile?.email     ?? null,
      role:         isAdminPhone ? 'admin' : (isNew ? 'client' : (profile?.role ?? 'client')),
      is_active:    true,
      ...(isNew && !isAdminPhone
        ? { valid_until: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() }
        : {}),
    }, { onConflict: 'id' });

    return null; // success — RootNavigator detects session automatically
  };

  // ── BYPASS MODE ──────────────────────────────────────────────────────────────
  const handleBypassLogin = async () => {
    setBypassError(null);
    const cleanPhone = bypassPhone.replace(/\D/g, '');
    if (!PHONE_RE.test(cleanPhone)) { setBypassError('Please enter a valid 10-digit mobile number.'); return; }
    if (!bypassName.trim())         { setBypassError('Please enter your name.');                      return; }

    setBypassLoading(true);
    try {
      const result = await ensureAccount(cleanPhone);
      if ('error' in result) { setBypassLoading(false); setBypassError(result.error); return; }

      const err = await finaliseLogin(result.userId, { phone: cleanPhone, name: bypassName.trim() });
      setBypassLoading(false);
      if (err) showAlert('Login Error', err.error);
      // On success: RootNavigator detects session → navigates to Dashboard
    } catch (e: any) {
      setBypassLoading(false);
      setBypassError(friendlyError(e.message ?? 'Login failed.'));
    }
  };

  // ── PHONE OTP MODE ───────────────────────────────────────────────────────────
  const handlePhoneOtp = async () => {
    setPhoneError(null);
    const clean = phone.replace(/\D/g, '');
    if (!PHONE_RE.test(clean)) { setPhoneError('Please enter a valid 10-digit mobile number.'); return; }

    setPhoneLoading(true);
    try {
      const { data: settingsRows } = await supabase
        .from('app_settings').select('key, value').in('key', ['use_sms_gateway', 'default_otp']);
      const sm: Record<string, string> = {};
      (settingsRows ?? []).forEach((r: any) => { sm[r.key] = r.value; });

      if (sm['use_sms_gateway'] === 'true') {
        const { data, error } = await supabase.functions.invoke('send-otp', { body: { phone: clean } });
        setPhoneLoading(false);
        if (error || data?.error) { setPhoneError(data?.error ?? friendlyError(error?.message ?? 'Failed to send OTP.')); return; }
      } else {
        setPhoneLoading(false);
      }
      navigation.navigate('OTP', { phone: clean });
    } catch (e: any) {
      setPhoneLoading(false);
      setPhoneError(friendlyError(e.message ?? 'Failed.'));
    }
  };

  // ── EMAIL OTP MODE ───────────────────────────────────────────────────────────
  const handleEmailOtp = async () => {
    setEmailError(null);
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) { setEmailError('Please enter a valid email address.'); return; }

    setEmailLoading(true);
    try {
      const { data: s } = await supabase.from('app_settings').select('value').eq('key', 'use_supabase_otp').single();
      if ((s as any)?.value === 'true') {
        const { error: otpErr } = await supabase.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true } });
        if (otpErr) { setEmailLoading(false); setEmailError(friendlyError(otpErr.message)); return; }
      }
      setEmailLoading(false);
      navigation.navigate('OTP', { email: clean });
    } catch (e: any) {
      setEmailLoading(false);
      setEmailError(friendlyError(e.message ?? 'Failed.'));
    }
  };

  if (!modeLoaded) {
    return (
      <View style={[styles.flex, { justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primaryDark }]}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      <View style={[styles.banner, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.bannerLogo}>🏠</Text>
        <Text style={styles.bannerAppName}>RentEase</Text>
        <Text style={styles.bannerTagline}>Property & Tenant Management</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">

        {/* ── BYPASS MODE ── */}
        {loginMode === 'bypass' && (
          <View>
            <Text style={styles.sectionTitle}>Welcome to RentEase</Text>
            {bypassError ? <View style={styles.errorBox}><Text style={styles.errorText}>⚠️ {bypassError}</Text></View> : null}
            <View style={styles.phoneRow}>
              <View style={styles.countryCode}><Text style={styles.countryCodeText}>🇮🇳 +91</Text></View>
              <TextInput
                style={styles.phoneInput}
                placeholder="10-digit mobile number"
                placeholderTextColor={COLORS.muted}
                keyboardType="phone-pad"
                maxLength={10}
                value={bypassPhone}
                onChangeText={(t) => { setBypassPhone(t.replace(/\D/g, '')); setBypassError(null); }}
              />
            </View>
            <View style={{ height: 12 }} />
            <FormField
              label="Your Name" required placeholder="Enter your full name"
              value={bypassName} onChangeText={(t) => { setBypassName(t); setBypassError(null); }}
            />
            <Button title="Continue →" onPress={handleBypassLogin} loading={bypassLoading} style={{ marginTop: 4 }} />
            {hasBiometrics && (
              <TouchableOpacity style={styles.biometricBtn} onPress={handleBiometricAuth}>
                <Ionicons name="finger-print" size={24} color={COLORS.primary} />
                <Text style={styles.biometricText}>Login with Fingerprint / FaceID</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── EMAIL OTP MODE ── */}
        {loginMode === 'email' && (
          <View>
            <Text style={styles.sectionTitle}>Login with Email OTP</Text>
            <Text style={styles.sectionSub}>Enter your email address to receive an OTP.</Text>
            {emailError ? <View style={styles.errorBox}><Text style={styles.errorText}>⚠️ {emailError}</Text></View> : null}
            <FormField
              label="Email Address" required placeholder="your@email.com"
              keyboardType="email-address" autoCapitalize="none"
              value={email} onChangeText={(t) => { setEmail(t); setEmailError(null); }}
            />
            <Button title="Get OTP →" onPress={handleEmailOtp} loading={emailLoading} style={{ marginTop: 4 }} />
            {hasBiometrics && (
              <TouchableOpacity style={styles.biometricBtn} onPress={handleBiometricAuth}>
                <Ionicons name="finger-print" size={24} color={COLORS.primary} />
                <Text style={styles.biometricText}>Login with Fingerprint / FaceID</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── PHONE OTP MODE ── */}
        {loginMode === 'phone' && (
          <View>
            <Text style={styles.sectionTitle}>Login with Mobile OTP</Text>
            <Text style={styles.sectionSub}>Enter your mobile number to receive an OTP.</Text>
            {phoneError ? <View style={styles.errorBox}><Text style={styles.errorText}>⚠️ {phoneError}</Text></View> : null}
            <View style={styles.phoneRow}>
              <View style={styles.countryCode}><Text style={styles.countryCodeText}>🇮🇳 +91</Text></View>
              <TextInput
                style={styles.phoneInput}
                placeholder="10-digit mobile number"
                placeholderTextColor={COLORS.muted}
                keyboardType="phone-pad" maxLength={10}
                returnKeyType="done" onSubmitEditing={handlePhoneOtp}
                value={phone}
                onChangeText={(t) => { setPhone(t.replace(/\D/g, '')); setPhoneError(null); }}
              />
            </View>
            <Button title="Send OTP →" onPress={handlePhoneOtp} loading={phoneLoading} style={{ marginTop: 12 }} />
            {hasBiometrics && (
              <TouchableOpacity style={styles.biometricBtn} onPress={handleBiometricAuth}>
                <Ionicons name="finger-print" size={24} color={COLORS.primary} />
                <Text style={styles.biometricText}>Login with Fingerprint / FaceID</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:            { flex: 1, backgroundColor: COLORS.white },
  banner:          { backgroundColor: COLORS.primaryDark, alignItems: 'center', paddingBottom: 28, paddingHorizontal: 24 },
  bannerLogo:      { fontSize: 48, marginBottom: 8 },
  bannerAppName:   { fontSize: 32, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  bannerTagline:   { fontSize: 14, color: 'rgba(255,255,255,0.78)', marginTop: 4 },
  container:       { paddingHorizontal: 24, paddingTop: 12 },
  sectionTitle:    { fontSize: 20, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  sectionSub:      { fontSize: 13, color: COLORS.muted, marginBottom: 20, lineHeight: 18 },
  errorBox:        { backgroundColor: COLORS.dangerLight, padding: 12, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#FCA5A5' },
  errorText:       { color: COLORS.danger, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  phoneRow:        { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10, backgroundColor: COLORS.white, overflow: 'hidden' },
  countryCode:     { paddingHorizontal: 12, paddingVertical: 14, backgroundColor: COLORS.surface, borderRightWidth: 1, borderRightColor: COLORS.border },
  countryCodeText: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  phoneInput:      { flex: 1, padding: 14, fontSize: 18, fontWeight: '600', color: COLORS.text, letterSpacing: 2 },
  biometricBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.primaryLight, borderRadius: 10, backgroundColor: COLORS.surface },
  biometricText:   { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
});
