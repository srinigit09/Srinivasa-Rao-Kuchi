import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { AppStackParamList } from '../../navigation/RootNavigator';
import { supabase } from '../../lib/supabase';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import SelectField from '../../components/common/SelectField';
import DatePickerField from '../../components/common/DatePickerField';
import { COLORS, ID_TYPES, RESIDENT_TYPES, STAY_TYPES } from '../../constants';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, 'EditTenant'>;
  route: RouteProp<AppStackParamList, 'EditTenant'>;
};

export default function EditTenantScreen({ navigation, route }: Props) {
  const { tenantId } = route.params;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Personal
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [idType, setIdType] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [residentType, setResidentType] = useState('tenant');
  const [stayType, setStayType] = useState('month');

  // Financial & extras
  const [rentOverride, setRentOverride] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [moveInDate, setMoveInDate] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setLoading(true);
    supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single()
      .then(({ data }) => {
        if (data) {
          setFullName(data.full_name ?? '');
          setPhone(data.phone ?? '');
          setEmail(data.email ?? '');
          setIdType(data.id_type ?? '');
          setIdNumber(data.id_number ?? '');
          setResidentType(data.resident_type ?? 'tenant');
          setStayType(data.stay_type ?? 'month');
          setRentOverride(data.rent_override ? String(data.rent_override) : '');
          setDepositAmount(data.deposit_amount ? String(data.deposit_amount) : '');
          setMoveInDate(data.move_in_date ?? '');
          setEmergencyName(data.emergency_name ?? '');
          setEmergencyPhone(data.emergency_phone ?? '');
          setNotes(data.notes ?? '');
        }
        setLoading(false);
      });
  }, [tenantId]);

  const save = async () => {
    if (!fullName.trim()) {
      Alert.alert('Required', 'Please enter the resident name.');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Required', 'Please enter the phone number.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('tenants').update({
      full_name: fullName.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      id_type: idType || null,
      id_number: idNumber.trim() || null,
      resident_type: residentType,
      stay_type: stayType,
      rent_override: rentOverride ? parseFloat(rentOverride) : null,
      deposit_amount: depositAmount ? parseFloat(depositAmount) : 0,
      move_in_date: moveInDate || null,
      emergency_name: emergencyName.trim() || null,
      emergency_phone: emergencyPhone.trim() || null,
      notes: notes.trim() || null,
    }).eq('id', tenantId);
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    navigation.goBack();
  };

  if (loading) {
    return <View style={styles.loadingWrap}><Text style={styles.loadingText}>Loading…</Text></View>;
  }

  const isOwner = residentType === 'owner_occupant';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 20}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>Personal Details</Text>

        <FormField
          label="Full Name"
          required
          placeholder="Resident full name"
          value={fullName}
          onChangeText={setFullName}
        />
        <FormField
          label="Phone Number"
          required
          placeholder="10-digit mobile number"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
        <FormField
          label="Email (Optional)"
          placeholder="email@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <SelectField
          label="Resident Type"
          options={RESIDENT_TYPES.map(r => r.label)}
          value={RESIDENT_TYPES.find(r => r.id === residentType)?.label ?? 'Tenant (Rent Payer)'}
          onChange={(val) => {
            const found = RESIDENT_TYPES.find(r => r.label === val);
            if (found) setResidentType(found.id as string);
          }}
        />
        {!isOwner && (
          <SelectField
            label="Stay Type"
            options={STAY_TYPES.map(s => s.label)}
            value={STAY_TYPES.find(s => s.id === stayType)?.label ?? 'Month Wise'}
            onChange={(val) => {
              const found = STAY_TYPES.find(s => s.label === val);
              if (found) setStayType(found.id as string);
            }}
          />
        )}
        <SelectField
          label="ID Type (Optional)"
          options={['— None —', ...ID_TYPES]}
          value={idType ? idType : '— None —'}
          onChange={(val) => setIdType(val === '— None —' ? '' : val)}
        />
        {idType ? (
          <FormField
            label={`${idType} Number`}
            placeholder="ID number"
            value={idNumber}
            onChangeText={setIdNumber}
          />
        ) : null}

        <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Financial Details</Text>

        {!isOwner && (
          <FormField
            label="Rent Override (₹, optional)"
            placeholder="Leave blank to use unit default"
            keyboardType="decimal-pad"
            value={rentOverride}
            onChangeText={setRentOverride}
          />
        )}
        <FormField
          label="Security Deposit (₹)"
          placeholder="e.g. 20000"
          keyboardType="decimal-pad"
          value={depositAmount}
          onChangeText={setDepositAmount}
        />
        <DatePickerField
          label="Move-In Date"
          value={moveInDate}
          onChange={setMoveInDate}
        />

        <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Emergency & Notes</Text>

        <FormField
          label="Emergency Contact Name"
          placeholder="Name"
          value={emergencyName}
          onChangeText={setEmergencyName}
        />
        <FormField
          label="Emergency Contact Phone"
          placeholder="Phone"
          keyboardType="phone-pad"
          value={emergencyPhone}
          onChangeText={setEmergencyPhone}
        />
        <FormField
          label="Notes"
          placeholder="Any remarks or special notes"
          multiline
          numberOfLines={3}
          value={notes}
          onChangeText={setNotes}
        />

        <Button
          title="💾 Save Changes"
          onPress={save}
          loading={saving}
          style={{ marginTop: 24 }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.white },
  container: { padding: 20, paddingBottom: 160 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.muted, fontSize: 15 },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: COLORS.muted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
});
