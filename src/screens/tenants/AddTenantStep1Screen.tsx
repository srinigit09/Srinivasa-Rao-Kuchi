import React, { useState, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import { AppStackParamList } from '../../navigation/RootNavigator';
import { formatCurrency } from '../../utils';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList, 'AddTenantStep1'> };

interface UnitItem {
  id: string;
  unit_number: string;
  unit_type: string;
  is_vacant: boolean;
  rent_per_bed: number;
  total_beds: number;
  active_tenant_count: number; // fetched from tenants table
}

interface BuildingItem {
  id: string;
  name: string;
  building_type: 'residential' | 'pg';
  units: UnitItem[];
}

export default function AddTenantStep1Screen({ navigation }: Props) {
  const { user } = useAuth();
  const [buildings, setBuildings] = useState<BuildingItem[]>([]);
  const [selected, setSelected] = useState<{ buildingId: string; unitId: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  const load = useCallback(async () => {
    if (!user) return;

    // Fetch buildings + units
    const { data: buildingData } = await supabase
      .from('buildings')
      .select('id, name, building_type, units(id, unit_number, unit_type, is_vacant, rent_per_bed, total_beds)')
      .eq('owner_id', user.id)
      .order('name');

    if (!buildingData) { setBuildings([]); return; }

    // Fetch active tenant counts per unit in one query
    const allUnitIds = buildingData.flatMap((b: any) => (b.units ?? []).map((u: any) => u.id));
    let tenantCountMap: Record<string, number> = {};
    if (allUnitIds.length > 0) {
      const { data: tenantRows } = await supabase
        .from('tenants')
        .select('unit_id')
        .in('unit_id', allUnitIds)
        .eq('is_active', true);
      (tenantRows ?? []).forEach((r: any) => {
        tenantCountMap[r.unit_id] = (tenantCountMap[r.unit_id] ?? 0) + 1;
      });
    }

    const enriched: BuildingItem[] = buildingData.map((b: any) => ({
      ...b,
      units: (b.units ?? []).map((u: any) => ({
        ...u,
        active_tenant_count: tenantCountMap[u.id] ?? 0,
      })),
    }));

    setBuildings(enriched);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  /** Returns true if the unit can accept one more tenant */
  const canAccept = (u: UnitItem, buildingType: 'residential' | 'pg') => {
    if (buildingType === 'residential') {
      // Residential: only one active tenant allowed per unit
      return u.active_tenant_count === 0;
    }
    // PG: allow up to total_beds active tenants
    return u.active_tenant_count < u.total_beds;
  };

  const proceed = () => {
    if (!selected) { Alert.alert('Select a unit', 'Please select a unit to add a tenant.'); return; }
    const building = buildings.find(b => b.id === selected.buildingId);
    navigation.navigate('AddTenantStep2', {
      ...selected,
      buildingType: building?.building_type ?? 'residential',
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Step 1: Select Unit</Text>
      <Text style={styles.sub}>Choose the building and unit for the new tenant.</Text>
      <FlatList
        data={buildings}
        keyExtractor={b => b.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No buildings found. Add a building first.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.buildingGroup}>
            <Text style={styles.buildingName}>
              {item.building_type === 'residential' ? '🏠' : '🏨'} {item.name}
            </Text>
            {item.units?.map(u => {
              const available = canAccept(u, item.building_type);
              const isSelected = selected?.unitId === u.id;
              const bedsFree = item.building_type === 'pg' ? u.total_beds - u.active_tenant_count : null;

              return (
                <TouchableOpacity
                  key={u.id}
                  style={[
                    styles.unitRow,
                    isSelected && styles.unitRowSelected,
                    !available && styles.unitRowLocked,
                  ]}
                  onPress={() => {
                    if (!available) {
                      const msg = item.building_type === 'pg'
                        ? 'This room is fully occupied. All beds are taken.'
                        : 'This unit is already occupied. Move out the existing tenant first.';
                      Alert.alert('Unit Occupied', msg);
                      return;
                    }
                    setSelected({ buildingId: item.id, unitId: u.id });
                  }}
                  activeOpacity={available ? 0.7 : 1}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.unitNum, !available && styles.textMuted]}>
                      {u.unit_number} — {u.unit_type}
                    </Text>
                    <Text style={styles.unitRent}>
                      {formatCurrency(u.rent_per_bed)} {item.building_type === 'pg' ? '/ bed' : '/ month'}
                    </Text>
                    {item.building_type === 'pg' && (
                      <Text style={styles.bedInfo}>
                        {u.active_tenant_count}/{u.total_beds} beds occupied
                        {bedsFree !== null && bedsFree > 0 ? ` · ${bedsFree} free` : ''}
                      </Text>
                    )}
                  </View>

                  {/* Status badge */}
                  {available ? (
                    <View style={[styles.badge, { backgroundColor: COLORS.successLight }]}>
                      <Text style={{ fontSize: 11, color: COLORS.success, fontWeight: '600' }}>
                        {item.building_type === 'pg' ? `${bedsFree} Bed${bedsFree !== 1 ? 's' : ''} Free` : 'Vacant'}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.badge, { backgroundColor: COLORS.dangerLight }]}>
                      <Text style={{ fontSize: 11, color: COLORS.danger, fontWeight: '600' }}>Full</Text>
                    </View>
                  )}

                  {/* Lock icon for unavailable, checkmark for selected */}
                  {!available && (
                    <Ionicons name="lock-closed" size={16} color={COLORS.muted} />
                  )}
                  {isSelected && available && (
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      />
      <View style={styles.footer}>
        <TouchableOpacity style={styles.nextBtn} onPress={proceed}>
          <Text style={styles.nextText}>Next: Tenant Details →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { fontSize: 18, fontWeight: '700', color: COLORS.text, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  sub: { fontSize: 13, color: COLORS.muted, paddingHorizontal: 16, marginBottom: 8 },
  list: { padding: 16, gap: 12 },
  buildingGroup: { backgroundColor: COLORS.white, borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  buildingName: { fontSize: 14, fontWeight: '700', color: COLORS.text, padding: 12, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  unitRow: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10,
  },
  unitRowSelected: { backgroundColor: COLORS.primaryLight },
  unitRowLocked: { backgroundColor: '#FAFAFA', opacity: 0.75 },
  unitNum: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  textMuted: { color: COLORS.muted },
  unitRent: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  bedInfo: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  footer: { padding: 16, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.border },
  nextBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  nextText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: COLORS.muted, fontSize: 14, textAlign: 'center' },
});
