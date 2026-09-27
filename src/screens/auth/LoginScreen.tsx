import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, TouchableOpacity, TextInput, StatusBar,
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

const HEADER_BLUE = '#1D4ED8';

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'> };

const ADMIN_EMAIL = 'srinivas06in@gmail.com';
const BIOMETRIC_KEY = 'rentease_biometric_enabled';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
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

  // ── Client: "Get OTP" pressed — navigate to OTP screen ────
  const handleGetOtp = async () => {
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) { setError('Please enter a valid email address.'); return; }

    setLoading(true);

    if (useSupabaseOtp) {
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { shouldCreateUser: true },
      });
      setLoading(false);
      if (otpErr) { setError(otpErr.message); return; }
    } else {
      setLoading(false);
    }

    navigation.navigate('OTP', { email: cleanEmail });
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BLUE} />

      {/* Blue banner header */}
      <View style={[styles.banner, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.bannerLogo}>🏠</Text>
        <Text style={styles.bannerAppName}>RentEase</Text>
        <Text style={styles.bannerTagline}>Property & Tenant Management</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
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
            <Button title="Get OTP →" onPress={handleGetOtp} loading={loading} style={{ marginTop: 4 }} />
          </View>
        )}

        {/* Biometric login */}
        {hasBiometrics && (
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
  banner: {
    backgroundColor: HEADER_BLUE,
    alignItems: 'center',
    paddingBottom: 28,
    paddingHorizontal: 24,
  },
  bannerLogo: { fontSize: 48, marginBottom: 8 },
  bannerAppName: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  bannerTagline: { fontSize: 14, color: 'rgba(255,255,255,0.78)', marginTop: 4 },
  container: { paddingHorizontal: 24, paddingTop: 28 },
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
