import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, RefreshControl,
  TextInput, FlatList, Modal,
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

type Props = NativeStackScreenProps<AppStackParamList, 'AddNewTenant'>;

interface VacantUnit {
  id: string;
  unit_number: string;
  unit_type: string;
  rent_per_bed: number;
  total_beds: number;
  active_count: number;
  building_id: string;
  building_name: string;
  building_type: 'residential' | 'pg';
}

export default function AddNewTenantScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [units, setUnits] = useState<VacantUnit[]>([]);
  const [filtered, setFiltered] = useState<VacantUnit[]>([]);
  const [selected, setSelected] = useState<VacantUnit | null>(null);
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);

    // Fetch all units with building info
    const { data: unitData } = await supabase
      .from('units')
      .select('id, unit_number, unit_type, is_vacant, rent_per_bed, total_beds, buildings(id, name, building_type)')
      .eq('owner_id', user.id)
      .order('unit_number');

    if (!unitData) { setLoading(false); return; }

    // Fetch active tenant counts
    const allIds = unitData.map((u: any) => u.id);
    let countMap: Record<string, number> = {};
    if (allIds.length > 0) {
      const { data: rows } = await supabase
        .from('tenants').select('unit_id').in('unit_id', allIds).eq('is_active', true);
      (rows ?? []).forEach((r: any) => {
        countMap[r.unit_id] = (countMap[r.unit_id] ?? 0) + 1;
      });
    }

    // Keep only units that can accept a tenant
    const vacantUnits: VacantUnit[] = (unitData ?? [])
      .map((u: any) => ({
        id: u.id,
        unit_number: u.unit_number,
        unit_type: u.unit_type,
        rent_per_bed: u.rent_per_bed,
        total_beds: u.total_beds,
        active_count: countMap[u.id] ?? 0,
        building_id: u.buildings?.id ?? '',
        building_name: u.buildings?.name ?? '',
        building_type: u.buildings?.building_type ?? 'residential',
      }))
      .filter((u: VacantUnit) =>
        u.building_type === 'residential'
          ? u.active_count === 0
          : u.active_count < u.total_beds
      );

    setUnits(vacantUnits);
    setFiltered(vacantUnits);
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(true); setRefreshing(false); };

  const handleSearch = (q: string) => {
    setSearch(q);
    const lower = q.toLowerCase();
    setFiltered(units.filter(u =>
      u.unit_number.toLowerCase().includes(lower) ||
      u.building_name.toLowerCase().includes(lower) ||
      u.unit_type.toLowerCase().includes(lower)
    ));
  };

  const selectUnit = (unit: VacantUnit) => {
    setSelected(unit);
    setSearch(`${unit.unit_number} — ${unit.building_name}`);
    setDropdownOpen(false);
  };

  const proceed = () => {
    if (!selected) return;
    navigation.navigate('AddTenantStep2', {
      buildingId: selected.building_id,
      unitId: selected.id,
      buildingType: selected.building_type,
    });
  };

  const bannerSubtitle = loading
    ? 'Loading...'
    : `${units.length} vacant unit${units.length !== 1 ? 's' : ''} available`;

  return (
    <View style={styles.container}>
      <BlueBannerHeader
        title="Add New Tenant"
        subtitle={bannerSubtitle}
        onBack={() => navigation.goBack()}
      />

      <FlatList
        data={[]}
        keyExtractor={() => 'dummy'}
        renderItem={null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        ListHeaderComponent={
          <View style={styles.body}>
            <Text style={styles.sectionLabel}>Select Vacant Unit</Text>

            {/* Searchable dropdown trigger */}
            <TouchableOpacity
              style={styles.dropdownTrigger}
              onPress={() => { setDropdownOpen(true); setSearch(''); setFiltered(units); }}
              activeOpacity={0.8}
            >
              <Ionicons name="home-outline" size={18} color={selected ? COLORS.primary : COLORS.muted} />
              <Text style={[styles.dropdownTriggerText, !selected && { color: COLORS.muted }]} numberOfLines={1}>
                {selected
                  ? `${selected.unit_number} — ${selected.building_name}`
                  : 'Tap to select a unit...'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={COLORS.muted} />
            </TouchableOpacity>

            {/* Selected unit detail card */}
            {selected && (
              <View style={styles.selectedCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedTitle}>{selected.unit_number} · {selected.unit_type}</Text>
                  <Text style={styles.selectedSub}>
                    {selected.building_type === 'pg' ? '🏨' : '🏠'} {selected.building_name}
                  </Text>
                  <Text style={styles.selectedRent}>
                    {formatCurrency(selected.rent_per_bed)}
                    {selected.building_type === 'pg' ? ' / bed' : ' / month'}
                  </Text>
                  {selected.building_type === 'pg' && (
                    <Text style={styles.selectedBeds}>
                      {selected.total_beds - selected.active_count} bed{selected.total_beds - selected.active_count !== 1 ? 's' : ''} free
                    </Text>
                  )}
                </View>
                <View style={[styles.badge, { backgroundColor: COLORS.successLight }]}>
                  <Text style={[styles.badgeText, { color: COLORS.success }]}>Vacant</Text>
                </View>
              </View>
            )}

            {/* Proceed button */}
            <TouchableOpacity
              style={[styles.proceedBtn, !selected && styles.proceedBtnDisabled]}
              onPress={proceed}
              disabled={!selected}
            >
              <Ionicons name="person-add-outline" size={20} color="#fff" />
              <Text style={styles.proceedText}>Add New Tenant →</Text>
            </TouchableOpacity>

            {units.length === 0 && !loading && (
              <View style={styles.empty}>
                <Ionicons name="checkmark-circle" size={48} color={COLORS.success} />
                <Text style={styles.emptyTitle}>All units occupied!</Text>
                <Text style={styles.emptyText}>No vacant units available right now.</Text>
              </View>
            )}
          </View>
        }
      />

      {/* ── Searchable Unit Picker Modal ── */}
      <Modal
        visible={dropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownOpen(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDropdownOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select Vacant Unit</Text>

            {/* Search input */}
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={COLORS.muted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search unit, building..."
                placeholderTextColor={COLORS.muted}
                value={search}
                onChangeText={handleSearch}
                autoFocus
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => { setSearch(''); setFiltered(units); }}>
                  <Ionicons name="close-circle" size={16} color={COLORS.muted} />
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={filtered}
              keyExtractor={u => u.id}
              style={{ maxHeight: 380 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.emptyModal}>
                  <Text style={styles.emptyModalText}>No matching vacant units</Text>
                </View>
              }
              renderItem={({ item }) => {
                const isSelected = selected?.id === item.id;
                const bedsFree = item.building_type === 'pg' ? item.total_beds - item.active_count : null;
                return (
                  <TouchableOpacity
                    style={[styles.unitItem, isSelected && styles.unitItemActive]}
                    onPress={() => selectUnit(item)}
                  >
                    <Ionicons
                      name={item.building_type === 'pg' ? 'bed-outline' : 'home-outline'}
                      size={18}
                      color={isSelected ? COLORS.primary : COLORS.muted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.unitItemTitle, isSelected && { color: COLORS.primary }]}>
                        {item.unit_number} — {item.unit_type}
                      </Text>
                      <Text style={styles.unitItemSub}>
                        {item.building_name} · {formatCurrency(item.rent_per_bed)}
                        {item.building_type === 'pg' ? ` / bed · ${bedsFree} free` : ' / month'}
                      </Text>
                    </View>
                    {isSelected && <Ionicons name="checkmark" size={18} color={COLORS.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  body: { padding: 20, gap: 16 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.5 },

  dropdownTrigger: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.white, borderRadius: 12, padding: 14,
    borderWidth: 1.5, borderColor: COLORS.border,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  dropdownTriggerText: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.text },

  selectedCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.white, borderRadius: 12, padding: 16,
    borderLeftWidth: 4, borderLeftColor: COLORS.success,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    gap: 12,
  },
  selectedTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  selectedSub: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  selectedRent: { fontSize: 14, color: COLORS.primary, fontWeight: '600', marginTop: 4 },
  selectedBeds: { fontSize: 12, color: COLORS.success, fontWeight: '600', marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  badgeText: { fontSize: 12, fontWeight: '700' },

  proceedBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 16,
  },
  proceedBtnDisabled: { backgroundColor: COLORS.muted, opacity: 0.5 },
  proceedText: { color: '#fff', fontWeight: '700', fontSize: 17 },

  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.muted, textAlign: 'center' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-start', paddingTop: 100, paddingHorizontal: 16 },
  modalSheet: {
    backgroundColor: COLORS.white, borderRadius: 18, paddingTop: 16, paddingBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, elevation: 12,
  },
  modalTitle: {
    fontSize: 13, fontWeight: '700', color: COLORS.muted,
    paddingHorizontal: 18, marginBottom: 10, letterSpacing: 0.5, textTransform: 'uppercase',
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 12, marginBottom: 8,
    backgroundColor: COLORS.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text },
  unitItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 13 },
  unitItemActive: { backgroundColor: COLORS.primaryLight },
  unitItemTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  unitItemSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  emptyModal: { alignItems: 'center', paddingVertical: 32 },
  emptyModalText: { fontSize: 14, color: COLORS.muted },
});
