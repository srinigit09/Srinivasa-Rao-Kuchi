import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { AuthStackParamList } from '../../navigation/RootNavigator';
import { supabase } from '../../lib/supabase';
import Button from '../../components/common/Button';
import { COLORS } from '../../constants';
import { showAlert } from '../../utils';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'OTP'>;
  route: RouteProp<AuthStackParamList, 'OTP'>;
};

export default function OTPScreen({ navigation, route }: Props) {
  const { email, phone } = route.params;
  const target = email || phone || '';

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      // Load OTP mode from app_settings
      const { data: settings } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['default_otp', 'use_supabase_otp']);

      const map: Record<string, string> = {};
      (settings ?? []).forEach((r: { key: string; value: string }) => { map[r.key] = r.value; });
      const useSupabaseOtp = map['use_supabase_otp'] === 'true';
      const defaultOtp = map['default_otp'] ?? '123456';

      let authUser = null;

      if (useSupabaseOtp) {
        const { data, error: verifyErr } = await supabase.auth.verifyOtp({
          email: target,
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
        const pwd = `Pass#${target.replace(/[^a-zA-Z0-9]/g, '')}!2026`;
        await supabase.auth.signUp({ email: target, password: pwd });
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: target,
          password: pwd,
        });
        if (signInErr || !signInData?.user) {
          setLoading(false);
          setError(signInErr?.message ?? 'Login failed. Please try again.');
          return;
        }
        authUser = signInData.user;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, is_active, valid_until')
        .eq('id', authUser.id)
        .single();

      setLoading(false);

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
        navigation.navigate('ProfileSetup', { email: email || undefined });
      }
    } catch (e: any) {
      setLoading(false);
      setError(e.message || 'Verification failed.');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Text style={styles.title}>Enter OTP</Text>
        <Text style={styles.sub}>Sent to {target}</Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        ) : null}

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

        <Button title="Verify & Continue" onPress={handleVerify} loading={loading} style={{ marginTop: 24 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.white },
  container: { flex: 1, paddingHorizontal: 28, justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  sub: { fontSize: 14, color: COLORS.muted, marginBottom: 32 },
  errorBox: {
    backgroundColor: COLORS.dangerLight,
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorText: { color: COLORS.danger, fontSize: 13, fontWeight: '500' },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  otpBox: {
    flex: 1, height: 56, borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 10, textAlign: 'center', fontSize: 22, fontWeight: '700',
    color: COLORS.text, backgroundColor: COLORS.surface,
  },
});
