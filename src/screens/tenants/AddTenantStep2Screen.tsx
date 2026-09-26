import React, { useState, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { AppStackParamList } from '../../navigation/RootNavigator';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import SelectField from '../../components/common/SelectField';
import { COLORS, ID_TYPES } from '../../constants';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, 'AddTenantStep2'>;
  route: RouteProp<AppStackParamList, 'AddTenantStep2'>;
};

export default function AddTenantStep2Screen({ navigation, route }: Props) {
  const { buildingId, unitId, buildingType } = route.params;
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] })}
          style={{ paddingHorizontal: 4 }}
        >
          <Text style={{ color: COLORS.danger, fontWeight: '600', fontSize: 15 }}>Cancel</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [idType, setIdType] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.fullName = 'Full name is required';
    if (!phone.trim() || phone.replace(/\D/, '').length < 10) e.phone = 'Enter a valid 10-digit mobile number';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validate()) return;
    navigation.navigate('AddTenantStep3', {
      buildingId, unitId, buildingType,
      tenantData: { fullName, phone, email, idType, idNumber },
    });
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <FormField label="Full Name" required placeholder="Tenant's full name" value={fullName} onChangeText={setFullName} error={errors.fullName} />
        <FormField label="Mobile Number" required placeholder="10-digit number" keyboardType="phone-pad" maxLength={10} value={phone} onChangeText={setPhone} error={errors.phone} />
        <FormField label="Email (optional)" placeholder="email@example.com" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
        <SelectField label="ID Proof Type" options={[...ID_TYPES]} value={idType} onChange={setIdType} />
        {idType ? (
          <FormField label={`${idType} Number`} placeholder="ID number" value={idNumber} onChangeText={setIdNumber} autoCapitalize="characters" />
        ) : null}
        <Button title="Next: Rent & Deposit →" onPress={next} style={{ marginTop: 16 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.white },
  container: { padding: 20, paddingBottom: 40 },
});
