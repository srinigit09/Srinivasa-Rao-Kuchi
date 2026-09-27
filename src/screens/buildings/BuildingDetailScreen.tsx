import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../constants';
import { Unit } from '../../types';
import { formatCurrency } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, 'BuildingDetail'>;
  route: RouteProp<AppStackParamList, 'BuildingDetail'>;
};

interface TenantRow {
  id: string;
  full_name: string;
  is_active: boolean;
}

interface UnitWithTenants extends Unit {
  tenants: TenantRow[];
}

export default function BuildingDetailScreen({ navigation, route }: Props) {
  const { buildingId } = route.params;
  const [building, setBuilding] = useState<any>(null);
  const [units, setUnits] = useState<UnitWithTenants[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [{ data: b }, { data: u }] = await Promise.all([
      supabase.from('buildings').select('*').eq('id', buildingId).single(),
      supabase.from('units').select('*, tenants(id, full_name, is_active)').eq('building_id', buildingId).order('unit_number'),
    ]);
    if (b) { setBuilding(b); navigation.setOptions({ title: b.name }); }
    if (u) setUnits(u as any);
  }, [buildingId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const deleteUnit = async (id: string) => {
    Alert.alert('Delete Unit?', 'This will remove the unit and any tenant data.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await supabase.from('units').delete().eq('id', id); load(); } },
    ]);
  };

  const openAddTenant = (item: UnitWithTenants) => {
    navigation.navigate('AddTenantStep2', {
      buildingId,
      unitId: item.id,
      buildingType: building?.building_type ?? 'residential',
    });
  };

  const isPG = building?.building_type === 'pg';
  const totalBeds = units.reduce((s, u) => s + (u.total_beds ?? 0), 0);
  const occupiedBeds = units.reduce((s, u) => {
    const active = u.tenants?.filter(t => t.is_active).length ?? 0;
    return s + active;
  }, 0);

  return (
    <View style={styles.container}>
      <FlatList
        data={units}
        keyExtractor={u => u.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            {building && (
              <View style={styles.buildingCard}>
                <View style={styles.buildingCardRow}>
                  <Text style={styles.buildingType}>
                    {isPG ? '🏨 PG/Hostel' : '🏠 Residential'}
                  </Text>
                  <TouchableOpacity
                    style={styles.editBuildingBtn}
                    onPress={() => navigation.navigate('AddEditBuilding', { buildingId })}
                  >
                    <Ionicons name="pencil-outline" size={15} color={COLORS.primary} />
                  </TouchableOpacity>
                </View>
                {building.address && <Text style={styles.address}>{building.address}</Text>}
                <View style={styles.statsRow}>
                  <View style={styles.statChip}>
                    <Text style={styles.statChipValue}>{units.length}</Text>
                    <Text style={styles.statChipLabel}>{isPG ? 'Units' : 'Total Units'}</Text>
                  </View>
                  {isPG && (
                    <>
                      <View style={styles.statChip}>
                        <Text style={styles.statChipValue}>{totalBeds}</Text>
                        <Text style={styles.statChipLabel}>Total Beds</Text>
                      </View>
                      <View style={styles.statChip}>
                        <Text style={[styles.statChipValue, { color: COLORS.success }]}>{occupiedBeds}</Text>
                        <Text style={styles.statChipLabel}>Occupied</Text>
                      </View>
                      <View style={styles.statChip}>
                        <Text style={[styles.statChipValue, { color: COLORS.warning }]}>{totalBeds - occupiedBeds}</Text>
                        <Text style={styles.statChipLabel}>Vacant Beds</Text>
                      </View>
                    </>
                  )}
                  {!isPG && (
                    <>
                      <View style={styles.statChip}>
                        <Text style={[styles.statChipValue, { color: COLORS.success }]}>
                          {units.filter(u => !u.is_vacant).length}
                        </Text>
                        <Text style={styles.statChipLabel}>Occupied</Text>
                      </View>
                      <View style={styles.statChip}>
                        <Text style={[styles.statChipValue, { color: COLORS.warning }]}>
                          {units.filter(u => u.is_vacant).length}
                        </Text>
                        <Text style={styles.statChipLabel}>Vacant</Text>
                      </View>
                    </>
                  )}
                </View>
              </View>
            )}
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => navigation.navigate('AddEditUnit', { buildingId })}
            >
              <Ionicons name="add-circle" size={20} color={COLORS.primary} />
              <Text style={styles.addText}>Add Unit</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🚪</Text>
            <Text style={styles.emptyTitle}>No units yet</Text>
            <Text style={styles.emptyText}>Add units to this building.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const activeTenants = item.tenants?.filter(t => t.is_active) ?? [];
          const isVacant = item.is_vacant;
          const buildingType = building?.building_type ?? 'residential';
          const isPG = buildingType === 'pg';
          const hasCapacity = isPG
            ? activeTenants.length < item.total_beds
            : activeTenants.length === 0;

          return (
            <View style={styles.unitCard}>
              {/* Left section — unit info + tenant chips */}
              <View style={styles.unitLeft}>
                <Text style={styles.unitNum}>{item.unit_number}</Text>
                <Text style={styles.unitType}>{item.unit_type}</Text>
                <Text style={styles.rentText}>
                  {formatCurrency(item.rent_per_bed)} {isPG ? '/ bed' : '/ month'}
                </Text>

                {/* Active tenant chips — each tappable → TenantProfile */}
                {activeTenants.length > 0 && (
                  <View style={styles.tenantChips}>
                    {activeTenants.map(t => (
                      <TouchableOpacity
                        key={t.id}
                        style={styles.tenantChip}
                        onPress={() => navigation.navigate('TenantProfile', { tenantId: t.id })}
                      >
                        <Text style={styles.tenantChipText}>👤 {t.full_name}</Text>
                        <Ionicons name="chevron-forward" size={12} color={COLORS.primary} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Add tenant shortcut — only when unit has free capacity */}
                {hasCapacity && (
                  <TouchableOpacity style={styles.addTenantBtn} onPress={() => openAddTenant(item)}>
                    <Ionicons name="person-add-outline" size={13} color={COLORS.success} />
                    <Text style={styles.addTenantText}>
                      {isPG ? 'Add bed tenant' : 'Add tenant'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Right section — status badge + edit/delete */}
              <View style={styles.unitRight}>
                <View style={[
                  styles.badge,
                  { backgroundColor: isVacant ? COLORS.successLight : COLORS.primaryLight },
                ]}>
                  <Text style={{
                    fontSize: 11, fontWeight: '600',
                    color: isVacant ? COLORS.success : COLORS.primary,
                  }}>
                    {isVacant ? 'Vacant' : isPG ? `${activeTenants.length}/${item.total_beds} beds` : 'Occupied'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => navigation.navigate('AddEditUnit', { buildingId, unitId: item.id })}
                  style={styles.iconBtn}
                >
                  <Ionicons name="pencil-outline" size={16} color={COLORS.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteUnit(item.id)} style={styles.iconBtn}>
                  <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: 16, gap: 10, paddingBottom: 32 },
  buildingCard: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 16, marginBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  buildingCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  buildingType: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  editBuildingBtn: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  address: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  statChip: {
    backgroundColor: COLORS.bg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
    alignItems: 'center', minWidth: 64,
  },
  statChipValue: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  statChipLabel: { fontSize: 10, color: COLORS.muted, marginTop: 2 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primaryLight, padding: 14, borderRadius: 10, marginBottom: 4,
  },
  addText: { color: COLORS.primary, fontWeight: '600', fontSize: 15 },
  unitCard: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'flex-start',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  unitLeft: { flex: 1, gap: 4 },
  unitNum: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  unitType: { fontSize: 12, color: COLORS.muted },
  rentText: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  tenantChips: { flexDirection: 'column', gap: 4, marginTop: 4 },
  tenantChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primaryLight, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, alignSelf: 'flex-start',
  },
  tenantChipText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  addTenantBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 2, alignSelf: 'flex-start',
  },
  addTenantText: { fontSize: 12, color: COLORS.success, fontWeight: '600' },
  unitRight: { alignItems: 'flex-end', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  iconBtn: { padding: 4 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 13, color: COLORS.muted },
});
