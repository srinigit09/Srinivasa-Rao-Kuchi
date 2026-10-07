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
import { COLORS, RESIDENTIAL_UNIT_TYPES, COMMERCIAL_UNIT_TYPES, PG_UNIT_TYPES } from '../../constants';
import { BuildingType } from '../../types';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, 'AddEditUnit'>;
  route: RouteProp<AppStackParamList, 'AddEditUnit'>;
};

export default function AddEditUnitScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { buildingId, unitId } = route.params;
  const [buildingType, setBuildingType] = useState<BuildingType>('residential');
  const [unitNumber, setUnitNumber] = useState('');
  const [unitType, setUnitType] = useState('');
  const [floorNumber, setFloorNumber] = useState('');
  const [totalBeds, setTotalBeds] = useState('1');
  const [rentPerBed, setRentPerBed] = useState('');
  const [monthlyMaintenance, setMonthlyMaintenance] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.from('buildings').select('building_type, monthly_maintenance_charge').eq('id', buildingId).single()
      .then(({ data }) => {
        if (data) {
          setBuildingType(data.building_type as any);
          if (!unitId && data.monthly_maintenance_charge) {
            setMonthlyMaintenance(String(data.monthly_maintenance_charge));
          }
        }
      });
    if (unitId) {
      supabase.from('units').select('*').eq('id', unitId).single().then(({ data }) => {
        if (data) {
          setUnitNumber(data.unit_number);
          setUnitType(data.unit_type);
          setFloorNumber(data.floor_number ?? '');
          setTotalBeds(String(data.total_beds ?? 1));
          setRentPerBed(String(data.rent_per_bed));
          setMonthlyMaintenance(data.monthly_maintenance ? String(data.monthly_maintenance) : '');
        }
      });
    }
  }, [buildingId, unitId]);

  const isPG = buildingType === 'pg';
  const isCommercial = buildingType === 'commercial';
  const typeOptions = isPG
    ? [...PG_UNIT_TYPES]
    : isCommercial
    ? [...COMMERCIAL_UNIT_TYPES]
    : [...RESIDENTIAL_UNIT_TYPES];

  const validate = () => {
    const e: Record<string, string> = {};
    if (!unitNumber.trim()) e.unitNumber = isCommercial ? 'Shop / Office / Unit number is required' : 'Unit number is required';
    if (!unitType) e.unitType = 'Please select a unit type';
    if (!rentPerBed || isNaN(Number(rentPerBed))) e.rentPerBed = 'Enter valid monthly rent amount';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setLoading(true);
    const trimmedUnitNumber = unitNumber.trim();

    // Duplicate unit number check within the same building — skip for edits of the same record
    const dupQuery = supabase
      .from('units')
      .select('id')
      .eq('building_id', buildingId)
      .eq('unit_number', trimmedUnitNumber);
    if (unitId) dupQuery.neq('id', unitId);
    const { data: dupData } = await dupQuery.limit(1);
    if (dupData && dupData.length > 0) {
      setLoading(false);
      Alert.alert('Duplicate Unit', `Unit "${trimmedUnitNumber}" already exists in this property. Please use a different number.`);
      return;
    }

    const payload: Record<string, any> = {
      building_id: buildingId,
      owner_id: user!.id,
      unit_number: trimmedUnitNumber,
      unit_type: unitType,
      floor_number: floorNumber.trim() || null,
      total_beds: isPG ? (parseInt(totalBeds) || 1) : 1,
      rent_per_bed: parseFloat(rentPerBed) || 0,
      monthly_maintenance: monthlyMaintenance ? parseFloat(monthlyMaintenance) : 0,
    };
    // On new unit creation always mark vacant; on edit preserve existing vacancy status
    if (!unitId) { payload.is_vacant = true; }
    const { error } = unitId
      ? await supabase.from('units').update(payload).eq('id', unitId)
      : await supabase.from('units').insert(payload);
    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    navigation.goBack();
  };

  const unitLabel =
    buildingType === 'individual_house'
      ? 'House / Villa / Floor No.'
      : isCommercial
      ? 'Shop / Office / Unit Number'
      : isPG
      ? 'Room Number'
      : 'Flat / Unit Number';

  const unitTypeLabel =
    isPG
      ? 'Room Sharing Type'
      : isCommercial
      ? 'Commercial Space Type'
      : 'Residential Unit Type';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 20}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <FormField
          label={unitLabel}
          required
          placeholder={
            isCommercial
              ? 'e.g. Shop 12, Office 404, Bay B-1'
              : isPG
              ? 'e.g. Room 101, A-1'
              : 'e.g. 101, Flat 3B, Villa-5'
          }
          value={unitNumber}
          onChangeText={setUnitNumber}
          error={errors.unitNumber}
        />

        {!isPG && (
          <FormField
            label="Floor Number (Optional)"
            placeholder="e.g. Ground, 1st, 2nd, Penthouse"
            value={floorNumber}
            onChangeText={setFloorNumber}
          />
        )}

        <SelectField
          label={unitTypeLabel}
          required
          options={typeOptions}
          value={unitType}
          onChange={(val) => {
            setUnitType(val);
            if (isPG) {
              if (val === 'Single') setTotalBeds('1');
              else if (val === '2-Sharing') setTotalBeds('2');
              else if (val === '3-Sharing') setTotalBeds('3');
              else if (val === '4-Sharing') setTotalBeds('4');
              else if (val === '5-Sharing') setTotalBeds('5');
            }
          }}
          error={errors.unitType}
        />

        {isPG && (
          <FormField
            label="Total Beds in this Room"
            placeholder="e.g. 2"
            keyboardType="number-pad"
            value={totalBeds}
            onChangeText={setTotalBeds}
          />
        )}

        <FormField
          label={isPG ? 'Rent per Bed (₹)' : 'Monthly Expected Rent (₹)'}
          required
          placeholder="e.g. 12000"
          keyboardType="decimal-pad"
          value={rentPerBed}
          onChangeText={setRentPerBed}
          error={errors.rentPerBed}
        />

        <FormField
          label="Monthly Maintenance / Society Dues (₹, Optional)"
          placeholder="e.g. 2000"
          keyboardType="decimal-pad"
          value={monthlyMaintenance}
          onChangeText={setMonthlyMaintenance}
        />

        <Button
          title={unitId ? 'Update Unit' : 'Save Unit'}
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
  container: { padding: 20, paddingBottom: 160 },
});
