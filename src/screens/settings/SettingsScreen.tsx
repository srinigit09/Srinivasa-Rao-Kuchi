import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch, Platform,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import { COLORS } from '../../constants';
import Card from '../../components/common/Card';
import { formatDate, showAlert } from '../../utils';

const BIOMETRIC_KEY = 'rentease_biometric_enabled';

export default function SettingsScreen() {
  const { profile, signOut, refreshProfile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [upi, setUpi] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankIFSC, setBankIFSC] = useState('');
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
      setUpi(profile.upi_id ?? '');
      setBankName(profile.bank_name ?? '');
      setBankAccount(profile.bank_account ?? '');
      setBankIFSC(profile.bank_ifsc ?? '');
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
        upi_id: upi.trim() || null,
        bank_name: bankName.trim() || null,
        bank_account: bankAccount.trim() || null,
        bank_ifsc: bankIFSC.trim() || null,
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
        <FormField label="Date of Birth" value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD" />
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

      <Card title="Payment Details (shown on receipts & reminders)">
        <FormField label="UPI ID" value={upi} onChangeText={setUpi} placeholder="name@upi" keyboardType="email-address" />
        <FormField label="Bank Name" value={bankName} onChangeText={setBankName} placeholder="e.g. SBI, HDFC" />
        <FormField label="Account Number" value={bankAccount} onChangeText={setBankAccount} placeholder="Account number" keyboardType="numeric" />
        <FormField label="IFSC Code" value={bankIFSC} onChangeText={setBankIFSC} placeholder="e.g. SBIN0001234" autoCapitalize="characters" />
      </Card>

      <View style={styles.btnGroup}>
        <Button title="💾 Save Changes" onPress={save} loading={loading} />
        <Button title="Sign Out" onPress={handleSignOut} variant="ghost" />
      </View>

      <Text style={styles.version}>RentEase v1.0.0 · All rights reserved</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: COLORS.bg, paddingBottom: 40 },
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
});
