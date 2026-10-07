import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useSelectedBuilding } from '../../context/SelectedBuildingContext';
import { COLORS, PROPERTY_TYPES } from '../../constants';
import { Tenant, BuildingType } from '../../types';
import { AppStackParamList } from '../../navigation/RootNavigator';
import { formatDate } from '../../utils';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList>;
  route: RouteProp<AppStackParamList, 'Tenants'>;
};

interface BuildingSummary {
  id: string;
  name: string;
  building_type: BuildingType;
}

export default function TenantsScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { selectedBuildingId: contextBuildingId } = useSelectedBuilding();

  const [buildings, setBuildings] = useState<BuildingSummary[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(contextBuildingId ?? '');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  // Track the last preselectedBuildingId we applied — only re-apply when it changes
  const appliedPreselectedRef = useRef<string>('');
  const [filterType, setFilterType] = useState<'ALL' | 'tenant' | 'owner_occupant' | 'guest'>('ALL');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [filtered, setFiltered] = useState<Tenant[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false, forceBuildingId?: string) => {
    if (!user) return;
    if (!silent) setLoading(true);

    // Load buildings for filter dropdown
    const { data: bldData } = await supabase
      .from('buildings')
      .select('id, name, building_type')
      .eq('owner_id', user.id)
      .order('name');

    const blds: BuildingSummary[] = (bldData ?? []).map((b: any) => ({
      id: b.id, name: b.name, building_type: b.building_type,
    }));
    setBuildings(blds);

    // Determine which building to show:
    // 1. forceBuildingId (from route params when screen is focused)
    // 2. existing selectedBuildingId if still valid
    // 3. first building
    let activeBuildingId = forceBuildingId ?? '';
    if (!activeBuildingId) {
      activeBuildingId = selectedBuildingId && blds.find(b => b.id === selectedBuildingId)
        ? selectedBuildingId
        : (blds[0]?.id ?? '');
    }

    if (activeBuildingId !== selectedBuildingId) {
      setSelectedBuildingId(activeBuildingId);
    }

    const { data } = await supabase
      .from('tenants')
      .select(`*, units(unit_number, rent_per_bed, building_id, buildings(name, building_type))`)
      .eq('owner_id', user.id)
      .eq('is_active', true)
      .order('full_name');

    let enriched = (data ?? []).map((t: any) => ({
      ...t,
      unit_number: t.units?.unit_number ?? '—',
      building_name: t.units?.buildings?.name ?? '—',
      building_id: t.units?.building_id,
      building_type: t.units?.buildings?.building_type,
      rent_per_bed: t.units?.rent_per_bed,
    }));

    if (activeBuildingId) {
      enriched = enriched.filter((t: any) => t.building_id === activeBuildingId);
    }

    setTenants(enriched);
    applyFilters(enriched, search, filterType);
    setLoading(false);
  }, [user, selectedBuildingId]);

  const applyFilters = (list: Tenant[], q: string, fType: 'ALL' | 'tenant' | 'owner_occupant' | 'guest') => {
    let result = list;
    if (fType !== 'ALL') {
      result = result.filter(t => (t.resident_type ?? 'tenant') === fType);
    }
    if (q.trim()) {
      const lower = q.toLowerCase();
      result = result.filter(t =>
        t.full_name.toLowerCase().includes(lower) ||
        (t.phone ?? '').includes(q) ||
        (t.unit_number ?? '').toLowerCase().includes(lower) ||
        (t.building_name ?? '').toLowerCase().includes(lower)
      );
    }
    setFiltered(result);
  };

  // Apply context building only on the very first focus (unless a fresh preselected
  // building is passed from Dashboard). After first apply, the user's own selection
  // in this screen takes precedence — Dashboard refreshes must not override it.
  const appliedContextRef = React.useRef(false);
  useFocusEffect(useCallback(() => {
    const preselected = (route.params as any)?.preselectedBuildingId;
    if (preselected && appliedPreselectedRef.current !== preselected) {
      // Fresh navigation from Dashboard with a specific building
      appliedPreselectedRef.current = preselected;
      load(false, preselected);
    } else if (!appliedContextRef.current && contextBuildingId && contextBuildingId !== selectedBuildingId) {
      // First-time sync with Dashboard context
      appliedContextRef.current = true;
      setSelectedBuildingId(contextBuildingId);
      load(false, contextBuildingId);
    } else {
      load();
    }
    return () => setDropdownOpen(false);
  }, [load, route.params]));

  const onRefresh = async () => { setRefreshing(true); await load(true); setRefreshing(false); };

  const handleSearch = (q: string) => {
    setSearch(q);
    applyFilters(tenants, q, filterType);
  };

  const handleTypeFilter = (type: 'ALL' | 'tenant' | 'owner_occupant' | 'guest') => {
    setFilterType(type);
    applyFilters(tenants, search, type);
  };

  const handleBuildingSelect = (id: string) => {
    setSelectedBuildingId(id);
    setDropdownOpen(false);
    // Reload for newly selected building
    load(false, id);
  };

  const selectedBuilding = buildings.find(b => b.id === selectedBuildingId);
  const dropdownLabel = selectedBuilding?.name ?? 'Select Property / Community';

  const bannerSubtitle = `${filtered.length} active resident${filtered.length !== 1 ? 's' : ''}`;

  return (
    <View style={styles.container}>
      <BlueBannerHeader
        title="Residents & Occupants"
        subtitle={bannerSubtitle}
        onBack={() => navigation.navigate('Tabs' as any)}
      />

      {/* Property selector — single box, expands in-place */}
      <View style={styles.dropdownBox}>
        <TouchableOpacity style={styles.dropdownTriggerRow} onPress={() => setDropdownOpen(v => !v)} activeOpacity={0.8}>
          <Ionicons name="business" size={16} color={COLORS.primary} />
          <Text style={styles.dropdownLabel} numberOfLines={1}>{dropdownLabel}</Text>
          <Ionicons name={dropdownOpen ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.muted} />
        </TouchableOpacity>
        {dropdownOpen && (
          <View style={styles.dropdownList}>
            {buildings.map(b => (
              <TouchableOpacity
                key={b.id}
                style={[styles.dropdownListItem, selectedBuildingId === b.id && styles.dropdownListItemActive]}
                onPress={() => handleBuildingSelect(b.id)}
              >
                <Ionicons name="business-outline" size={16} color={selectedBuildingId === b.id ? COLORS.primary : COLORS.muted} />
                <Text style={[styles.dropdownListItemText, selectedBuildingId === b.id && styles.dropdownListItemTextActive]}>
                  {b.name}
                </Text>
                {selectedBuildingId === b.id && <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Resident Type Segmented Filter (All, Tenants, Owners, Guests) */}
      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[styles.segmentBtn, filterType === 'ALL' && styles.segmentBtnActive]}
          onPress={() => handleTypeFilter('ALL')}
        >
          <Text style={[styles.segmentText, filterType === 'ALL' && styles.segmentTextActive]}>
            All ({tenants.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, filterType === 'tenant' && styles.segmentBtnActive]}
          onPress={() => handleTypeFilter('tenant')}
        >
          <Text style={[styles.segmentText, filterType === 'tenant' && styles.segmentTextActive]}>
            👤 Tenants
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, filterType === 'owner_occupant' && styles.segmentBtnActive]}
          onPress={() => handleTypeFilter('owner_occupant')}
        >
          <Text style={[styles.segmentText, filterType === 'owner_occupant' && styles.segmentTextActive]}>
            👑 Owners
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, filterType === 'guest' && styles.segmentBtnActive]}
          onPress={() => handleTypeFilter('guest')}
        >
          <Text style={[styles.segmentText, filterType === 'guest' && styles.segmentTextActive]}>
            🏖️ Guests
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={t => t.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={18} color={COLORS.muted} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search resident name, unit, phone..."
                placeholderTextColor={COLORS.muted}
                value={search}
                onChangeText={handleSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => handleSearch('')} style={{ paddingRight: 10 }}>
                  <Ionicons name="close-circle" size={16} color={COLORS.muted} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => navigation.navigate('AddNewTenant', { preselectedBuildingId: selectedBuildingId })}
            >
              <Ionicons name="person-add" size={18} color={COLORS.primary} />
              <Text style={styles.addText}>Add New Resident / Tenant</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={loading ? null : (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>👤</Text>
            <Text style={styles.emptyTitle}>No residents found</Text>
            <Text style={styles.emptyText}>{search ? 'Try a different search query.' : 'Add your first tenant or resident.'}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const isOwner = item.resident_type === 'owner_occupant';
          const isGuest = item.resident_type === 'guest';
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('TenantProfile', { tenantId: item.id })}
              activeOpacity={0.7}
            >
              <View style={[styles.avatar, isOwner ? styles.avatarOwner : isGuest ? styles.avatarGuest : null]}>
                <Text style={[styles.avatarText, isOwner ? styles.avatarTextOwner : isGuest ? styles.avatarTextGuest : null]}>
                  {item.full_name ? item.full_name[0].toUpperCase() : 'U'}
                </Text>
              </View>
              <View style={styles.cardBody}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{item.full_name}</Text>
                  <View style={[styles.typeBadge, isOwner ? styles.ownerBadge : isGuest ? styles.guestBadge : styles.tenantBadge]}>
                    <Text style={isOwner ? styles.ownerBadgeText : isGuest ? styles.guestBadgeText : styles.tenantBadgeText}>
                      {isOwner ? '👑 Owner' : isGuest ? '🏖️ Guest' : 'Tenant'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.meta}>📍 {item.building_name} · Unit {item.unit_number}</Text>
                <Text style={styles.meta}>📞 {item.phone} · Active since {formatDate(item.move_in_date)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
            </TouchableOpacity>
          );
        }}
      />

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
  dropdownLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.text },
  segmentRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  segmentBtnActive: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
  },
  segmentTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  list: { padding: 16, gap: 10, paddingBottom: 32 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10,
  },
  searchIcon: { paddingLeft: 12 },
  searchInput: { flex: 1, padding: 12, fontSize: 14, color: COLORS.text },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.white, padding: 14, borderRadius: 10, marginBottom: 6,
    borderWidth: 1.5, borderColor: COLORS.primary, borderStyle: 'dashed',
  },
  addText: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },
  card: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  avatarOwner: {
    backgroundColor: '#FEF3C7',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: COLORS.primary },
  avatarTextOwner: { color: '#B45309' },
  cardBody: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tenantBadge: { backgroundColor: COLORS.primaryLight },
  tenantBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.primary },
  ownerBadge: { backgroundColor: '#FEF3C7' },
  ownerBadgeText: { fontSize: 10, fontWeight: '700', color: '#B45309' },
  avatarGuest: { backgroundColor: '#E0E7FF' },
  avatarTextGuest: { color: '#4338CA' },
  guestBadge: { backgroundColor: '#E0E7FF' },
  guestBadgeText: { fontSize: 10, fontWeight: '700', color: '#4338CA' },
  meta: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 13, color: COLORS.muted },
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
  dropdownListItemText: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text },
  dropdownListItemTextActive: { color: COLORS.primary },
});
