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
import {
  COLORS,
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
} from '../../constants';
import { MaintenanceCategory, MaintenancePriority, MaintenanceStatus } from '../../types';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, any>;
  route: RouteProp<AppStackParamList, any>;
};

export default function AddEditMaintenanceRequestScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const requestId = (route.params as any)?.requestId;
  const initialBuildingId = (route.params as any)?.buildingId;

  const [buildings, setBuildings] = useState<{ id: string; name: string }[]>([]);
  const [units, setUnits] = useState<{ id: string; unit_number: string }[]>([]);
  const [vendors, setVendors] = useState<{ id: string; name: string; phone: string }[]>([]);

  const [buildingId, setBuildingId] = useState(initialBuildingId ?? '');
  const [unitId, setUnitId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<MaintenanceCategory>('Plumbing');
  const [priority, setPriority] = useState<MaintenancePriority>('Medium');
  const [status, setStatus] = useState<MaintenanceStatus>('Reported');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [actualCost, setActualCost] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [vendorPhone, setVendorPhone] = useState('');
  const [reportedBy, setReportedBy] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    supabase.from('buildings').select('id, name').eq('owner_id', user.id).then(({ data }) => {
      if (data) {
        setBuildings(data);
        if (!buildingId && data.length > 0) setBuildingId(data[0].id);
      }
    });

    supabase.from('service_vendors').select('id, name, phone').eq('owner_id', user.id).then(({ data }) => {
      if (data) setVendors(data);
    });
  }, [user]);

  useEffect(() => {
    if (buildingId) {
      supabase.from('units').select('id, unit_number').eq('building_id', buildingId).then(({ data }) => {
        if (data) setUnits(data);
      });
    } else {
      setUnits([]);
    }
  }, [buildingId]);

  useEffect(() => {
    if (requestId) {
      supabase.from('maintenance_requests').select('*').eq('id', requestId).single().then(({ data }) => {
        if (data) {
          setBuildingId(data.building_id);
          setUnitId(data.unit_id ?? '');
          setTitle(data.title);
          setDescription(data.description);
          setCategory(data.category);
          setPriority(data.priority);
          setStatus(data.status);
          setEstimatedCost(data.estimated_cost ? String(data.estimated_cost) : '');
          setActualCost(data.actual_cost ? String(data.actual_cost) : '');
          setVendorName(data.vendor_name ?? '');
          setVendorPhone(data.vendor_phone ?? '');
          setReportedBy(data.reported_by ?? '');
          setResolutionNotes(data.resolution_notes ?? '');
        }
      });
    }
  }, [requestId]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!buildingId) e.buildingId = 'Please select a property';
    if (!title.trim()) e.title = 'Title / Issue summary is required';
    if (!description.trim()) e.description = 'Description is required';
    if (vendorPhone.trim()) {
      const cleanVPhone = vendorPhone.replace(/\D/g, '');
      if (cleanVPhone.length < 10) e.vendorPhone = 'Enter a valid 10-digit phone number';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setLoading(true);
    const payload = {
      owner_id: user!.id,
      building_id: buildingId,
      unit_id: unitId || null,
      title: title.trim(),
      description: description.trim(),
      category,
      priority,
      status,
      estimated_cost: estimatedCost ? parseFloat(estimatedCost) : null,
      actual_cost: actualCost ? parseFloat(actualCost) : null,
      vendor_name: vendorName.trim() || null,
      vendor_phone: vendorPhone.trim() || null,
      reported_by: reportedBy.trim() || null,
      resolved_date: status === 'Resolved' ? new Date().toISOString() : null,
      resolutionNotes: resolutionNotes.trim() || null,
    };

    const { error } = requestId
      ? await supabase.from('maintenance_requests').update(payload).eq('id', requestId)
      : await supabase.from('maintenance_requests').insert(payload);

    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    navigation.goBack();
  };

  const onSelectVendorQuick = (v: { name: string; phone: string }) => {
    setVendorName(v.name);
    setVendorPhone(v.phone);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 20}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {buildings.length > 0 && (
          <SelectField
            label="Property / Society"
            required
            options={buildings.map(b => b.name)}
            value={buildings.find(b => b.id === buildingId)?.name ?? ''}
            onChange={(name) => {
              const b = buildings.find(x => x.name === name);
              if (b) setBuildingId(b.id);
            }}
            error={errors.buildingId}
          />
        )}

        {units.length > 0 && (
          <SelectField
            label="Unit / Flat (Optional - Common Area if blank)"
            options={['Common Area / Society', ...units.map(u => u.unit_number)]}
            value={unitId ? (units.find(u => u.id === unitId)?.unit_number ?? 'Common Area / Society') : 'Common Area / Society'}
            onChange={(val) => {
              if (val === 'Common Area / Society') {
                setUnitId('');
              } else {
                const u = units.find(x => x.unit_number === val);
                if (u) setUnitId(u.id);
              }
            }}
          />
        )}

        <FormField
          label="Issue Summary / Title"
          required
          placeholder="e.g. Water leakage under kitchen sink, Lift buzzer failure"
          value={title}
          onChangeText={setTitle}
          error={errors.title}
        />

        <FormField
          label="Detailed Description"
          required
          placeholder="Describe what needs repair or attention..."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
          error={errors.description}
        />

        <SelectField
          label="Service Category"
          required
          options={[...MAINTENANCE_CATEGORIES]}
          value={category}
          onChange={(v) => setCategory(v as any)}
        />

        <SelectField
          label="Priority"
          required
          options={[...MAINTENANCE_PRIORITIES]}
          value={priority}
          onChange={(v) => setPriority(v as any)}
        />

        <SelectField
          label="Status"
          required
          options={[...MAINTENANCE_STATUSES]}
          value={status}
          onChange={(v) => setStatus(v as any)}
        />

        <Text style={[styles.sectionHeading, { marginTop: 14 }]}>Assigned Vendor & Costs</Text>

        {vendors.length > 0 && (
          <View style={styles.quickVendorWrap}>
            <Text style={styles.quickVendorLabel}>Quick Pick Saved Vendor:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.vendorChips}>
              {vendors.map(v => (
                <Button
                  key={v.id}
                  title={`🔧 ${v.name}`}
                  onPress={() => onSelectVendorQuick(v)}
                  variant="secondary"
                  fullWidth={false}
                />
              ))}
            </ScrollView>
          </View>
        )}

        <FormField
          label="Assigned Technician / Vendor Name"
          placeholder="e.g. Ramesh Kumar (Plumber)"
          value={vendorName}
          onChangeText={setVendorName}
        />

        <FormField
          label="Vendor Phone Number"
          placeholder="e.g. 9876543210"
          keyboardType="phone-pad"
          maxLength={10}
          value={vendorPhone}
          onChangeText={setVendorPhone}
          error={errors.vendorPhone}
        />

        <FormField
          label="Reported By (Resident Name / Security)"
          placeholder="e.g. Amit Sharma (Flat 302)"
          value={reportedBy}
          onChangeText={setReportedBy}
        />

        <View style={styles.costRow}>
          <View style={{ flex: 1 }}>
            <FormField
              label="Estimated Cost (₹)"
              placeholder="e.g. 1500"
              keyboardType="decimal-pad"
              value={estimatedCost}
              onChangeText={setEstimatedCost}
            />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <FormField
              label="Actual Cost (₹)"
              placeholder="e.g. 1200"
              keyboardType="decimal-pad"
              value={actualCost}
              onChangeText={setActualCost}
            />
          </View>
        </View>

        {status === 'Resolved' && (
          <FormField
            label="Resolution Notes / Work Done"
            placeholder="e.g. Replaced faulty inlet valve, tested water flow..."
            value={resolutionNotes}
            onChangeText={setResolutionNotes}
            multiline
            numberOfLines={2}
          />
        )}

        <Button
          title={requestId ? 'Update Service Request' : 'Submit Service Request'}
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
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  costRow: { flexDirection: 'row' },
  quickVendorWrap: { marginBottom: 12 },
  quickVendorLabel: { fontSize: 12, color: COLORS.muted, marginBottom: 6 },
  vendorChips: { gap: 6 },
});
