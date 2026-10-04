import React, { useState, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import { AppStackParamList } from '../../navigation/RootNavigator';
import { formatCurrency } from '../../utils';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, 'AddTenantStep1'>;
  route: any;
};

interface UnitItem {
  id: string;
  unit_number: string;
  unit_type: string;
  rent_per_bed: number;
  total_beds: number;
  active_tenant_count: number;
}

interface BuildingItem {
  id: string;
  name: string;
  building_type: any;
  units: UnitItem[];
}

export default function AddTenantStep1Screen({ navigation, route }: Props) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  // Optional: pre-filter to a specific building (passed from AllUnitsScreen or BuildingDetail)
  const prefilteredBuildingId: string | undefined = route.params?.buildingId;
  const prefilteredUnitId: string | undefined = route.params?.unitId;

  const [buildings, setBuildings] = useState<BuildingItem[]>([]);
  const [selected, setSelected] = useState<{ buildingId: string; unitId: string } | null>(
    prefilteredBuildingId && prefilteredUnitId
      ? { buildingId: prefilteredBuildingId, unitId: prefilteredUnitId }
      : null
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Cancel button in header
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

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);

    // Fetch buildings + units — only vacant/available units
    let bldQuery = supabase
      .from('buildings')
      .select('id, name, building_type, units(id, unit_number, unit_type, is_vacant, rent_per_bed, total_beds)')
      .eq('owner_id', user.id)
      .order('name');

    // If pre-filtered to a specific building, fetch only that one
    if (prefilteredBuildingId) {
      bldQuery = bldQuery.eq('id', prefilteredBuildingId);
    }

    const { data: buildingData } = await bldQuery;
    if (!buildingData) { setBuildings([]); setLoading(false); return; }

    // Fetch active tenant counts per unit
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

    const enriched: BuildingItem[] = buildingData
      .map((b: any) => {
        const availableUnits = (b.units ?? [])
          .map((u: any) => ({ ...u, active_tenant_count: tenantCountMap[u.id] ?? 0 }))
          .filter((u: any) => {
            if (b.building_type === 'pg') return u.active_tenant_count < u.total_beds;
            return u.active_tenant_count === 0;
          });
        return { ...b, units: availableUnits };
      })
      .filter((b: BuildingItem) => b.units.length > 0); // hide buildings with no available units

    setBuildings(enriched);
    setLoading(false);

    // If pre-selected unit+building, jump straight to Step 2
    if (prefilteredBuildingId && prefilteredUnitId && !selected) {
      const building = enriched.find(b => b.id === prefilteredBuildingId);
      if (building) {
        navigation.replace('AddTenantStep2', {
          buildingId: prefilteredBuildingId,
          unitId: prefilteredUnitId,
          buildingType: building.building_type,
        });
      }
    }
  }, [user, prefilteredBuildingId, prefilteredUnitId]);

  useFocusEffect(useCallback(() => {
    if (buildings.length > 0) { load(true); } else { load(); }
  }, [load, buildings.length]));
  const onRefresh = async () => { setRefreshing(true); await load(true); setRefreshing(false); };

  const proceed = () => {
    if (!selected) { Alert.alert('Select a unit', 'Please select a unit to add a resident.'); return; }
    const building = buildings.find(b => b.id === selected.buildingId);
    navigation.navigate('AddTenantStep2', {
      ...selected,
      buildingType: building?.building_type ?? 'residential',
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Step 1: Select Unit</Text>
      <Text style={styles.sub}>Only vacant / available units are shown.</Text>
      <FlatList
        data={buildings}
        keyExtractor={b => b.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={loading ? null : (
          <View style={styles.empty}>
            <Ionicons name="home-outline" size={48} color={COLORS.border} />
            <Text style={styles.emptyTitle}>No vacant units</Text>
            <Text style={styles.emptyText}>All units are occupied or no properties exist.</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.buildingGroup}>
            <Text style={styles.buildingName}>
              {item.building_type === 'residential' ? '🏠' : '🏨'} {item.name}
            </Text>
            {item.units.map(u => {
              const isSelected = selected?.unitId === u.id;
              const bedsFree = item.building_type === 'pg' ? u.total_beds - u.active_tenant_count : null;

              return (
                <TouchableOpacity
                  key={u.id}
                  style={[styles.unitRow, isSelected && styles.unitRowSelected]}
                  onPress={() => setSelected({ buildingId: item.id, unitId: u.id })}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.unitNum}>{u.unit_number} — {u.unit_type}</Text>
                    <Text style={styles.unitRent}>
                      {formatCurrency(u.rent_per_bed)} {item.building_type === 'pg' ? '/ bed' : '/ month'}
                    </Text>
                    {item.building_type === 'pg' && (
                      <Text style={styles.bedInfo}>
                        {u.active_tenant_count}/{u.total_beds} beds occupied · {bedsFree} free
                      </Text>
                    )}
                  </View>
                  <View style={[styles.badge, { backgroundColor: COLORS.successLight }]}>
                    <Text style={{ fontSize: 11, color: COLORS.success, fontWeight: '600' }}>
                      {item.building_type === 'pg' ? `${bedsFree} Bed${bedsFree !== 1 ? 's' : ''} Free` : 'Vacant'}
                    </Text>
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
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
  list: { padding: 16, gap: 12, paddingBottom: 160 },
  buildingGroup: { backgroundColor: COLORS.white, borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  buildingName: { fontSize: 14, fontWeight: '700', color: COLORS.text, padding: 12, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  unitRow: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10,
  },
  unitRowSelected: { backgroundColor: COLORS.primaryLight },
  unitNum: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  unitRent: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  bedInfo: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  footer: { padding: 16, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.border },
  nextBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  nextText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.muted, textAlign: 'center' },
});
