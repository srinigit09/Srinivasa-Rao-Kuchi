import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, TouchableOpacity, TextInput,
} from 'react-native';
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

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'> };

const ADMIN_EMAIL = 'srinivas06in@gmail.com';
const BIOMETRIC_KEY = 'rentease_biometric_enabled';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasBiometrics, setHasBiometrics] = useState(false);

  // OTP inline state (client flow only)
  const [otpVisible, setOtpVisible] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpLoading, setOtpLoading] = useState(false);
  const [defaultOtp, setDefaultOtp] = useState<string | null>(null);  // null = not loaded yet
  const [useSupabaseOtp, setUseSupabaseOtp] = useState(false);
  const inputs = useRef<(TextInput | null)[]>([]);

  const isAdmin = email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();

  useEffect(() => {
    checkBiometrics();
    loadOtpSettings();
  }, []);

  const loadOtpSettings = async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['default_otp', 'use_supabase_otp']);

    if (data) {
      const map: Record<string, string> = {};
      data.forEach((r: { key: string; value: string }) => { map[r.key] = r.value; });
      setDefaultOtp(map['default_otp'] ?? '123456');
      setUseSupabaseOtp(map['use_supabase_otp'] === 'true');
    } else {
      setDefaultOtp('123456');
    }
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
        fallbackLabel: 'Use Email / Password',
      });
      if (res.success) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          showAlert('Session Expired', 'Please log in with your email to refresh your session.');
        }
      }
    } catch (e: any) {
      showAlert('Biometric Error', e.message);
    }
  };

  // ── Admin login ────────────────────────────────────────────
  const handleAdminLogin = async () => {
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) { setError('Please enter a valid email address.'); return; }
    if (!password.trim()) { setError('Please enter the admin password.'); return; }

    setLoading(true);
    const { data, error: signInErr } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: password.trim(),
    });

    if (signInErr) {
      // First-time admin — auto create
      if (signInErr.message.toLowerCase().includes('invalid login credentials')) {
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: cleanEmail,
          password: password.trim(),
        });
        if (signUpErr) {
          setLoading(false);
          setError(signUpErr.message);
          return;
        }
        if (signUpData.user) {
          await supabase.from('profiles').upsert({
            id: signUpData.user.id,
            email: cleanEmail,
            full_name: 'Super Admin',
            role: 'admin',
            is_active: true,
          });
        }
      } else {
        setLoading(false);
        setError(signInErr.message);
        return;
      }
    } else if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email: cleanEmail,
        role: 'admin',
      });
    }
    setLoading(false);
  };

  // ── Client: "Get OTP" pressed ──────────────────────────────
  const handleGetOtp = async () => {
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) { setError('Please enter a valid email address.'); return; }

    setLoading(true);

    if (useSupabaseOtp) {
      // Send real Supabase OTP
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { shouldCreateUser: true },
      });
      setLoading(false);
      if (otpErr) { setError(otpErr.message); return; }
    } else {
      setLoading(false);
    }

    // Show OTP boxes — pre-fill with default OTP if not using Supabase OTP
    const prefill = useSupabaseOtp ? ['', '', '', '', '', ''] : (defaultOtp ?? '123456').split('').slice(0, 6);
    setOtp(prefill);
    setOtpVisible(true);
    setTimeout(() => inputs.current[0]?.focus(), 100);
  };

  // ── Client: OTP digit change ───────────────────────────────
  const handleOtpChange = (text: string, index: number) => {
    setError(null);
    const next = [...otp];
    next[index] = text;
    setOtp(next);
    if (text && index < 5) inputs.current[index + 1]?.focus();
  };

  // ── Client: Verify OTP ────────────────────────────────────
  const handleVerifyOtp = async () => {
    const token = otp.join('');
    if (token.length < 6) { setError('Please enter all 6 digits.'); return; }

    setOtpLoading(true);
    setError(null);
    const cleanEmail = email.trim().toLowerCase();

    try {
      let authUser = null;

      if (useSupabaseOtp) {
        // Verify real Supabase OTP
        const { data, error: verifyErr } = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token,
          type: 'email',
        });
        if (verifyErr || !data?.user) {
          setOtpLoading(false);
          setError(verifyErr?.message ?? 'Invalid OTP. Please try again.');
          return;
        }
        authUser = data.user;
      } else {
        // Default OTP mode — verify against the stored default
        if (token !== (defaultOtp ?? '123456')) {
          setOtpLoading(false);
          setError(`Invalid OTP. Use the default OTP shown below.`);
          return;
        }
        // Sign up (creates if new) then sign in with deterministic password
        const pwd = `Pass#${cleanEmail.replace(/[^a-zA-Z0-9]/g, '')}!2026`;
        await supabase.auth.signUp({ email: cleanEmail, password: pwd });
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: pwd,
        });
        if (signInErr || !signInData?.user) {
          setOtpLoading(false);
          setError(signInErr?.message ?? 'Login failed. Please try again.');
          return;
        }
        authUser = signInData.user;
      }

      // Check profile status
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, is_active, valid_until')
        .eq('id', authUser.id)
        .single();

      setOtpLoading(false);

      if (profile?.is_active === false) {
        await supabase.auth.signOut();
        showAlert('Account Inactive', 'Your account has been deactivated. Please contact the administrator.');
        return;
      }
      if (profile?.valid_until && new Date(profile.valid_until) < new Date()) {
        await supabase.auth.signOut();
        showAlert('Subscription Expired', 'Your validity period has expired. Please contact admin.');
        return;
      }

      if (!profile?.full_name) {
        navigation.navigate('ProfileSetup', { email: cleanEmail });
      }
      // If profile is complete, RootNavigator will switch to AppNavigator automatically
      // once the session is set by the sign-in above.
    } catch (e: any) {
      setOtpLoading(false);
      setError(e.message || 'Verification failed.');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>🏠</Text>
          <Text style={styles.appName}>RentEase</Text>
          <Text style={styles.tagline}>Property & Tenant Management</Text>
        </View>

        {/* Error */}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        ) : null}

        {/* Email field */}
        <FormField
          label="Email Address"
          required
          placeholder="Enter your email"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={(t) => { setEmail(t); setError(null); setOtpVisible(false); setOtp(['', '', '', '', '', '']); }}
        />

        {/* Admin: password + login button */}
        {isAdmin ? (
          <View>
            <FormField
              label="Admin Password"
              required
              placeholder="Enter admin password"
              secureTextEntry
              value={password}
              onChangeText={(t) => { setPassword(t); setError(null); }}
            />
            <Text style={styles.adminHint}>🔒 Admin access detected</Text>
            <Button title="Sign In as Admin" onPress={handleAdminLogin} loading={loading} style={{ marginTop: 8 }} />
          </View>
        ) : (
          <View>
            {/* Get OTP button */}
            {!otpVisible && (
              <Button title="Get OTP" onPress={handleGetOtp} loading={loading} style={{ marginTop: 4 }} />
            )}

            {/* Inline OTP entry — shown after Get OTP */}
            {otpVisible && (
              <View style={styles.otpSection}>
                <View style={styles.otpHeader}>
                  <Text style={styles.otpLabel}>Enter OTP sent to {email.trim().toLowerCase()}</Text>
                  {!useSupabaseOtp && defaultOtp ? (
                    <Text style={styles.otpHint}>Default OTP: <Text style={styles.otpHintBold}>{defaultOtp}</Text></Text>
                  ) : null}
                </View>

                <View style={styles.otpRow}>
                  {otp.map((digit, i) => (
                    <TextInput
                      key={i}
                      ref={(r) => { inputs.current[i] = r; }}
                      style={styles.otpBox}
                      maxLength={1}
                      keyboardType="number-pad"
                      value={digit}
                      onChangeText={(t) => handleOtpChange(t, i)}
                      onKeyPress={({ nativeEvent }) => {
                        if (nativeEvent.key === 'Backspace' && !digit && i > 0) {
                          inputs.current[i - 1]?.focus();
                        }
                      }}
                    />
                  ))}
                </View>

                <Button
                  title="Verify & Continue"
                  onPress={handleVerifyOtp}
                  loading={otpLoading}
                  style={{ marginTop: 16 }}
                />

                <TouchableOpacity onPress={handleGetOtp} style={styles.resendBtn}>
                  <Text style={styles.resendText}>Resend OTP</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Biometric login */}
        {hasBiometrics && !otpVisible && (
          <TouchableOpacity style={styles.biometricBtn} onPress={handleBiometricAuth}>
            <Ionicons name="finger-print" size={24} color={COLORS.primary} />
            <Text style={styles.biometricText}>Login with Fingerprint / FaceID</Text>
          </TouchableOpacity>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.white },
  container: { flexGrow: 1, paddingHorizontal: 28, justifyContent: 'center', paddingVertical: 40 },
  header: { alignItems: 'center', marginBottom: 32 },
  logo: { fontSize: 56, marginBottom: 8 },
  appName: { fontSize: 30, fontWeight: '700', color: COLORS.primary, letterSpacing: 0.5 },
  tagline: { fontSize: 14, color: COLORS.muted, marginTop: 6 },
  errorBox: {
    backgroundColor: COLORS.dangerLight,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorText: { color: COLORS.danger, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  adminHint: { fontSize: 12, color: COLORS.primary, fontWeight: '600', marginTop: 2, marginBottom: 4 },
  otpSection: {
    marginTop: 20,
    padding: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  otpHeader: { marginBottom: 14 },
  otpLabel: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  otpHint: { fontSize: 12, color: COLORS.muted, marginTop: 4 },
  otpHintBold: { fontWeight: '700', color: COLORS.primary },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  otpBox: {
    flex: 1, height: 52, borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 10, textAlign: 'center', fontSize: 22, fontWeight: '700',
    color: COLORS.text, backgroundColor: COLORS.white,
  },
  resendBtn: { alignItems: 'center', marginTop: 14 },
  resendText: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
  biometricBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 20, paddingVertical: 12,
    borderWidth: 1, borderColor: COLORS.primaryLight,
    borderRadius: 10, backgroundColor: COLORS.surface,
  },
  biometricText: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
});
