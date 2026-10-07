import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Modal, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useSelectedBuilding } from '../../context/SelectedBuildingContext';
import { COLORS } from '../../constants';
import { formatCurrency } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';

type Props = NativeStackScreenProps<AppStackParamList, 'AllUnits'>;

interface ActiveTenant { id: string; full_name: string; }

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
  tenant_id: string | null;       // first tenant (for residential quick-nav)
  tenant_name: string | null;     // first tenant name
  active_tenants: ActiveTenant[]; // all active tenants (important for PG)
}

interface BuildingSummary {
  id: string;
  name: string;
  building_type: 'residential' | 'pg';
}

export default function AllUnitsScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { selectedBuildingId: contextBuildingId } = useSelectedBuilding();

  const [buildings, setBuildings] = useState<BuildingSummary[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(contextBuildingId ?? '');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [units, setUnits] = useState<UnitRow[]>([]);
  const [filtered, setFiltered] = useState<UnitRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [vacantSheet, setVacantSheet] = useState<UnitRow | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);

    // Load buildings list for dropdown
    const { data: bldData } = await supabase
      .from('buildings')
      .select('id, name, building_type')
      .eq('owner_id', user.id)
      .order('name');

    const blds: BuildingSummary[] = (bldData ?? []).map((b: any) => ({
      id: b.id,
      name: b.name,
      building_type: b.building_type,
    }));
    setBuildings(blds);

    // Auto-select first building if none selected
    const effectiveBuildingId = selectedBuildingId || blds[0]?.id || '';
    if (!selectedBuildingId && blds[0]?.id) {
      setSelectedBuildingId(blds[0].id);
    }

    if (!effectiveBuildingId) {
      setUnits([]);
      setFiltered([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('units')
      .select(`
        id, unit_number, unit_type, is_vacant, rent_per_bed, total_beds,
        buildings(id, name, building_type),
        tenants(id, full_name, is_active)
      `)
      .eq('owner_id', user.id)
      .eq('building_id', effectiveBuildingId)
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
        active_tenants: activeTenants.map((t: any) => ({ id: t.id, full_name: t.full_name })),
      };
    });
    setUnits(rows);
    setFiltered(rows);
    setSearch('');
    setLoading(false);
  }, [user, selectedBuildingId]);

  // Apply context building only on the very first focus — after that the user's
  // own selection in this screen takes precedence.
  const appliedContextRef = React.useRef(false);
  useFocusEffect(useCallback(() => {
    if (!appliedContextRef.current && contextBuildingId && contextBuildingId !== selectedBuildingId) {
      appliedContextRef.current = true;
      setSelectedBuildingId(contextBuildingId);
    }
    load();
    return () => setDropdownOpen(false);
  }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(true); setRefreshing(false); };

  const handleSearch = (q: string) => {
    setSearch(q);
    const lower = q.toLowerCase();
    setFiltered(units.filter(u =>
      u.unit_number.toLowerCase().includes(lower) ||
      u.unit_type.toLowerCase().includes(lower) ||
      (u.tenant_name ?? '').toLowerCase().includes(lower)
    ));
  };

  const totalUnits = units.length;
  const vacantCount = units.filter(u => u.is_vacant).length;
  const occupiedCount = totalUnits - vacantCount;

  const selectedBuilding = buildings.find(b => b.id === selectedBuildingId);
  const dropdownLabel = selectedBuilding?.name ?? 'Select Property';

  const bannerSubtitle = selectedBuilding
    ? `${selectedBuilding.name}  ·  ${totalUnits} unit${totalUnits !== 1 ? 's' : ''} · ${occupiedCount} occupied · ${vacantCount} vacant`
    : 'Select a property';

  return (
    <View style={styles.container}>
      <BlueBannerHeader
        title="All Units"
        subtitle={bannerSubtitle}
        onBack={() => navigation.goBack()}
      />

      {/* Building selector — single box, expands in-place */}
      <View style={styles.dropdownBox}>
        <TouchableOpacity style={styles.dropdownTriggerRow} onPress={() => setDropdownOpen(v => !v)} activeOpacity={0.8}>
          <Ionicons name="business-outline" size={16} color={COLORS.primary} />
          <Text style={styles.dropdownLabel} numberOfLines={1}>{dropdownLabel}</Text>
          <Ionicons name={dropdownOpen ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.muted} />
        </TouchableOpacity>
        {dropdownOpen && (
          <View style={styles.dropdownList}>
            {buildings.map(b => (
              <TouchableOpacity
                key={b.id}
                style={[styles.dropdownListItem, selectedBuildingId === b.id && styles.dropdownListItemActive]}
                onPress={() => { setSelectedBuildingId(b.id); setDropdownOpen(false); }}
              >
                <Ionicons name={b.building_type === 'pg' ? 'bed-outline' : 'business-outline'} size={16} color={selectedBuildingId === b.id ? COLORS.primary : COLORS.muted} />
                <Text style={[styles.dropdownListItemText, selectedBuildingId === b.id && styles.dropdownListItemTextActive]}>
                  {b.name}
                </Text>
                {selectedBuildingId === b.id && <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

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
                placeholder="Search unit, tenant..."
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
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => {
                if (selectedBuildingId) {
                  navigation.navigate('AddEditUnit', { buildingId: selectedBuildingId });
                } else {
                  navigation.navigate('Buildings' as any);
                }
              }}
            >
              <Ionicons name="add-circle" size={22} color={COLORS.primary} />
              <Text style={styles.addText}>
                {selectedBuildingId ? 'Add New Unit' : 'Select a property first'}
              </Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={loading ? null : (
          <View style={styles.empty}>
            <Ionicons name="home-outline" size={48} color={COLORS.border} />
            <Text style={styles.emptyTitle}>{selectedBuildingId ? 'No units yet' : 'Select a property'}</Text>
            <Text style={styles.emptyText}>{selectedBuildingId ? 'Add units to this property.' : 'Use the dropdown above.'}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const isPG = item.building_type === 'pg';
          const isVacant = item.is_vacant;
          const rentLabel = isPG
            ? `${formatCurrency(item.rent_per_bed)} / bed · ${item.total_beds} bed${item.total_beds !== 1 ? 's' : ''}`
            : `${formatCurrency(item.rent_per_bed)} / month`;
          const bedsLabel = isPG ? `${item.active_count}/${item.total_beds} beds occupied` : null;

          // PG: always show sheet (need bed detail + add more tenant)
          // Residential fully occupied: navigate directly to tenant profile
          const handlePress = () => {
            if (isPG || isVacant) {
              setVacantSheet(item);
            } else if (item.tenant_id) {
              navigation.navigate('TenantProfile', { tenantId: item.tenant_id });
            } else {
              setVacantSheet(item);
            }
          };

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={handlePress}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.unitNum}>{item.unit_number}</Text>
                <Text style={styles.unitType}>{item.unit_type}</Text>
                <Text style={styles.rent}>{rentLabel}</Text>
                {bedsLabel && <Text style={styles.beds}>{bedsLabel}</Text>}
                {isPG && item.active_tenants.map(t => (
                  <Text key={t.id} style={styles.tenantName}>👤 {t.full_name}</Text>
                ))}
                {!isPG && !isVacant && item.tenant_name && (
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
                      : (isPG ? `${item.active_count}/${item.total_beds} beds` : 'Occupied')}
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
        animationType="fade"
        statusBarTranslucent
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

                {/* Beds / Status row */}
                {vacantSheet.building_type === 'pg' ? (
                  <>
                    <View style={styles.sheetRow}>
                      <Text style={styles.sheetLabel}>Beds</Text>
                      <Text style={styles.sheetValue}>
                        {vacantSheet.total_beds} total · {vacantSheet.active_count} occupied · {vacantSheet.total_beds - vacantSheet.active_count} free
                      </Text>
                    </View>
                    <View style={styles.sheetRow}>
                      <Text style={styles.sheetLabel}>Rent / Bed</Text>
                      <Text style={styles.sheetValue}>{formatCurrency(vacantSheet.rent_per_bed)}</Text>
                    </View>
                    {/* Tenant list for PG */}
                    {vacantSheet.active_tenants.length > 0 && (
                      <View style={{ marginTop: 4 }}>
                        <Text style={[styles.sheetLabel, { marginBottom: 6 }]}>Current Tenants</Text>
                        {vacantSheet.active_tenants.map(t => (
                          <TouchableOpacity
                            key={t.id}
                            style={styles.sheetTenantRow}
                            onPress={() => { setVacantSheet(null); navigation.navigate('TenantProfile', { tenantId: t.id }); }}
                          >
                            <Ionicons name="person-circle-outline" size={18} color={COLORS.primary} />
                            <Text style={styles.sheetTenantName}>{t.full_name}</Text>
                            <Ionicons name="chevron-forward" size={14} color={COLORS.muted} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    <View style={styles.sheetRow}>
                      <Text style={styles.sheetLabel}>Status</Text>
                      <View style={[styles.badge, { backgroundColor: COLORS.successLight }]}>
                        <Text style={[styles.badgeText, { color: COLORS.success }]}>Vacant</Text>
                      </View>
                    </View>
                    <View style={styles.sheetRow}>
                      <Text style={styles.sheetLabel}>Monthly Rent</Text>
                      <Text style={styles.sheetValue}>{formatCurrency(vacantSheet.rent_per_bed)}</Text>
                    </View>
                  </>
                )}

                <View style={styles.sheetDivider} />

                {/* Add tenant button — only when capacity available */}
                {(vacantSheet.building_type !== 'pg' || vacantSheet.active_count < vacantSheet.total_beds) && (
                  <TouchableOpacity
                    style={styles.sheetAddBtn}
                    onPress={() => {
                      setVacantSheet(null);
                      navigation.navigate('AddTenantStep2', {
                        buildingId: vacantSheet.building_id,
                        unitId: vacantSheet.id,
                        buildingType: vacantSheet.building_type,
                      });
                    }}
                  >
                    <Ionicons name="person-add-outline" size={20} color="#fff" />
                    <Text style={styles.sheetAddText}>
                      {vacantSheet.building_type === 'pg' ? 'Add Bed Tenant' : 'Add Tenant'}
                    </Text>
                  </TouchableOpacity>
                )}

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

  dropdownBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  dropdownLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text },

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
  sheetTenantRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 9, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  sheetTenantName: { flex: 1, fontSize: 14, color: COLORS.text, fontWeight: '500' },

  dropdownBox: {
    backgroundColor: COLORS.white,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    overflow: 'hidden',
  },
  dropdownTriggerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  dropdownList: { borderTopWidth: 1, borderTopColor: COLORS.border },
  dropdownListItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  dropdownListItemActive: { backgroundColor: '#EFF6FF' },
  dropdownListItemText: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.text },
  dropdownListItemTextActive: { color: COLORS.primary },
});
