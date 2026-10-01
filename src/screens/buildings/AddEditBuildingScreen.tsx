import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AppStackParamList } from '../../navigation/RootNavigator';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import { COLORS, PROPERTY_TYPES } from '../../constants';
import { BuildingType } from '../../types';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, 'AddEditBuilding'>;
  route: RouteProp<AppStackParamList, 'AddEditBuilding'>;
};

export default function AddEditBuildingScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const editId = route.params?.buildingId;
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState<BuildingType>('residential');
  const [societyName, setSocietyName] = useState('');
  const [monthlyMaintenance, setMonthlyMaintenance] = useState('');
  const [gatePhone, setGatePhone] = useState('');
  const [rules, setRules] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (editId) {
      supabase.from('buildings').select('*').eq('id', editId).single().then(({ data }) => {
        if (data) {
          setName(data.name);
          setAddress(data.address ?? '');
          setType(data.building_type);
          setSocietyName(data.society_name ?? '');
          setMonthlyMaintenance(data.monthly_maintenance_charge ? String(data.monthly_maintenance_charge) : '');
          setGatePhone(data.gate_phone ?? '');
          setRules(data.rules ?? '');
        }
      });
    }
  }, [editId]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Property name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setLoading(true);
    const payload = {
      name: name.trim(),
      address: address.trim() || null,
      building_type: type,
      society_name: societyName.trim() || null,
      monthly_maintenance_charge: monthlyMaintenance ? parseFloat(monthlyMaintenance) : 0,
      gate_phone: gatePhone.trim() || null,
      rules: rules.trim() || null,
      owner_id: user!.id,
    };

    const { error } = editId
      ? await supabase.from('buildings').update(payload).eq('id', editId)
      : await supabase.from('buildings').insert(payload);
    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    navigation.goBack();
  };

  const isSocietyOrApartment = type === 'apartment' || type === 'gated_community';

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionHeading}>Select Property Category</Text>
        <View style={styles.typesGrid}>
          {PROPERTY_TYPES.map((pt) => {
            const isSelected = type === pt.id;
            return (
              <TouchableOpacity
                key={pt.id}
                style={[styles.typeCard, isSelected && styles.typeCardSelected]}
                onPress={() => setType(pt.id)}
                activeOpacity={0.8}
              >
                <View style={[styles.typeIconBox, isSelected && styles.typeIconBoxSelected]}>
                  <Ionicons
                    name={pt.icon as any}
                    size={22}
                    color={isSelected ? COLORS.white : COLORS.primary}
                  />
                </View>
                <View style={styles.typeTextWrap}>
                  <Text style={[styles.typeTitle, isSelected && styles.typeTitleSelected]}>
                    {pt.label}
                  </Text>
                  <Text style={styles.typeSub} numberOfLines={2}>
                    {pt.subtitle}
                  </Text>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} style={styles.checkIcon} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionHeading, { marginTop: 18 }]}>Property Details</Text>
        <FormField
          label={
            type === 'individual_house'
              ? 'House / Villa Name'
              : type === 'commercial'
              ? 'Commercial Property / Complex Name'
              : 'Property / Building Name'
          }
          required
          placeholder={
            type === 'individual_house'
              ? 'e.g. Green Villa No. 14'
              : type === 'commercial'
              ? 'e.g. Apex Commercial Plaza / City Mall'
              : 'e.g. Sunrise Heights'
          }
          value={name}
          onChangeText={setName}
          error={errors.name}
        />
        <FormField
          label="Address & Landmark"
          placeholder="Street, Locality, City, PIN"
          value={address}
          onChangeText={setAddress}
          multiline
          numberOfLines={2}
        />

        {isSocietyOrApartment && (
          <>
            <Text style={[styles.sectionHeading, { marginTop: 14 }]}>Society & Maintenance</Text>
            <FormField
              label="Society / Association Name"
              placeholder="e.g. Palm Meadows Owners Welfare Association"
              value={societyName}
              onChangeText={setSocietyName}
            />
            <FormField
              label="Standard Monthly Maintenance Charge (₹)"
              placeholder="e.g. 2500"
              keyboardType="numeric"
              value={monthlyMaintenance}
              onChangeText={setMonthlyMaintenance}
            />
            <FormField
              label="Security Gate / Guard Phone Number"
              placeholder="e.g. 9876543210"
              keyboardType="phone-pad"
              value={gatePhone}
              onChangeText={setGatePhone}
            />
            <FormField
              label="Society Bylaws / Common Rules"
              placeholder="e.g. Quiet hours 10 PM - 6 AM, Visitor parking in Bay 2..."
              value={rules}
              onChangeText={setRules}
              multiline
              numberOfLines={3}
            />
          </>
        )}

        <Button
          title={editId ? 'Update Property' : 'Save Property'}
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
  container: { padding: 18, paddingBottom: 40 },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  typesGrid: { gap: 8, marginBottom: 8 },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
  },
  typeCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#EFF6FF',
  },
  typeIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  typeIconBoxSelected: {
    backgroundColor: COLORS.primary,
  },
  typeTextWrap: { flex: 1 },
  typeTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  typeTitleSelected: { color: COLORS.primary },
  typeSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  checkIcon: { marginLeft: 8 },
});
