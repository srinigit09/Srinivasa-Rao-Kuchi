import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Linking, TextInput,
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
type LoginMode = 'bypass' | 'email' | 'phone';

export default function SettingsScreen() {
  const navigation = useNavigation();
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

  // Login mode (admin only)
  const [loginMode, setLoginMode] = useState<LoginMode>('bypass');
  const [loginModeSaving, setLoginModeSaving] = useState(false);

  // Subscription pricing (admin only)
  type SubPlan = { id: string; name: string; label: string; price_per_tenant: number; price_per_property: number };
  const [subPlans, setSubPlans] = useState<SubPlan[]>([]);
  const [subPricingEdits, setSubPricingEdits] = useState<Record<string, { price_per_tenant: string; price_per_property: string }>>({});
  const [subPricingSaving, setSubPricingSaving] = useState(false);

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
    if (isAdmin) {
      loadLoginMode();
      loadSubPlans();
    }
  }, [profile]);

  const loadSubPlans = async () => {
    const { data } = await supabase.from('subscription_plans').select('*').order('created_at');
    if (data) {
      setSubPlans(data as SubPlan[]);
      const edits: Record<string, { price_per_tenant: string; price_per_property: string }> = {};
      (data as SubPlan[]).forEach((p: SubPlan) => {
        edits[p.id] = {
          price_per_tenant: String(p.price_per_tenant),
          price_per_property: String(p.price_per_property),
        };
      });
      setSubPricingEdits(edits);
    }
  };

  const saveSubPricing = async () => {
    setSubPricingSaving(true);
    const updates = subPlans.map(p => {
      const edit = subPricingEdits[p.id];
      return supabase
        .from('subscription_plans')
        .update({
          price_per_tenant: parseFloat(edit?.price_per_tenant ?? '0') || 0,
          price_per_property: parseFloat(edit?.price_per_property ?? '0') || 0,
        })
        .eq('id', p.id);
    });
    const results = await Promise.all(updates);
    setSubPricingSaving(false);
    const err = results.find(r => r.error)?.error;
    if (err) showAlert('Save Error', err.message);
    else showAlert('✅ Saved', 'Subscription pricing updated.');
  };

  const loadLoginMode = async () => {
    const { data } = await supabase
      .from('app_settings').select('value').eq('key', 'login_mode').single();
    if (data) setLoginMode(((data as any).value as LoginMode) || 'bypass');
  };

  const saveLoginMode = async (mode: LoginMode) => {
    setLoginModeSaving(true);
    setLoginMode(mode);
    await supabase.from('app_settings').upsert(
      { key: 'login_mode', value: mode },
      { onConflict: 'key' }
    );
    setLoginModeSaving(false);
    showAlert('✅ Saved', `Login mode changed to "${mode}". Takes effect on next app open.`);
  };

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

      <Card title="Payment Details (shown on receipts & reminders)">
        <FormField label="UPI ID" value={upi} onChangeText={setUpi} placeholder="name@upi" keyboardType="email-address" />
        <FormField label="Bank Name" value={bankName} onChangeText={setBankName} placeholder="e.g. SBI, HDFC" />
        <FormField label="Account Number" value={bankAccount} onChangeText={setBankAccount} placeholder="Account number" keyboardType="numeric" />
        <FormField label="IFSC Code" value={bankIFSC} onChangeText={setBankIFSC} placeholder="e.g. SBIN0001234" autoCapitalize="characters" />
      </Card>

      {/* ── Admin: Login Mode Control ── */}
      {isAdmin && (
        <Card title="🔐 Login Mode (Admin Control)">
          <Text style={styles.loginModeDesc}>
            Controls how users log in. Change this when you're ready to enable OTP.
          </Text>

          {(['bypass', 'email', 'phone'] as LoginMode[]).map((mode) => {
            const labels = {
              bypass: { title: 'Bypass (No OTP)', sub: 'Phone + Name only. Free forever. Current default.' },
              email:  { title: 'Email OTP',       sub: 'OTP sent to email. Free via Supabase.' },
              phone:  { title: 'Mobile SMS OTP',  sub: 'OTP via SMS (MSG91). ~₹0.20/SMS. Complete setup below first.' },
            };
            const isActive = loginMode === mode;
            return (
              <TouchableOpacity
                key={mode}
                style={[styles.modeOption, isActive && styles.modeOptionActive]}
                onPress={() => !isActive && !loginModeSaving && saveLoginMode(mode)}
                activeOpacity={0.7}
              >
                <View style={[styles.modeRadio, isActive && styles.modeRadioActive]}>
                  {isActive && <View style={styles.modeRadioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modeTitle, isActive && { color: COLORS.primary }]}>
                    {labels[mode].title}
                    {isActive ? '  ✓ Active' : ''}
                  </Text>
                  <Text style={styles.modeSub}>{labels[mode].sub}</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {loginModeSaving && (
            <Text style={styles.modeSaving}>Saving…</Text>
          )}

          {/* ── Phone OTP Setup Checklist ── */}
          <View style={styles.guideBox}>
            <Text style={styles.guideTitle}>📋 Complete these steps before switching to Mobile SMS OTP</Text>

            <View style={styles.guideStep}>
              <Text style={styles.guideNum}>1</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.guideStepTitle}>Register on DLT Portal (India mandatory)</Text>
                <Text style={styles.guideStepSub}>Individual OK — need PAN + Aadhaar. Takes 1–3 days. You will get a PE ID and Template ID.</Text>
                <View style={styles.linkRow}>
                  <TouchableOpacity onPress={() => Linking.openURL('https://smsheader.trai.gov.in')}>
                    <Text style={styles.link}>TRAI DLT Portal (smsheader.trai.gov.in) →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.guideStep}>
              <Text style={styles.guideNum}>2</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.guideStepTitle}>Create OTP Template on MSG91</Text>
                <Text style={styles.guideStepSub}>
                  Sender ID: RENTEASE · OTP Length: 6 · Expiry: 10 min{'\n'}
                  Template body:{'\n'}
                  <Text style={styles.guideCode}>Your RentEase OTP is ##OTP##. Valid for 10 minutes.</Text>{'\n'}
                  Enter DLT PE ID + DLT Template ID when asked. Note down the MSG91 Template ID.
                </Text>
                <TouchableOpacity onPress={() => Linking.openURL('https://msg91.com/in/otp')}>
                  <Text style={styles.link}>Open MSG91 OTP Templates →</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.guideStep}>
              <Text style={styles.guideNum}>3</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.guideStepTitle}>Deploy Edge Functions (one-time terminal)</Text>
                <View style={styles.codeBox}>
                  <Text style={styles.codeText}>{'supabase functions deploy send-otp\nsupabase functions deploy verify-otp\nsupabase secrets set MSG91_AUTH_KEY=<your_key>\nsupabase secrets set MSG91_TEMPLATE_ID=<msg91_template_id>'}</Text>
                </View>
              </View>
            </View>

            <View style={styles.guideStep}>
              <Text style={styles.guideNum}>4</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.guideStepTitle}>Add credits on MSG91 & switch above ✓</Text>
                <Text style={styles.guideStepSub}>No subscription needed. ~₹0.20/SMS. Min recharge ₹100. Charged only when tenants log in via SMS OTP.</Text>
                <TouchableOpacity onPress={() => Linking.openURL('https://msg91.com')}>
                  <Text style={styles.link}>Open MSG91 Dashboard →</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Card>
      )}

      {/* ── Admin: Subscription Pricing ── */}
      {isAdmin && subPlans.length > 0 && (
        <Card title="💰 Subscription Pricing">
          <Text style={styles.subPricingDesc}>
            Set the pricing shown to clients on the Activate screen.
          </Text>
          {subPlans.map(plan => (
            <View key={plan.id} style={styles.subPricingRow}>
              <Text style={styles.subPricingLabel}>{plan.label}</Text>
              <View style={styles.subPricingInputs}>
                <View style={styles.subPricingField}>
                  <Text style={styles.subPricingFieldLabel}>Per Tenant (₹)</Text>
                  <TextInput
                    style={styles.subPricingInput}
                    value={subPricingEdits[plan.id]?.price_per_tenant ?? ''}
                    onChangeText={v =>
                      setSubPricingEdits(prev => ({ ...prev, [plan.id]: { ...prev[plan.id], price_per_tenant: v } }))
                    }
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={COLORS.muted}
                  />
                </View>
                <View style={styles.subPricingField}>
                  <Text style={styles.subPricingFieldLabel}>Per Property (₹)</Text>
                  <TextInput
                    style={styles.subPricingInput}
                    value={subPricingEdits[plan.id]?.price_per_property ?? ''}
                    onChangeText={v =>
                      setSubPricingEdits(prev => ({ ...prev, [plan.id]: { ...prev[plan.id], price_per_property: v } }))
                    }
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={COLORS.muted}
                  />
                </View>
              </View>
            </View>
          ))}
          <Button
            title="Save Pricing"
            onPress={saveSubPricing}
            loading={subPricingSaving}
            style={{ marginTop: 8 }}
          />
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
