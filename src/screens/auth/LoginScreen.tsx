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

const PHONE_RE = /^\d{10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BIOMETRIC_KEY = 'rentease_biometric_enabled';
const ADMIN_PHONE = '8247873377';

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN MODE — controlled from app_settings table (admin can change in Settings)
// ─────────────────────────────────────────────────────────────────────────────
//  'bypass' (DEFAULT) — phone + name, no OTP, free forever
//  'email'            — email + OTP via email (free via Supabase)
//  'phone'            — mobile + OTP via SMS (MSG91, paid)
//
// Admin changes this inside the app: Settings → Login Mode
// No code change or app update needed to switch modes.
// ─────────────────────────────────────────────────────────────────────────────

type LoginMode = 'bypass' | 'email' | 'phone';

const friendlyError = (msg: string): string => {
  const m = msg.toLowerCase();
  if (m.includes('fetch') || m.includes('network') || m.includes('networkerror') || m.includes('timeout') || m.includes('abort'))
    return 'No internet connection. Please check your network and try again.';
  if (m.includes('invalid login credentials') || m.includes('invalid email') || m.includes('invalid password'))
    return 'Incorrect email or password. Please try again.';
  if (m.includes('too many requests') || m.includes('rate limit'))
    return 'Too many attempts. Please wait a moment and try again.';
  return msg;
};

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'> };

export default function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  const [loginMode, setLoginMode] = useState<LoginMode>('bypass');
  const [modeLoaded, setModeLoaded] = useState(false);

  // Bypass fields
  const [bypassPhone, setBypassPhone] = useState('');
  const [bypassName, setBypassName] = useState('');
  const [bypassLoading, setBypassLoading] = useState(false);
  const [bypassError, setBypassError] = useState<string | null>(null);

  // Email OTP fields
  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Phone OTP fields
  const [phone, setPhone] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [hasBiometrics, setHasBiometrics] = useState(false);

  useEffect(() => {
    checkBiometrics();
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['login_mode', 'default_otp', 'use_supabase_otp']);
    const map: Record<string, string> = {};
    (data ?? []).forEach((r: any) => { map[r.key] = r.value; });
    const mode = (map['login_mode'] as LoginMode) || 'bypass';
    setLoginMode(mode);
    setModeLoaded(true);
  };

  const checkBiometrics = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const enabled = await AsyncStorage.getItem(BIOMETRIC_KEY);
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

  // ── BYPASS MODE: phone + name, no OTP ────────────────────────────────────
  // Uses a deterministic synthetic email+password from the phone number.
  // Account is created silently on first login. Admin role is set in profile.
  const handleBypassLogin = async () => {
    setBypassError(null);
    const cleanPhone = bypassPhone.replace(/\D/g, '');
    if (!PHONE_RE.test(cleanPhone)) {
      setBypassError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!bypassName.trim()) {
      setBypassError('Please enter your name.');
      return;
    }
    setBypassLoading(true);

    // Deterministic synthetic credentials from phone number
    const syntheticEmail = `${cleanPhone}@rentease.app`;
    const syntheticPwd   = `Ph#${cleanPhone}!RE2026`;

    try {
      // Try signing in first (returning user)
      let { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: syntheticEmail,
        password: syntheticPwd,
      });

      if (signInErr) {
        // New user — create account silently
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: syntheticEmail,
          password: syntheticPwd,
          options: { emailRedirectTo: undefined },
        });
        if (signUpErr || !signUpData?.user) {
          setBypassLoading(false);
          setBypassError(friendlyError(signUpErr?.message ?? 'Could not create account.'));
          return;
        }
        // Sign in the new account
        const reSignIn = await supabase.auth.signInWithPassword({
          email: syntheticEmail, password: syntheticPwd,
        });
        if (reSignIn.error || !reSignIn.data?.session) {
          setBypassLoading(false);
          setBypassError(friendlyError(reSignIn.error?.message ?? 'Login failed.'));
          return;
        }
        signInData = reSignIn.data;
      }

      const userId = signInData?.session?.user?.id;
      if (!userId) {
        setBypassLoading(false);
        setBypassError('Login failed. Please try again.');
        return;
      }

      // Check / create profile
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, full_name, is_active, valid_until')
        .eq('id', userId)
        .single();

      if (existingProfile?.is_active === false) {
        await supabase.auth.signOut();
        setBypassLoading(false);
        showAlert('Account Inactive', 'Your account has been deactivated. Please contact the administrator.');
        return;
      }
      if (existingProfile?.valid_until && new Date(existingProfile.valid_until) < new Date()) {
        await supabase.auth.signOut();
        setBypassLoading(false);
        showAlert('Subscription Expired', 'Your validity period has expired. Please contact admin.');
        return;
      }

      // Upsert profile — admin phone always gets admin role
      const isAdminPhone = cleanPhone === ADMIN_PHONE;
      const isNewProfile = !existingProfile?.full_name;
      const upsertPayload = {
        id: userId,
        full_name: bypassName.trim(),
        phone: cleanPhone,
        phone_number: cleanPhone,
        role: isAdminPhone ? 'admin' : (isNewProfile ? 'client' : undefined),
        is_active: isAdminPhone ? true : (isNewProfile ? true : undefined),
        valid_until: isNewProfile && !isAdminPhone
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
          : undefined,
      };
      const { error: upsertErr } = await supabase.from('profiles').upsert(
        upsertPayload, { onConflict: 'id' }
      );
      if (upsertErr) {
        setBypassLoading(false);
        setBypassError(`Profile save failed: ${upsertErr.message}`);
        return;
      }

      setBypassLoading(false);
      // RootNavigator detects the session and navigates automatically
    } catch (e: any) {
      setBypassLoading(false);
      setBypassError(friendlyError(e.message ?? 'Login failed.'));
    }
  };

  // ── EMAIL OTP ─────────────────────────────────────────────────────────────
  const handleEmailOtp = async () => {
    setEmailError(null);
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) { setEmailError('Please enter a valid email address.'); return; }
    setEmailLoading(true);
    try {
      const { data: s } = await supabase.from('app_settings').select('key, value').eq('key', 'use_supabase_otp').single();
      if ((s as any)?.value === 'true') {
        const { error: otpErr } = await supabase.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true } });
        if (otpErr) { setEmailLoading(false); setEmailError(friendlyError(otpErr.message)); return; }
      }
      setEmailLoading(false);
      navigation.navigate('OTP', { email: clean });
    } catch (e: any) {
      setEmailLoading(false);
      setEmailError(friendlyError(e.message ?? 'Failed. Please try again.'));
    }
  };

  // ── PHONE OTP ─────────────────────────────────────────────────────────────
  // Uses default_otp from app_settings (no SMS gateway needed).
  // When MSG91 is configured later, set use_sms_gateway='true' in app_settings
  // and this function will call the edge function instead.
  const handlePhoneOtp = async () => {
    setPhoneError(null);
    const clean = phone.replace(/\D/g, '');
    if (!PHONE_RE.test(clean)) { setPhoneError('Please enter a valid 10-digit mobile number.'); return; }

    setPhoneLoading(true);
    try {
      // Check whether the real SMS gateway is configured
      const { data: settingsRows } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['use_sms_gateway', 'default_otp']);
      const settingsMap: Record<string, string> = {};
      (settingsRows ?? []).forEach((r: any) => { settingsMap[r.key] = r.value; });

      const useSmsGateway = settingsMap['use_sms_gateway'] === 'true';

      if (useSmsGateway) {
        // Real SMS via edge function (MSG91) — only when explicitly enabled
        const { data, error } = await supabase.functions.invoke('send-otp', { body: { phone: clean } });
        setPhoneLoading(false);
        if (error || data?.error) {
          setPhoneError(data?.error ?? friendlyError(error?.message ?? 'Failed to send OTP.'));
          return;
        }
      } else {
        // Default OTP mode — no SMS sent; user enters the code set in Admin page
        setPhoneLoading(false);
      }

      navigation.navigate('OTP', { phone: clean });
    } catch (e: any) {
      setPhoneLoading(false);
      setPhoneError(friendlyError(e.message ?? 'Failed to send OTP.'));
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
              label="Your Name"
              required
              placeholder="Enter your full name"
              value={bypassName}
              onChangeText={(t) => { setBypassName(t); setBypassError(null); }}
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
            <Text style={styles.sectionTitle}>Login with OTP</Text>
            <Text style={styles.sectionSub}>Enter your email — we'll send you a one-time password.</Text>
            {emailError ? <View style={styles.errorBox}><Text style={styles.errorText}>⚠️ {emailError}</Text></View> : null}
            <FormField label="Email Address" required placeholder="Enter your email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={(t) => { setEmail(t); setEmailError(null); }} />
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
            <Text style={styles.sectionSub}>Enter your mobile number — we'll send you an OTP via SMS.</Text>
            {phoneError ? <View style={styles.errorBox}><Text style={styles.errorText}>⚠️ {phoneError}</Text></View> : null}
            <View style={styles.phoneRow}>
              <View style={styles.countryCode}><Text style={styles.countryCodeText}>🇮🇳 +91</Text></View>
              <TextInput
                style={styles.phoneInput}
                placeholder="10-digit mobile number"
                placeholderTextColor={COLORS.muted}
                keyboardType="phone-pad"
                maxLength={10}
                value={phone}
                onChangeText={(t) => { setPhone(t.replace(/\D/g, '')); setPhoneError(null); }}
                returnKeyType="done"
                onSubmitEditing={handlePhoneOtp}
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
  flex: { flex: 1, backgroundColor: COLORS.white },
  banner: { backgroundColor: COLORS.primaryDark, alignItems: 'center', paddingBottom: 28, paddingHorizontal: 24 },
  bannerLogo: { fontSize: 48, marginBottom: 8 },
  bannerAppName: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  bannerTagline: { fontSize: 14, color: 'rgba(255,255,255,0.78)', marginTop: 4 },
  container: { paddingHorizontal: 24, paddingTop: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  sectionSub: { fontSize: 13, color: COLORS.muted, marginBottom: 20, lineHeight: 18 },
  errorBox: { backgroundColor: COLORS.dangerLight, padding: 12, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#FCA5A5' },
  errorText: { color: COLORS.danger, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10, backgroundColor: COLORS.white, overflow: 'hidden' },
  countryCode: { paddingHorizontal: 12, paddingVertical: 14, backgroundColor: COLORS.surface, borderRightWidth: 1, borderRightColor: COLORS.border },
  countryCodeText: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  phoneInput: { flex: 1, padding: 14, fontSize: 18, fontWeight: '600', color: COLORS.text, letterSpacing: 2 },
  biometricBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.primaryLight, borderRadius: 10, backgroundColor: COLORS.surface },
  biometricText: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
});
