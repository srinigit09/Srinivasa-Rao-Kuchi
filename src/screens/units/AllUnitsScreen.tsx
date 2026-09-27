import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import { formatCurrency } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList> };

interface UnitRow {
  id: string;
  unit_number: string;
  unit_type: string;
  is_vacant: boolean;
  rent_per_bed: number;
  total_beds: number;
  building_type: 'residential' | 'pg';
  building_id: string;
  building_name: string;
  active_count: number;
  tenant_id: string | null;
  tenant_name: string | null;
}

const HEADER_BLUE = '#1D4ED8';

export default function AllUnitsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('units')
      .select(`
        id, unit_number, unit_type, is_vacant, rent_per_bed, total_beds,
        buildings(id, name, building_type),
        tenants(id, full_name, is_active)
      `)
      .eq('owner_id', user.id)
      .order('unit_number');

    const rows: UnitRow[] = (data ?? []).map((u: any) => {
      const activeTenants = (u.tenants ?? []).filter((t: any) => t.is_active);
      return {
        id: u.id,
        unit_number: u.unit_number,
        unit_type: u.unit_type,
        is_vacant: u.is_vacant,
        rent_per_bed: u.rent_per_bed,
        total_beds: u.total_beds,
        building_type: u.buildings?.building_type ?? 'residential',
        building_id: u.buildings?.id ?? '',
        building_name: u.buildings?.name ?? '',
        active_count: activeTenants.length,
        tenant_id: activeTenants[0]?.id ?? null,
        tenant_name: activeTenants[0]?.full_name ?? null,
      };
    });
    setUnits(rows);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const totalUnits = units.length;
  const vacantCount = units.filter(u => u.is_vacant).length;
  const occupiedCount = totalUnits - vacantCount;

  return (
    <View style={styles.container}>
      {/* Blue banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>All Units</Text>
        <Text style={styles.bannerSub}>
          {totalUnits} units · {occupiedCount} occupied · {vacantCount} vacant
        </Text>
      </View>

      <FlatList
        data={units}
        keyExtractor={u => u.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="home-outline" size={48} color={COLORS.border} />
            <Text style={styles.emptyTitle}>No units yet</Text>
            <Text style={styles.emptyText}>Add buildings and units first.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isPG = item.building_type === 'pg';
          const isVacant = item.is_vacant;
          const rentLabel = isPG
            ? `${formatCurrency(item.rent_per_bed)} / bed · ${item.total_beds} beds`
            : `${formatCurrency(item.rent_per_bed)} / month`;
          const bedsLabel = isPG
            ? `${item.active_count}/${item.total_beds} beds occupied`
            : null;

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => {
                if (!isVacant && item.tenant_id) {
                  navigation.navigate('TenantProfile', { tenantId: item.tenant_id });
                } else {
                  navigation.navigate('BuildingDetail', { buildingId: item.building_id });
                }
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.unitNum}>{item.unit_number}</Text>
                <Text style={styles.unitType}>{item.unit_type} · {item.building_name}</Text>
                <Text style={styles.rent}>{rentLabel}</Text>
                {bedsLabel && <Text style={styles.beds}>{bedsLabel}</Text>}
                {!isVacant && item.tenant_name && (
                  <Text style={styles.tenantName}>👤 {item.tenant_name}</Text>
                )}
              </View>

              <View style={styles.right}>
                <View style={[
                  styles.badge,
                  { backgroundColor: isVacant ? COLORS.successLight : COLORS.primaryLight },
                ]}>
                  <Text style={[styles.badgeText, { color: isVacant ? COLORS.success : COLORS.primary }]}>
                    {isVacant
                      ? (isPG && item.total_beds > item.active_count
                          ? `${item.total_beds - item.active_count} bed${item.total_beds - item.active_count > 1 ? 's' : ''} free`
                          : 'Vacant')
                      : 'Occupied'}
                  </Text>
                </View>

                {isVacant && (
                  <TouchableOpacity
                    style={styles.addTenantBtn}
                    onPress={() => navigation.navigate('AddTenantStep1')}
                  >
                    <Ionicons name="person-add-outline" size={14} color={COLORS.primary} />
                    <Text style={styles.addTenantText}>Add Tenant</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  banner: {
    backgroundColor: HEADER_BLUE,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  bannerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  bannerSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  list: { padding: 16, gap: 10, paddingBottom: 32 },
  card: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'flex-start',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  unitNum: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  unitType: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  rent: { fontSize: 13, color: COLORS.primary, fontWeight: '600', marginTop: 4 },
  beds: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  tenantName: { fontSize: 13, color: COLORS.text, marginTop: 4, fontWeight: '500' },
  right: { alignItems: 'flex-end', gap: 8, marginLeft: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  addTenantBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primaryLight, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7,
  },
  addTenantText: { fontSize: 11, color: COLORS.primary, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.muted },
});
