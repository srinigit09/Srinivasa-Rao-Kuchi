import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { AppStackParamList } from '../../navigation/RootNavigator';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import SelectField from '../../components/common/SelectField';
import { COLORS, MAINTENANCE_CATEGORIES } from '../../constants';
import { MaintenanceCategory } from '../../types';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, any>;
  route: RouteProp<AppStackParamList, any>;
};

export default function AddEditVendorScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const vendorId = (route.params as any)?.vendorId;

  const [name, setName] = useState('');
  const [category, setCategory] = useState<MaintenanceCategory>('Plumbing');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (vendorId) {
      supabase.from('service_vendors').select('*').eq('id', vendorId).single().then(({ data }) => {
        if (data) {
          setName(data.name);
          setCategory(data.category);
          setPhone(data.phone);
          setAlternatePhone(data.alternate_phone ?? '');
          setAddress(data.address ?? '');
          setNotes(data.notes ?? '');
        }
      });
    }
  }, [vendorId]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Technician or Vendor name is required';
    const cleanPhone = phone.replace(/\D/g, '');
    if (!phone.trim() || cleanPhone.length < 10) e.phone = 'Enter a valid 10-digit phone number';
    if (alternatePhone.trim()) {
      const cleanAlt = alternatePhone.replace(/\D/g, '');
      if (cleanAlt.length < 10) e.alternatePhone = 'Enter a valid 10-digit phone number';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setLoading(true);
    const payload = {
      owner_id: user!.id,
      name: name.trim(),
      category,
      phone: phone.trim(),
      alternate_phone: alternatePhone.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
    };

    const { error } = vendorId
      ? await supabase.from('service_vendors').update(payload).eq('id', vendorId)
      : await supabase.from('service_vendors').insert(payload);

    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 20}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <FormField
          label="Technician / Business Name"
          required
          placeholder="e.g. Ramesh Sharma"
          value={name}
          onChangeText={setName}
          error={errors.name}
        />

        <SelectField
          label="Specialty / Category"
          required
          options={[...MAINTENANCE_CATEGORIES]}
          value={category}
          onChange={(v) => setCategory(v as any)}
        />

        <FormField
          label="Primary Phone Number"
          required
          placeholder="e.g. 9876543210"
          keyboardType="phone-pad"
          maxLength={10}
          value={phone}
          onChangeText={setPhone}
          error={errors.phone}
        />

        <FormField
          label="Alternate Phone Number (Optional)"
          placeholder="e.g. 9123456780"
          keyboardType="phone-pad"
          maxLength={10}
          value={alternatePhone}
          onChangeText={setAlternatePhone}
          error={errors.alternatePhone}
        />

        <FormField
          label="Address / Shop Location"
          placeholder="Street, Area, City"
          value={address}
          onChangeText={setAddress}
          multiline
          numberOfLines={2}
        />

        <FormField
          label="Notes (Charges / Working Hours / Recommendations)"
          placeholder="e.g. ₹300 visit charge, available 8am-8pm"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={2}
        />

        <Button
          title={vendorId ? 'Update Contact' : 'Save Contact'}
          onPress={save}
          loading={loading}
          style={{ marginTop: 24 }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.white },
  container: { padding: 18, paddingBottom: 100 },
});
