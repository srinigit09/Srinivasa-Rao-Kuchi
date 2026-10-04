import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import DatePickerField from '../../components/common/DatePickerField';
import { COLORS } from '../../constants';
import Card from '../../components/common/Card';
import { formatDate, showAlert } from '../../utils';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';

const BIOMETRIC_KEY = 'rentease_biometric_enabled';

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { profile, signOut, refreshProfile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Biometric state
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.full_name ?? '');
      setEmail(profile.email ?? '');
      setPhone(profile.phone ?? '');
      setDob(profile.dob ?? '');
    }
    checkBiometricSupport();
  }, [profile]);

  const checkBiometricSupport = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(compatible && enrolled);

      const saved = await AsyncStorage.getItem(BIOMETRIC_KEY);
      setBiometricEnabled(saved === 'true');
    } catch {
      // ignore
    }
  };

  const toggleBiometrics = async (val: boolean) => {
    if (val) {
      const auth = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Enable Biometric Login',
      });
      if (auth.success) {
        await AsyncStorage.setItem(BIOMETRIC_KEY, 'true');
        setBiometricEnabled(true);
        showAlert('Success', 'Biometric login enabled.');
      }
    } else {
      await AsyncStorage.setItem(BIOMETRIC_KEY, 'false');
      setBiometricEnabled(false);
    }
  };

  const save = async () => {
    if (!name.trim()) {
      showAlert('Required', 'Full name is required.');
      return;
    }
    setLoading(true);
    try {
      // Update email in auth if admin changed it
      if (isAdmin && email.trim() && email.trim() !== profile?.email) {
        const { error: authEmailErr } = await supabase.auth.updateUser({ email: email.trim() });
        if (authEmailErr) {
          showAlert('Email Update Warning', authEmailErr.message);
        }
      }

      // Update password if admin entered one
      if (isAdmin && newPassword.trim()) {
        const { error: authPassErr } = await supabase.auth.updateUser({ password: newPassword.trim() });
        if (authPassErr) {
          showAlert('Password Update Warning', authPassErr.message);
        } else {
          setNewPassword('');
        }
      }

      const updateData: any = {
        full_name: name.trim(),
        phone: phone.trim() || null,
        dob: dob.trim() || null,
      };

      if (isAdmin && email.trim()) {
        updateData.email = email.trim();
      }

      const { error } = await supabase.from('profiles').update(updateData).eq('id', profile!.id);

      setLoading(false);
      if (error) {
        showAlert('Error', error.message);
        return;
      }
      await refreshProfile();
      showAlert('✅ Saved', 'Profile updated successfully.');
    } catch (e: any) {
      setLoading(false);
      showAlert('Error', e.message || 'Failed to update profile');
    }
  };

  const handleSignOut = () => {
    showAlert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
    <BlueBannerHeader
      title="Settings"
      subtitle="Profile & preferences"
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
    />
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Card title="Account Profile">
        <FormField label="Full Name" required value={name} onChangeText={setName} placeholder="Your name" />
        <FormField
          label="Email Address"
          value={email}
          onChangeText={setEmail}
          placeholder="your.email@example.com"
          editable={isAdmin}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <FormField label="Mobile Number" value={phone} onChangeText={setPhone} placeholder="10-digit mobile" keyboardType="phone-pad" />
        <DatePickerField label="Date of Birth" value={dob} onChange={setDob} />
        {isAdmin && (
          <View>
            <View style={styles.badgeRow}>
              <Text style={styles.adminRoleText}>Role: SUPER ADMIN</Text>
            </View>
            <FormField
              label="Change Admin Password"
              placeholder="Leave empty to keep current password"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
          </View>
        )}
        {!isAdmin && profile?.valid_until && (
          <Text style={styles.validityText}>
            Validity Until: {formatDate(profile.valid_until)}
          </Text>
        )}
      </Card>

      {biometricAvailable && (
        <Card title="Security & Biometrics">
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Enable Fingerprint / FaceID</Text>
              <Text style={styles.switchSub}>Quickly unlock your app without entering credentials</Text>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={toggleBiometrics}
              trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
              thumbColor={biometricEnabled ? COLORS.primary : '#f4f3f4'}
            />
          </View>
        </Card>
      )}

      <View style={styles.btnGroup}>
        <Button title="💾 Save Changes" onPress={save} loading={loading} />
        <Button title="Sign Out" onPress={handleSignOut} variant="ghost" />
      </View>

      <Text style={styles.version}>RentEase v1.0.0 · All rights reserved</Text>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: COLORS.bg, paddingBottom: 40, flexGrow: 1 },
  badgeRow: { marginTop: 4, marginBottom: 8 },
  adminRoleText: {
    color: '#D97706',
    fontWeight: '700',
    fontSize: 12,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  validityText: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  switchTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  switchSub: { fontSize: 12, color: COLORS.muted, marginTop: 2, paddingRight: 8 },
  btnGroup: { marginHorizontal: 16, marginTop: 8, gap: 8 },
  version: { textAlign: 'center', fontSize: 12, color: COLORS.muted, marginTop: 24 },
  loginModeDesc: { fontSize: 13, color: COLORS.muted, marginBottom: 12, lineHeight: 18 },
  modeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
    backgroundColor: COLORS.bg,
  },
  modeOptionActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#EEF2FF',
  },
  modeRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.border,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeRadioActive: { borderColor: COLORS.primary },
  modeRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  modeTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  modeSub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  modeSaving: { fontSize: 12, color: COLORS.muted, textAlign: 'center', marginTop: 4 },
  guideBox: {
    marginTop: 16,
    backgroundColor: '#F0F4FF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  guideTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  guideStep: {
    flexDirection: 'row',
    marginBottom: 14,
    gap: 10,
  },
  guideNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
    overflow: 'hidden',
  },
  guideStepTitle: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 3 },
  guideStepSub: { fontSize: 12, color: COLORS.muted, lineHeight: 17, marginBottom: 5 },
  guideCode: { fontFamily: 'monospace', fontSize: 11, color: '#1e40af' },
  linkRow: { flexDirection: 'row', gap: 12, marginTop: 4, flexWrap: 'wrap' },
  link: { fontSize: 12, color: COLORS.primary, fontWeight: '600', textDecorationLine: 'underline' },
  codeBox: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    padding: 10,
    marginTop: 6,
  },
  codeText: { fontSize: 11, color: '#e2e8f0', fontFamily: 'monospace', lineHeight: 18 },
  subPricingDesc: { fontSize: 13, color: COLORS.muted, marginBottom: 12, lineHeight: 18 },
  subPricingRow: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  subPricingLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  subPricingInputs: { flexDirection: 'row', gap: 10 },
  subPricingField: { flex: 1 },
  subPricingFieldLabel: { fontSize: 11, color: COLORS.muted, marginBottom: 4 },
  subPricingInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
});
