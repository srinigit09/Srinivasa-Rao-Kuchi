import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert,
  KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AppStackParamList } from '../../navigation/RootNavigator';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useProperty } from '../../context/PropertyContext';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import { COLORS } from '../../constants';
import {
  BuildingType, BUILDING_TYPE_LABEL, BUILDING_TYPE_ICON,
  isRealEstateType,
} from '../../types';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, 'AddEditBuilding'>;
  route: RouteProp<AppStackParamList, 'AddEditBuilding'>;
};

const ALL_TYPES: BuildingType[] = [
  'residential', 'pg', 'open_plots', 'housing_villa', 'farm_land',
];

const TYPE_HINTS: Record<BuildingType, string> = {
  residential:   'Units: Room, 1RK, 1BHK, 2BHK, 3BHK, 4BHK, Villa, Shop, Office, Entire Building',
  pg:            'Rooms with beds (Single to 5-Sharing) — rent per bed',
  open_plots:    'Individual plots with area, facing and sale price',
  housing_villa: 'Mix of Flats, Houses, Villas — with construction stage tracking',
  farm_land:     'Farm land parcels with area in acres and sale price',
};

export default function AddEditBuildingScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { loadProperties, setActiveProperty } = useProperty();
  const editId = route.params?.buildingId;
  const preselectedType = route.params?.preselectedType as BuildingType | undefined;

  const [name, setName]       = useState('');
  const [address, setAddress] = useState('');
  const [type, setType]       = useState<BuildingType>(preselectedType ?? 'residential');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors]   = useState<Record<string, string>>({});

  useEffect(() => {
    if (editId) {
      supabase.from('buildings').select('*').eq('id', editId).single().then(({ data }) => {
        if (data) {
          setName(data.name);
          setAddress(data.address ?? '');
          setType(data.building_type as BuildingType);
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
      owner_id: user!.id,
    };
    const { data, error } = editId
      ? await supabase.from('buildings').update(payload).eq('id', editId).select().single()
      : await supabase.from('buildings').insert(payload).select().single();
    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }

    // Refresh property list and auto-select the new/edited property
    await loadProperties();
    if (data) {
      setActiveProperty({ id: data.id, name: data.name, building_type: data.building_type });
    }
    navigation.goBack();
  };

  const isRE = isRealEstateType(type);
  const nameLabel = isRE ? 'Project Name' : 'Building Name';
  const namePlaceholder = isRE
    ? 'e.g. Green Valley Layout, Lakeside Villas'
    : 'e.g. Sunrise Apartments, City PG';

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Property type selector */}
        <Text style={styles.sectionLabel}>Property Type</Text>
        <View style={styles.typeGrid}>
          {ALL_TYPES.map(t => {
            const active = t === type;
            return (
              <TouchableOpacity
                key={t}
                style={[styles.typeChip, active && styles.typeChipActive]}
                onPress={() => setType(t)}
                activeOpacity={0.7}
              >
                <Text style={styles.typeChipIcon}>{BUILDING_TYPE_ICON[t]}</Text>
                <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                  {BUILDING_TYPE_LABEL[t]}
                </Text>
                {active && <Ionicons name="checkmark-circle" size={14} color={COLORS.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Hint */}
        <View style={styles.hintBox}>
          <Text style={styles.hintText}>{TYPE_HINTS[type]}</Text>
        </View>

        {/* Name */}
        <FormField
          label={nameLabel}
          required
          placeholder={namePlaceholder}
          value={name}
          onChangeText={setName}
          error={errors.name}
        />

        {/* Address */}
        <FormField
          label={isRE ? 'Location / Address' : 'Address'}
          placeholder="Street, Area, City, State"
          value={address}
          onChangeText={setAddress}
          multiline
          numberOfLines={3}
        />

        <Button
          title={editId ? `Update ${isRE ? 'Project' : 'Building'}` : `Add ${isRE ? 'Project' : 'Building'}`}
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
  container: { padding: 20, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.text,
    marginBottom: 10, letterSpacing: 0.2,
  },
  typeGrid: { gap: 8, marginBottom: 14 },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: COLORS.bg,
  },
  typeChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  typeChipIcon: { fontSize: 20 },
  typeChipText: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.muted },
  typeChipTextActive: { color: COLORS.primary },
  hintBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 8, padding: 10, marginBottom: 16,
    borderLeftWidth: 3, borderLeftColor: COLORS.primary,
  },
  hintText: { fontSize: 12, color: COLORS.muted, lineHeight: 18 },
});
