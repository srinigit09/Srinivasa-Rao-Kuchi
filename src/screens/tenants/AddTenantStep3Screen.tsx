import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { AppStackParamList } from '../../navigation/RootNavigator';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import { COLORS } from '../../constants';
import { formatCurrency } from '../../utils';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, 'AddTenantStep3'>;
  route: RouteProp<AppStackParamList, 'AddTenantStep3'>;
};

export default function AddTenantStep3Screen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { buildingId, unitId, buildingType, tenantData } = route.params;
  const isPG = buildingType === 'pg';

  const [unitRent, setUnitRent] = useState(0);
  const [rentOverride, setRentOverride] = useState('');
  const [deposit, setDeposit] = useState('');
  const [moveInDate, setMoveInDate] = useState(new Date().toISOString().split('T')[0]);
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  // Prevent double-submit: true while the insert is in-flight
  const submitting = useRef(false);

  // Cancel button in header — exits the whole Add Tenant flow back to Tenants tab
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

  useEffect(() => {
    supabase.from('units').select('rent_per_bed').eq('id', unitId).single()
      .then(({ data }) => { if (data) setUnitRent(data.rent_per_bed); });
  }, [unitId]);

  const resetForm = () => {
    setRentOverride('');
    setDeposit('');
    setMoveInDate(new Date().toISOString().split('T')[0]);
    setEmergencyName('');
    setEmergencyPhone('');
    setNotes('');
  };

  const save = async () => {
    if (submitting.current) return;   // block duplicate taps
    if (!moveInDate) { Alert.alert('Required', 'Please enter move-in date.'); return; }

    submitting.current = true;  // stays true until navigation — prevents any re-tap
    setLoading(true);

    // Server-side capacity guard — re-check just before insert to prevent race conditions
    const { data: unitData } = await supabase
      .from('units')
      .select('total_beds, building_id, buildings(building_type)')
      .eq('id', unitId)
      .single();
    const buildingTypeCheck = (unitData as any)?.buildings?.building_type ?? buildingType;
    const { count: activeTenantCount } = await supabase
      .from('tenants')
      .select('id', { count: 'exact', head: true })
      .eq('unit_id', unitId)
      .eq('is_active', true);
    const totalBeds = unitData?.total_beds ?? 1;
    const isFull = buildingTypeCheck === 'residential'
      ? (activeTenantCount ?? 0) > 0
      : (activeTenantCount ?? 0) >= totalBeds;

    if (isFull) {
      setLoading(false);
      submitting.current = false;
      Alert.alert(
        'Unit No Longer Available',
        buildingTypeCheck === 'residential'
          ? 'This unit was assigned to another tenant. Please go back and select a different unit.'
          : 'All beds in this room are now taken. Please go back and select a different unit.',
        [{ text: 'Go Back', onPress: () => navigation.navigate('AddTenantStep1') }],
      );
      return;
    }

    const td = tenantData as any;
    const { error } = await supabase.from('tenants').insert({
      owner_id: user!.id,
      unit_id: unitId,
      full_name: td.fullName,
      phone: td.phone,
      email: td.email || null,
      id_type: td.idType || null,
      id_number: td.idNumber || null,
      move_in_date: moveInDate,
      rent_override: rentOverride ? parseFloat(rentOverride) : null,
      deposit_amount: deposit ? parseFloat(deposit) : 0,
      emergency_name: emergencyName || null,
      emergency_phone: emergencyPhone || null,
      notes: notes || null,
    });

    if (!error) {
      await supabase.from('units').update({ is_vacant: false }).eq('id', unitId);
    }

    setLoading(false);

    if (error) {
      submitting.current = false;  // only reset on error so user can retry
      Alert.alert('Error', error.message);
      return;
    }

    resetForm();

    // Go back to the building's unit list so the user can add tenants to other units
    const tenantName = (tenantData as any).fullName;
    Alert.alert(
      '✅ Tenant Added',
      `${tenantName} has been added successfully.`,
      [{
        text: 'Back to Units',
        onPress: () => navigation.reset({
          index: 1,
          routes: [{ name: 'Tabs' }, { name: 'BuildingDetail', params: { buildingId } }],
        }),
      }],
    );
    navigation.reset({
      index: 1,
      routes: [{ name: 'Tabs' }, { name: 'BuildingDetail', params: { buildingId } }],
    });
  };

  const effectiveRent = rentOverride ? parseFloat(rentOverride) || 0 : unitRent;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.rentInfo}>
          <Text style={styles.rentInfoText}>
            {isPG ? 'Default rent from unit:' : 'Monthly rent from unit:'}{' '}
            {formatCurrency(unitRent)}{isPG ? ' / bed' : ' / month'}
          </Text>
        </View>

        <FormField
          label={isPG ? 'Rent Override (₹) per bed — leave blank to use unit rent' : 'Rent Override (₹) — leave blank to use unit rent'}
          placeholder={`Default: ${unitRent}`}
          keyboardType="decimal-pad"
          value={rentOverride}
          onChangeText={setRentOverride}
        />
        <Text style={styles.effectiveRent}>
          Effective Rent: {formatCurrency(effectiveRent)}{isPG ? ' / bed' : ' / month'}
        </Text>

        <FormField
          label="Security Deposit (₹)"
          placeholder="e.g. 16000"
          keyboardType="decimal-pad"
          value={deposit}
          onChangeText={setDeposit}
        />
        <FormField
          label="Move-in Date"
          required
          placeholder="YYYY-MM-DD"
          value={moveInDate}
          onChangeText={setMoveInDate}
          keyboardType="numeric"
        />
        <FormField
          label="Emergency Contact Name"
          placeholder="Family member name"
          value={emergencyName}
          onChangeText={setEmergencyName}
        />
        <FormField
          label="Emergency Contact Phone"
          placeholder="Phone number"
          keyboardType="phone-pad"
          value={emergencyPhone}
          onChangeText={setEmergencyPhone}
        />
        <FormField
          label="Notes"
          placeholder="Any additional notes"
          multiline
          numberOfLines={3}
          value={notes}
          onChangeText={setNotes}
        />

        <Button
          title="✅ Add Tenant"
          onPress={save}
          loading={loading}
          style={{ marginTop: 16 }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.white },
  container: { padding: 20, paddingBottom: 40 },
  rentInfo: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  rentInfoText: { color: COLORS.primary, fontSize: 13, fontWeight: '500' },
  effectiveRent: {
    color: COLORS.success,
    fontWeight: '600',
    marginTop: -10,
    marginBottom: 16,
    fontSize: 13,
  },
});
