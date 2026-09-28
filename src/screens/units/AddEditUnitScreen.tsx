import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert,
  KeyboardAvoidingView, Platform, TouchableOpacity, TextInput,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AppStackParamList } from '../../navigation/RootNavigator';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import SelectField from '../../components/common/SelectField';
import {
  COLORS, RESIDENTIAL_UNIT_TYPES, PG_UNIT_TYPES,
  RE_UNIT_TYPES_SUGGESTED, AREA_UNITS, PLOT_FACINGS,
} from '../../constants';
import {
  BuildingType, PG_SHARING_BEDS, PGUnitType, PlotStatus,
  HAS_CONSTRUCTION_STAGES, CONSTRUCTION_STAGE_NAMES,
  isRealEstateType, PLOT_STATUS_LABEL,
} from '../../types';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, 'AddEditUnit'>;
  route: RouteProp<AppStackParamList, 'AddEditUnit'>;
};

const PLOT_STATUS_OPTIONS: PlotStatus[] = ['available', 'booked', 'under_construction', 'ready', 'sold'];

export default function AddEditUnitScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { buildingId, unitId } = route.params;
  const [buildingType, setBuildingType] = useState<BuildingType>('residential');

  // Shared fields
  const [unitNumber, setUnitNumber] = useState('');
  const [unitType, setUnitType]     = useState('');
  const [customType, setCustomType] = useState('');
  const [useCustomType, setUseCustomType] = useState(false);

  // Rental fields
  const [rentPerUnit, setRentPerUnit] = useState('');

  // PG fields
  const [sharingType, setSharingType] = useState<PGUnitType>('Single');
  const [rentPerBed, setRentPerBed]   = useState('');

  // Real estate fields
  const [areaValue, setAreaValue]   = useState('');
  const [areaUnit, setAreaUnit]     = useState<'sq.ft' | 'sq.yd' | 'acres'>('sq.ft');
  const [facing, setFacing]         = useState('');
  const [salePrice, setSalePrice]   = useState('');
  const [plotStatus, setPlotStatus] = useState<PlotStatus>('available');

  const [loading, setLoading] = useState(false);
  const [errors, setErrors]   = useState<Record<string, string>>({});

  const isRental = buildingType === 'residential';
  const isPG     = buildingType === 'pg';
  const isRE     = isRealEstateType(buildingType);
  const isHousingVilla = buildingType === 'housing_villa';
  const isFarm   = buildingType === 'farm_land';

  useEffect(() => {
    // Load building type
    supabase.from('buildings').select('building_type').eq('id', buildingId).single()
      .then(({ data }) => {
        if (data) {
          const bt = data.building_type as BuildingType;
          setBuildingType(bt);
          // Set default area unit for farm land
          if (bt === 'farm_land') setAreaUnit('acres');
        }
      });

    // Load existing unit for edit
    if (unitId) {
      supabase.from('units').select('*').eq('id', unitId).single().then(({ data }) => {
        if (!data) return;
        setUnitNumber(data.unit_number);
        setUnitType(data.unit_type);
        setRentPerUnit(String(data.rent_per_bed ?? ''));
        setRentPerBed(String(data.rent_per_bed ?? ''));
        if (data.unit_type && PG_UNIT_TYPES.includes(data.unit_type)) {
          setSharingType(data.unit_type as PGUnitType);
        }
        // RE fields
        if (data.area_sqft) { setAreaValue(String(data.area_sqft)); setAreaUnit('sq.ft'); }
        if (data.area_acres) { setAreaValue(String(data.area_acres)); setAreaUnit('acres'); }
        if (data.facing) setFacing(data.facing);
        if (data.sale_price) setSalePrice(String(data.sale_price));
        if (data.plot_status) setPlotStatus(data.plot_status as PlotStatus);
        if (data.custom_type) { setCustomType(data.custom_type); setUseCustomType(true); }
      });
    }
  }, [buildingId, unitId]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!unitNumber.trim()) e.unitNumber = 'Unit / plot number is required';
    if (isRE && !useCustomType && !unitType) e.unitType = 'Please select a type';
    if (isRental && (!rentPerUnit || isNaN(Number(rentPerUnit)))) e.rent = 'Enter valid rent';
    if (isPG && (!rentPerBed || isNaN(Number(rentPerBed)))) e.rent = 'Enter valid rent per bed';
    if (isRE && (!salePrice || isNaN(Number(salePrice)))) e.salePrice = 'Enter valid sale price';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setLoading(true);

    const resolvedUnitType = isPG
      ? sharingType
      : useCustomType ? customType.trim() : unitType;

    const payload: Record<string, any> = {
      building_id: buildingId,
      owner_id: user!.id,
      unit_number: unitNumber.trim(),
      unit_type: resolvedUnitType,
      custom_type: useCustomType ? customType.trim() : null,
    };

    if (isRental) {
      payload.rent_per_bed = parseFloat(rentPerUnit);
      payload.total_beds = 1;
    } else if (isPG) {
      payload.rent_per_bed = parseFloat(rentPerBed);
      payload.total_beds = PG_SHARING_BEDS[sharingType];
    } else if (isRE) {
      payload.sale_price = parseFloat(salePrice);
      payload.plot_status = plotStatus;
      payload.facing = facing || null;
      if (areaUnit === 'acres') {
        payload.area_acres = parseFloat(areaValue) || null;
        payload.area_sqft = null;
      } else {
        payload.area_sqft = parseFloat(areaValue) || null;
        payload.area_acres = null;
      }
      payload.rent_per_bed = 0;
      payload.total_beds = 0;
      payload.is_vacant = plotStatus === 'available';
    }

    const { data: savedUnit, error } = unitId
      ? await supabase.from('units').update(payload).eq('id', unitId).select().single()
      : await supabase.from('units').insert(payload).select().single();

    if (error) { setLoading(false); Alert.alert('Error', error.message); return; }

    // For PG: auto-create named beds
    if (isPG && !unitId && savedUnit) {
      const bedCount = PG_SHARING_BEDS[sharingType];
      const beds = Array.from({ length: bedCount }, (_, i) => ({
        unit_id: savedUnit.id,
        owner_id: user!.id,
        bed_label: `${unitNumber.trim()}${String.fromCharCode(65 + i)}`, // 5A, 5B, 5C
      }));
      await supabase.from('beds').insert(beds);
    }

    // For Housing/Villa Flat/House/Villa: auto-create construction stages
    if (isHousingVilla && !unitId && savedUnit) {
      const resolvedType = useCustomType ? customType.trim() : unitType;
      if (HAS_CONSTRUCTION_STAGES.some(t => resolvedType.toLowerCase().includes(t.toLowerCase()))) {
        const stages = CONSTRUCTION_STAGE_NAMES.map((name, idx) => ({
          unit_id: savedUnit.id,
          owner_id: user!.id,
          stage_name: name,
          stage_order: idx + 1,
        }));
        await supabase.from('construction_stages').insert(stages);
      }
    }

    setLoading(false);
    navigation.goBack();
  };

  // ── Render helpers ──────────────────────────────────────────────────────────

  const renderRentalFields = () => (
    <>
      <SelectField
        label="Unit Type" required
        options={[...RESIDENTIAL_UNIT_TYPES]}
        value={unitType}
        onChange={setUnitType}
        error={errors.unitType}
      />
      <FormField
        label="Monthly Rent (₹)" required
        placeholder="e.g. 12000"
        keyboardType="decimal-pad"
        value={rentPerUnit}
        onChangeText={setRentPerUnit}
        error={errors.rent}
      />
    </>
  );

  const renderPGFields = () => (
    <>
      <SelectField
        label="Sharing Type" required
        options={[...PG_UNIT_TYPES]}
        value={sharingType}
        onChange={v => setSharingType(v as PGUnitType)}
      />
      <View style={styles.infoBox}>
        <Ionicons name="bed-outline" size={14} color={COLORS.primary} />
        <Text style={styles.infoText}>
          {PG_SHARING_BEDS[sharingType]} bed{PG_SHARING_BEDS[sharingType] > 1 ? 's' : ''} will be created automatically
          {' '}({unitNumber ? `${unitNumber}A` : '?A'} … {unitNumber
            ? `${unitNumber}${String.fromCharCode(64 + PG_SHARING_BEDS[sharingType])}`
            : '?'})
        </Text>
      </View>
      <FormField
        label="Rent per Bed (₹)" required
        placeholder="e.g. 5000"
        keyboardType="decimal-pad"
        value={rentPerBed}
        onChangeText={setRentPerBed}
        error={errors.rent}
      />
    </>
  );

  const renderREFields = () => (
    <>
      {/* Unit type selector — chips + custom option */}
      <Text style={styles.fieldLabel}>
        {isHousingVilla ? 'Unit Type' : 'Plot Type'}{' '}
        <Text style={styles.required}>*</Text>
      </Text>
      <View style={styles.chipRow}>
        {RE_UNIT_TYPES_SUGGESTED.map(t => {
          // Show all for housing_villa; filter for open_plots / farm_land
          if (isHousingVilla && (t === 'Farm Land')) return null;
          if (buildingType === 'open_plots' && !['Open Plot'].includes(t)) return null;
          if (buildingType === 'farm_land' && !['Farm Land'].includes(t)) return null;
          const active = !useCustomType && unitType === t;
          return (
            <TouchableOpacity
              key={t}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => { setUnitType(t); setUseCustomType(false); }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          );
        })}
        {/* Custom option — only for housing_villa */}
        {isHousingVilla && (
          <TouchableOpacity
            style={[styles.chip, useCustomType && styles.chipActive]}
            onPress={() => setUseCustomType(true)}
          >
            <Text style={[styles.chipText, useCustomType && styles.chipTextActive]}>Custom…</Text>
          </TouchableOpacity>
        )}
      </View>
      {useCustomType && (
        <TextInput
          style={styles.customInput}
          placeholder="e.g. Studio, Duplex, Row House…"
          placeholderTextColor={COLORS.muted}
          value={customType}
          onChangeText={setCustomType}
          autoFocus
        />
      )}
      {errors.unitType ? <Text style={styles.errorText}>{errors.unitType}</Text> : null}

      {/* Construction stages note */}
      {isHousingVilla && (
        <View style={styles.infoBox}>
          <Ionicons name="construct-outline" size={14} color={COLORS.warning} />
          <Text style={styles.infoText}>
            Construction stages (Foundation → Handover) will be auto-created for Flat / House / Villa types.
          </Text>
        </View>
      )}

      {/* Area */}
      <Text style={styles.fieldLabel}>Area</Text>
      <View style={styles.areaRow}>
        <View style={{ flex: 1 }}>
          <FormField
            label=""
            placeholder={areaUnit === 'acres' ? 'e.g. 2.5' : 'e.g. 1200'}
            keyboardType="decimal-pad"
            value={areaValue}
            onChangeText={setAreaValue}
          />
        </View>
        <View style={styles.areaUnitPicker}>
          {(isFarm ? ['acres'] : ['sq.ft', 'sq.yd']).map(u => (
            <TouchableOpacity
              key={u}
              style={[styles.areaUnitChip, areaUnit === u && styles.areaUnitChipActive]}
              onPress={() => setAreaUnit(u as any)}
            >
              <Text style={[styles.areaUnitText, areaUnit === u && styles.areaUnitTextActive]}>{u}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Facing — only for open plots */}
      {buildingType === 'open_plots' && (
        <>
          <Text style={styles.fieldLabel}>Facing</Text>
          <View style={styles.chipRow}>
            {[...PLOT_FACINGS].map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.chip, facing === f && styles.chipActive]}
                onPress={() => setFacing(facing === f ? '' : f)}
              >
                <Text style={[styles.chipText, facing === f && styles.chipTextActive]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Sale Price */}
      <FormField
        label="Sale Price (₹)" required
        placeholder="e.g. 2500000"
        keyboardType="decimal-pad"
        value={salePrice}
        onChangeText={setSalePrice}
        error={errors.salePrice}
      />

      {/* Status */}
      <SelectField
        label="Status"
        options={PLOT_STATUS_OPTIONS}
        value={plotStatus}
        onChange={v => setPlotStatus(v as PlotStatus)}
        displayValue={v => PLOT_STATUS_LABEL[v as PlotStatus] ?? v}
      />
    </>
  );

  const unitLabel = isPG ? 'Room Number' : isRE ? 'Plot / Unit Number' : 'Unit Number';
  const unitPlaceholder = isPG ? 'e.g. Room 5' : isRE ? 'e.g. Plot-12, A-5' : 'e.g. 101, A-2';

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <FormField
          label={unitLabel} required
          placeholder={unitPlaceholder}
          value={unitNumber}
          onChangeText={setUnitNumber}
          error={errors.unitNumber}
        />

        {isRental && renderRentalFields()}
        {isPG     && renderPGFields()}
        {isRE     && renderREFields()}

        <Button
          title={unitId ? 'Update' : isRE ? 'Add Plot / Unit' : isPG ? 'Add Room + Beds' : 'Add Unit'}
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
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  required: { color: COLORS.danger },
  errorText: { fontSize: 12, color: COLORS.danger, marginTop: -8, marginBottom: 8 },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.primaryLight, borderRadius: 8,
    padding: 10, marginBottom: 14,
  },
  infoText: { flex: 1, fontSize: 12, color: COLORS.primary, lineHeight: 17 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.muted },
  chipTextActive: { color: COLORS.primary },
  customInput: {
    borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: 8,
    padding: 12, fontSize: 14, color: COLORS.text,
    backgroundColor: COLORS.primaryLight, marginBottom: 12,
  },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  areaUnitPicker: { flexDirection: 'row', gap: 6 },
  areaUnitChip: {
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  areaUnitChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  areaUnitText: { fontSize: 12, fontWeight: '600', color: COLORS.muted },
  areaUnitTextActive: { color: COLORS.primary },
});
