import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { AppStackParamList } from '../../navigation/RootNavigator';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import SelectField from '../../components/common/SelectField';
import { COLORS, RESIDENTIAL_UNIT_TYPES, PG_UNIT_TYPES } from '../../constants';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, 'AddEditUnit'>;
  route: RouteProp<AppStackParamList, 'AddEditUnit'>;
};

export default function AddEditUnitScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { buildingId, unitId } = route.params;
  const [buildingType, setBuildingType] = useState<'residential' | 'pg'>('residential');
  const [unitNumber, setUnitNumber] = useState('');
  const [unitType, setUnitType] = useState('');
  const [totalBeds, setTotalBeds] = useState('1');
  const [rentPerBed, setRentPerBed] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.from('buildings').select('building_type').eq('id', buildingId).single()
      .then(({ data }) => { if (data) setBuildingType(data.building_type as any); });
    if (unitId) {
      supabase.from('units').select('*').eq('id', unitId).single().then(({ data }) => {
        if (data) {
          setUnitNumber(data.unit_number);
          setUnitType(data.unit_type);
          setTotalBeds(String(data.total_beds));
          setRentPerBed(String(data.rent_per_bed));
        }
      });
    }
  }, [buildingId, unitId]);

  const typeOptions = buildingType === 'residential' ? [...RESIDENTIAL_UNIT_TYPES] : [...PG_UNIT_TYPES];

  const validate = () => {
    const e: Record<string, string> = {};
    if (!unitNumber.trim()) e.unitNumber = 'Unit number is required';
    if (!unitType) e.unitType = 'Please select a unit type';
    if (!rentPerBed || isNaN(Number(rentPerBed))) e.rentPerBed = 'Enter valid rent amount';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setLoading(true);
    const payload = {
      building_id: buildingId,
      owner_id: user!.id,
      unit_number: unitNumber.trim(),
      unit_type: unitType,
      total_beds: parseInt(totalBeds) || 1,
      rent_per_bed: parseFloat(rentPerBed),
    };
    const { error } = unitId
      ? await supabase.from('units').update(payload).eq('id', unitId)
      : await supabase.from('units').insert(payload);
    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <FormField label="Unit Number" required placeholder="e.g. 101, A-2, Room 5" value={unitNumber} onChangeText={setUnitNumber} error={errors.unitNumber} />
        <SelectField
          label={buildingType === 'residential' ? 'Flat Type' : 'Room Type'}
          required
          options={typeOptions}
          value={unitType}
          onChange={setUnitType}
          error={errors.unitType}
        />
        <FormField
          label={buildingType === 'pg' ? 'Number of Beds in Room' : 'Number of Beds/Rooms'}
          placeholder="1"
          keyboardType="number-pad"
          value={totalBeds}
          onChangeText={setTotalBeds}
        />
        <FormField
          label={buildingType === 'pg' ? 'Rent per Bed (₹)' : 'Monthly Rent (₹)'}
          required
          placeholder="e.g. 8000"
          keyboardType="decimal-pad"
          value={rentPerBed}
          onChangeText={setRentPerBed}
          error={errors.rentPerBed}
        />
        <Button title={unitId ? 'Update Unit' : 'Add Unit'} onPress={save} loading={loading} style={{ marginTop: 24 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.white },
  container: { padding: 20, paddingBottom: 40 },
});
