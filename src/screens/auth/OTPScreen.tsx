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

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'OTP'>;
  route: RouteProp<AuthStackParamList, 'OTP'>;
};


export default function OTPScreen({ navigation, route }: Props) {
  const { phone, email } = route.params;
  const isPhoneFlow = !!phone;
  const target = phone
    ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`
    : (email ?? '');
  const insets = useSafeAreaInsets();

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const inputs = useRef<(TextInput | null)[]>([]);

  const handleChange = (text: string, index: number) => {
    setError(null);
    const next = [...otp];
    next[index] = text;
    setOtp(next);
    if (text && index < 5) inputs.current[index + 1]?.focus();
  };

  const handleVerify = async () => {
    const token = otp.join('');
    if (token.length < 6) { setError('Please enter all 6 digits.'); return; }

    setLoading(true);
    setError(null);

    try {
      if (isPhoneFlow) {
        // ── MSG91 OTP verification via Edge Function ──────────────────────────
        const { data, error: fnErr } = await supabase.functions.invoke('verify-otp', {
          body: { phone, otp: token },
        });

        setLoading(false);

        if (fnErr || data?.error) {
          setError(data?.error ?? fnErr?.message ?? 'Invalid OTP. Please try again.');
          return;
        }

        // Set the Supabase session returned from the Edge Function
        await supabase.auth.setSession({
          access_token:  data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        // Account status checks
        if (data.profile?.is_active === false) {
          await supabase.auth.signOut();
          showAlert('Account Inactive', 'Your account has been deactivated. Please contact the administrator.');
          return;
        }
        if (data.profile?.valid_until && new Date(data.profile.valid_until) < new Date()) {
          await supabase.auth.signOut();
          showAlert('Subscription Expired', 'Your validity period has expired. Please contact admin.');
          return;
        }

        // New user — go to profile setup
        if (data.isNewUser || !data.profile?.full_name) {
          navigation.navigate('ProfileSetup', { phone });
        }
        // Existing user — RootNavigator detects session and redirects automatically

      } else {
        // ── Legacy email/default OTP flow ─────────────────────────────────────
        const { data: settings } = await supabase
          .from('app_settings')
          .select('key, value')
          .in('key', ['default_otp', 'use_supabase_otp']);
        const map: Record<string, string> = {};
        (settings ?? []).forEach((r: any) => { map[r.key] = r.value; });
        const useSupabaseOtp = map['use_supabase_otp'] === 'true';
        const defaultOtp = map['default_otp'] ?? '123456';

        let authUser = null;
        if (useSupabaseOtp) {
          const { data, error: verifyErr } = await supabase.auth.verifyOtp({
            email: email!,
            token,
            type: 'email',
          });
          if (verifyErr || !data?.user) {
            setLoading(false);
            setError(verifyErr?.message ?? 'Invalid OTP. Please try again.');
            return;
          }
          authUser = data.user;
        } else {
          if (token !== defaultOtp) {
            setLoading(false);
            setError(`Invalid OTP. Default is ${defaultOtp}.`);
            return;
          }
          const pwd = `Pass#${email!.replace(/[^a-zA-Z0-9]/g, '')}!2026`;
          await supabase.auth.signUp({ email: email!, password: pwd });
          const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
            email: email!, password: pwd,
          });
          if (signInErr || !signInData?.user) {
            setLoading(false);
            setError(signInErr?.message ?? 'Login failed. Please try again.');
            return;
          }
          authUser = signInData.user;
        }

        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, full_name, is_active, valid_until')
          .eq('id', authUser.id)
          .single();

        setLoading(false);
        if (profileData?.is_active === false) {
          await supabase.auth.signOut();
          showAlert('Account Inactive', 'Your account has been deactivated. Please contact the administrator.');
          return;
        }
        if (profileData?.valid_until && new Date(profileData.valid_until) < new Date()) {
          await supabase.auth.signOut();
          showAlert('Subscription Expired', 'Your validity period has expired. Please contact admin.');
          return;
        }
        if (!profileData?.full_name) {
          navigation.navigate('ProfileSetup', { email: email || undefined });
        }
      }
    } catch (e: any) {
      setLoading(false);
      setError(e.message || 'Verification failed.');
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    setError(null);
    setOtp(['', '', '', '', '', '']);
    try {
      if (isPhoneFlow) {
        const { data, error: fnErr } = await supabase.functions.invoke('send-otp', {
          body: { phone },
        });
        if (fnErr || data?.error) setError(data?.error ?? fnErr?.message ?? 'Failed to resend OTP.');
      } else {
        navigation.goBack();
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to resend OTP.');
    }
    setResendLoading(false);
    inputs.current[0]?.focus();
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
            {isPhoneFlow ? '📱 SMS sent to ' : '📧 Sent to '}{target}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        {isPhoneFlow && (
          <View style={styles.hintBox}>
            <Ionicons name="chatbubble-outline" size={18} color={COLORS.primary} />
            <Text style={styles.hintText}>
              Check your <Text style={styles.hintBold}>SMS messages</Text> for the 6-digit OTP from Supabase / your service provider.
            </Text>
          </View>
        )}

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
                {isPhoneFlow ? '🔄 Resend OTP' : '← Change email / Resend OTP'}
              </Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.white },
  banner: {
    backgroundColor: COLORS.primaryDark,
    paddingHorizontal: 16, paddingBottom: 20,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  bannerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  bannerSub: { fontSize: 13, color: 'rgba(255,255,255,0.78)', marginTop: 2 },
  body: { paddingHorizontal: 24, paddingTop: 32 },
  hintBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: COLORS.primaryLight, borderRadius: 10,
    padding: 14, marginBottom: 20,
  },
  hintText: { flex: 1, fontSize: 14, color: COLORS.primary, lineHeight: 20 },
  hintBold: { fontWeight: '800' },
  errorBox: {
    backgroundColor: COLORS.dangerLight, padding: 12, borderRadius: 8,
    marginBottom: 16, borderWidth: 1, borderColor: '#FCA5A5',
  },
  errorText: { color: COLORS.danger, fontSize: 13, fontWeight: '500' },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 12 },
  otpRow: { flexDirection: 'row', gap: 8 },
  otpBox: {
    flex: 1, height: 58, borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 10, textAlign: 'center', fontSize: 24, fontWeight: '700',
    color: COLORS.text, backgroundColor: COLORS.surface,
  },
  resendBtn: { alignItems: 'center', marginTop: 20, paddingVertical: 8 },
  resendText: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
});
