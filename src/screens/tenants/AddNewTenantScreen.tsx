import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, RefreshControl,
  TextInput, FlatList,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import { formatCurrency } from '../../utils';
import { BuildingType } from '../../types';
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
  building_type: BuildingType;
}

interface BuildingSummary {
  id: string;
  name: string;
  building_type: BuildingType;
}

export default function AddNewTenantScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const preselectedBuildingId = route.params?.preselectedBuildingId ?? '';

  // Track current user-chosen building separately from the route param
  const [allUnits, setAllUnits] = useState<VacantUnit[]>([]);
  const [units, setUnits] = useState<VacantUnit[]>([]);
  const [buildings, setBuildings] = useState<BuildingSummary[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(preselectedBuildingId);
  const [buildingDropdownOpen, setBuildingDropdownOpen] = useState(false);
  const [totalUnitsCount, setTotalUnitsCount] = useState<number>(0);
  const [filtered, setFiltered] = useState<VacantUnit[]>([]);
  const [selected, setSelected] = useState<VacantUnit | null>(null);
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // currentBuildingRef holds the building the user has chosen on THIS screen
  // so re-focus (e.g. returning from AddTenantStep2) preserves the user's choice
  const currentBuildingRef = useRef<string>(preselectedBuildingId);

  const load = useCallback(async (silent = false, forceBuildingId?: string) => {
    if (!user) return;
    if (!silent) setLoading(true);

    // Fetch buildings list
    const { data: bldData } = await supabase
      .from('buildings')
      .select('id, name, building_type')
      .eq('owner_id', user.id)
      .order('name');
    const blds: BuildingSummary[] = (bldData ?? []).map((b: any) => ({
      id: b.id, name: b.name, building_type: b.building_type,
    }));
    setBuildings(blds);

    // Fetch all units with building info
    const { data: unitData } = await supabase
      .from('units')
      .select('id, unit_number, unit_type, is_vacant, rent_per_bed, total_beds, buildings(id, name, building_type)')
      .eq('owner_id', user.id)
      .order('unit_number');

    if (!unitData) { setLoading(false); return; }
    setTotalUnitsCount(unitData.length);

    // Fetch active occupant counts
    const allIds = unitData.map((u: any) => u.id);
    let countMap: Record<string, number> = {};
    if (allIds.length > 0) {
      const { data: rows } = await supabase
        .from('tenants').select('unit_id').in('unit_id', allIds).eq('is_active', true);
      (rows ?? []).forEach((r: any) => {
        countMap[r.unit_id] = (countMap[r.unit_id] ?? 0) + 1;
      });
    }

    // Keep only units that have capacity for an occupant
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
        u.building_type === 'pg'
          ? u.active_count < u.total_beds
          : u.active_count === 0
      );

    setAllUnits(vacantUnits);

    // Priority: forced (from focus) → user's last choice → first building
    const buildingId = forceBuildingId ?? (currentBuildingRef.current || blds[0]?.id || '');
    if (buildingId !== currentBuildingRef.current) {
      currentBuildingRef.current = buildingId;
    }
    setSelectedBuildingId(buildingId);
    const newFiltered = buildingId
      ? vacantUnits.filter(u => u.building_id === buildingId)
      : vacantUnits;
    setUnits(newFiltered);
    setFiltered(newFiltered);
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => {
    // When coming from Dashboard with a preselected building, always apply it
    // When returning from a sub-screen (AddTenantStep2 etc), preserve user's last choice
    if (preselectedBuildingId) {
      currentBuildingRef.current = preselectedBuildingId;
      setSelected(null);
      setSearch('');
      load(false, preselectedBuildingId);
    } else {
      load(false, currentBuildingRef.current || undefined);
    }
  }, [load, preselectedBuildingId]));

  const onRefresh = async () => { setRefreshing(true); await load(true, currentBuildingRef.current || undefined); setRefreshing(false); };

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

  const handleBuildingSelect = (id: string) => {
    // Persist the user's manual choice so focus-restore keeps it
    currentBuildingRef.current = id;
    setSelectedBuildingId(id);
    setSelected(null);
    setSearch('');
    setBuildingDropdownOpen(false);
    const newUnits = allUnits.filter(u => u.building_id === id);
    setUnits(newUnits);
    setFiltered(newUnits);
  };

  const proceed = () => {
    if (!selected) return;
    navigation.navigate('AddTenantStep2', {
      buildingId: selected.building_id,
      unitId: selected.id,
      buildingType: selected.building_type,
    });
  };

  const selectedBuilding = buildings.find(b => b.id === selectedBuildingId);
  const bannerSubtitle = loading
    ? 'Loading...'
    : `${units.length} vacant unit${units.length !== 1 ? 's' : ''} available`;

  return (
    <View style={styles.container}>
      <BlueBannerHeader
        title="Add Resident"
        subtitle={bannerSubtitle}
        onBack={() => navigation.goBack()}
      />

      {/* Property selector bar — inline dropdown below bar */}
      <View>
        <TouchableOpacity
          style={styles.buildingBar}
          onPress={() => { setBuildingDropdownOpen(v => !v); setDropdownOpen(false); }}
          activeOpacity={0.8}
        >
          <Ionicons name="business" size={16} color={COLORS.primary} />
          <Text style={styles.buildingBarLabel} numberOfLines={1}>
            {selectedBuilding?.name ?? 'Select Property / Community'}
          </Text>
          <Ionicons name={buildingDropdownOpen ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.muted} />
        </TouchableOpacity>

        {buildingDropdownOpen && (
          <View style={styles.inlineDropdown}>
            {buildings.map(b => (
              <TouchableOpacity
                key={b.id}
                style={[styles.inlineDropdownItem, selectedBuildingId === b.id && styles.inlineDropdownItemActive]}
                onPress={() => { handleBuildingSelect(b.id); setBuildingDropdownOpen(false); }}
              >
                <Ionicons name="business-outline" size={16} color={selectedBuildingId === b.id ? COLORS.primary : COLORS.muted} />
                <Text style={[styles.inlineDropdownText, selectedBuildingId === b.id && { color: COLORS.primary, fontWeight: '700' }]}>
                  {b.name}
                </Text>
                {selectedBuildingId === b.id && <Ionicons name="checkmark" size={16} color={COLORS.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <FlatList
        data={[]}
        keyExtractor={() => 'dummy'}
        renderItem={null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        ListHeaderComponent={
          <View style={styles.body}>
            <Text style={styles.sectionLabel}>Select Vacant Unit</Text>

            {/* Searchable dropdown trigger — inline list below */}
            <TouchableOpacity
              style={styles.dropdownTrigger}
              onPress={() => { setDropdownOpen(v => !v); setBuildingDropdownOpen(false); if (!dropdownOpen) { setSearch(''); setFiltered(units); } }}
              activeOpacity={0.8}
            >
              <Ionicons name="home-outline" size={18} color={selected ? COLORS.primary : COLORS.muted} />
              <Text style={[styles.dropdownTriggerText, !selected && { color: COLORS.muted }]} numberOfLines={1}>
                {selected
                  ? `${selected.unit_number} — ${selected.building_name}`
                  : 'Tap to select a unit...'}
              </Text>
              <Ionicons name={dropdownOpen ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.muted} />
            </TouchableOpacity>

            {/* Inline unit search + list */}
            {dropdownOpen && (
              <View style={styles.inlineDropdown}>
                <View style={styles.inlineSearchRow}>
                  <Ionicons name="search" size={15} color={COLORS.muted} />
                  <TextInput
                    style={styles.inlineSearchInput}
                    placeholder="Search unit, property..."
                    placeholderTextColor={COLORS.muted}
                    value={search}
                    onChangeText={handleSearch}
                    autoFocus
                  />
                  {search.length > 0 && (
                    <TouchableOpacity onPress={() => { setSearch(''); setFiltered(units); }}>
                      <Ionicons name="close-circle" size={15} color={COLORS.muted} />
                    </TouchableOpacity>
                  )}
                </View>
                {filtered.length === 0 ? (
                  <Text style={styles.inlineEmptyText}>No matching vacant units</Text>
                ) : (
                  filtered.map(item => {
                    const isSelected = selected?.id === item.id;
                    const bedsFree = item.building_type === 'pg' ? item.total_beds - item.active_count : null;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.inlineDropdownItem, isSelected && styles.inlineDropdownItemActive]}
                        onPress={() => { selectUnit(item); setDropdownOpen(false); }}
                      >
                        <Ionicons
                          name={item.building_type === 'pg' ? 'bed-outline' : 'home-outline'}
                          size={16}
                          color={isSelected ? COLORS.primary : COLORS.muted}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.inlineDropdownText, isSelected && { color: COLORS.primary, fontWeight: '700' }]}>
                            {item.unit_number} — {item.unit_type}
                          </Text>
                          <Text style={styles.inlineDropdownSub}>
                            {item.building_name} · {formatCurrency(item.rent_per_bed)}
                            {item.building_type === 'pg' ? ` / bed · ${bedsFree} free` : ' / month'}
                          </Text>
                        </View>
                        {isSelected && <Ionicons name="checkmark" size={16} color={COLORS.primary} />}
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            )}

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
              <Text style={styles.proceedText}>Continue to Resident Details →</Text>
            </TouchableOpacity>

            {units.length === 0 && !loading && (
              <View style={styles.empty}>
                <Ionicons
                  name={totalUnitsCount === 0 ? "business-outline" : "home-outline"}
                  size={48}
                  color={totalUnitsCount === 0 ? COLORS.primary : COLORS.warning}
                />
                <Text style={styles.emptyTitle}>
                  {totalUnitsCount === 0
                    ? 'No Units Added Yet'
                    : 'No Vacant Units in this Property'}
                </Text>
                <Text style={styles.emptyText}>
                  {totalUnitsCount === 0
                    ? 'Add properties and units before assigning residents.'
                    : 'All units in this property are currently occupied. Add a new unit to continue.'}
                </Text>
                <TouchableOpacity
                  style={styles.addUnitBtn}
                  onPress={() => {
                    if (selectedBuildingId) {
                      navigation.navigate('AddEditUnit', { buildingId: selectedBuildingId });
                    } else {
                      navigation.navigate('AddEditBuilding', {});
                    }
                  }}
                >
                  <Ionicons name="add-circle-outline" size={18} color="#fff" />
                  <Text style={styles.addUnitBtnText}>
                    {totalUnitsCount === 0 ? 'Add New Property' : 'Add New Unit / Flat'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        }
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  buildingBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  buildingBarLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.text },
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
  emptyText: { fontSize: 14, color: COLORS.muted, textAlign: 'center', paddingHorizontal: 16 },
  addUnitBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 12, marginTop: 8,
  },
  addUnitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Inline dropdown styles
  inlineDropdown: {
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10,
    marginTop: 2,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
    maxHeight: 280,
  },
  inlineDropdownItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  inlineDropdownItemActive: { backgroundColor: COLORS.primaryLight },
  inlineDropdownText: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text },
  inlineDropdownSub: { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  inlineSearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  inlineSearchInput: { flex: 1, fontSize: 14, color: COLORS.text },
  inlineEmptyText: { fontSize: 13, color: COLORS.muted, textAlign: 'center', paddingVertical: 16 },
});
