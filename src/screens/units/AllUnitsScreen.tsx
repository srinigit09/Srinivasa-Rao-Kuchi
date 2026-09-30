import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Modal, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import { formatCurrency } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';

type Props = NativeStackScreenProps<AppStackParamList, 'AllUnits'>;

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

export default function AllUnitsScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { buildingId, buildingName } = route.params ?? {};
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [filtered, setFiltered] = useState<UnitRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [vacantSheet, setVacantSheet] = useState<UnitRow | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    let query = supabase
      .from('units')
      .select(`
        id, unit_number, unit_type, is_vacant, rent_per_bed, total_beds,
        buildings(id, name, building_type),
        tenants(id, full_name, is_active)
      `)
      .eq('owner_id', user.id)
      .order('unit_number');
    if (buildingId) query = query.eq('building_id', buildingId);
    const { data } = await query;

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
    setFiltered(rows);
    setLoading(false);
  }, [user, buildingId]);

  useFocusEffect(useCallback(() => {
    if (units.length > 0) { load(true); } else { load(); }
  }, [load, units.length]));
  const onRefresh = async () => { setRefreshing(true); await load(true); setRefreshing(false); };

  const handleSearch = (q: string) => {
    setSearch(q);
    const lower = q.toLowerCase();
    setFiltered(units.filter(u =>
      u.unit_number.toLowerCase().includes(lower) ||
      u.building_name.toLowerCase().includes(lower) ||
      u.unit_type.toLowerCase().includes(lower) ||
      (u.tenant_name ?? '').toLowerCase().includes(lower)
    ));
  };

  const totalUnits = units.length;
  const vacantCount = units.filter(u => u.is_vacant).length;
  const occupiedCount = totalUnits - vacantCount;

  const bannerSubtitle = buildingName
    ? `${buildingName}  ·  ${totalUnits} units · ${occupiedCount} occupied · ${vacantCount} vacant`
    : `${totalUnits} units · ${occupiedCount} occupied · ${vacantCount} vacant`;

  const handleAddUnit = () => {
    if (buildingId) {
      // We have a building context — go straight to add unit form
      navigation.navigate('AddEditUnit', { buildingId });
    } else {
      // No building context — go to Buildings screen to pick one first
      navigation.navigate('Buildings' as any);
    }
  };

  return (
    <View style={styles.container}>
      <BlueBannerHeader
        title="All Units"
        subtitle={bannerSubtitle}
        onBack={() => navigation.goBack()}
      />

      <FlatList
        data={filtered}
        keyExtractor={u => u.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={COLORS.muted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search unit, building, tenant..."
                placeholderTextColor={COLORS.muted}
                value={search}
                onChangeText={handleSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => { setSearch(''); setFiltered(units); }}>
                  <Ionicons name="close-circle" size={16} color={COLORS.muted} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={styles.addBtn} onPress={handleAddUnit}>
              <Ionicons name="add-circle" size={22} color={COLORS.primary} />
              <Text style={styles.addText}>
                {buildingId ? 'Add New Unit' : 'Add New Unit (select building first)'}
              </Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={loading ? null : (
          <View style={styles.empty}>
            <Ionicons name="home-outline" size={48} color={COLORS.border} />
            <Text style={styles.emptyTitle}>No units yet</Text>
            <Text style={styles.emptyText}>Add buildings and units first.</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const isPG = item.building_type === 'pg';
          const isVacant = item.is_vacant;
          const rentLabel = isPG
            ? `${formatCurrency(item.rent_per_bed)} / bed · ${item.total_beds} beds`
            : `${formatCurrency(item.rent_per_bed)} / month`;
          const bedsLabel = isPG ? `${item.active_count}/${item.total_beds} beds occupied` : null;

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => {
                if (!isVacant && item.tenant_id) {
                  navigation.navigate('TenantProfile', { tenantId: item.tenant_id });
                } else {
                  // Show vacant unit detail sheet
                  setVacantSheet(item);
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
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* ── Vacant Unit Detail Sheet ── */}
      <Modal
        visible={!!vacantSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setVacantSheet(null)}
      >
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setVacantSheet(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            {vacantSheet && (
              <>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>{vacantSheet.unit_number}</Text>
                <Text style={styles.sheetSub}>{vacantSheet.unit_type} · {vacantSheet.building_name}</Text>

                <View style={styles.sheetDivider} />

                <View style={styles.sheetRow}>
                  <Text style={styles.sheetLabel}>Status</Text>
                  <View style={[styles.badge, { backgroundColor: COLORS.successLight }]}>
                    <Text style={[styles.badgeText, { color: COLORS.success }]}>Vacant</Text>
                  </View>
                </View>
                <View style={styles.sheetRow}>
                  <Text style={styles.sheetLabel}>Rent</Text>
                  <Text style={styles.sheetValue}>
                    {formatCurrency(vacantSheet.rent_per_bed)}
                    {vacantSheet.building_type === 'pg' ? ' / bed' : ' / month'}
                  </Text>
                </View>
                {vacantSheet.building_type === 'pg' && (
                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetLabel}>Beds</Text>
                    <Text style={styles.sheetValue}>{vacantSheet.total_beds} total · {vacantSheet.total_beds - vacantSheet.active_count} free</Text>
                  </View>
                )}

                <View style={styles.sheetDivider} />

                <TouchableOpacity
                  style={styles.sheetAddBtn}
                  onPress={() => {
                    setVacantSheet(null);
                    navigation.navigate('AddNewTenant');
                  }}
                >
                  <Ionicons name="person-add-outline" size={20} color="#fff" />
                  <Text style={styles.sheetAddText}>Add New Tenant</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.sheetCancelBtn} onPress={() => setVacantSheet(null)}>
                  <Text style={styles.sheetCancelText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: 16, gap: 10, paddingBottom: 32 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.white, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.primaryLight, padding: 15, borderRadius: 12, marginBottom: 6,
  },
  addText: { color: COLORS.primary, fontWeight: '700', fontSize: 15 },
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
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.muted },

  // Vacant unit sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 36,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, elevation: 16,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  sheetSub: { fontSize: 14, color: COLORS.muted, marginTop: 4, marginBottom: 16 },
  sheetDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 12 },
  sheetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  sheetLabel: { fontSize: 14, color: COLORS.muted, fontWeight: '500' },
  sheetValue: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  sheetAddBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 15, marginTop: 8,
  },
  sheetAddText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  sheetCancelBtn: { alignItems: 'center', paddingVertical: 14 },
  sheetCancelText: { color: COLORS.muted, fontSize: 15, fontWeight: '600' },
});
