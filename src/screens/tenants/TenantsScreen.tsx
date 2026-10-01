import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, RefreshControl, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import { Tenant } from '../../types';
import { AppStackParamList } from '../../navigation/RootNavigator';
import { formatDate } from '../../utils';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList> };

interface BuildingSummary {
  id: string;
  name: string;
  building_type: 'residential' | 'pg';
}

export default function TenantsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [buildings, setBuildings] = useState<BuildingSummary[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [filtered, setFiltered] = useState<Tenant[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);

    // Load buildings for dropdown
    const { data: bldData } = await supabase
      .from('buildings')
      .select('id, name, building_type')
      .eq('owner_id', user.id)
      .order('name');

    const blds: BuildingSummary[] = (bldData ?? []).map((b: any) => ({
      id: b.id, name: b.name, building_type: b.building_type,
    }));
    setBuildings(blds);

    const effectiveBuildingId = selectedBuildingId || blds[0]?.id || '';
    if (!selectedBuildingId && blds[0]?.id) {
      setSelectedBuildingId(blds[0].id);
    }

    const { data } = await supabase
      .from('tenants')
      .select(`*, units(unit_number, rent_per_bed, building_id, buildings(name))`)
      .eq('owner_id', user.id)
      .eq('is_active', true)
      .order('full_name');

    let enriched = (data ?? []).map((t: any) => ({
      ...t,
      unit_number: t.units?.unit_number,
      building_name: t.units?.buildings?.name,
      building_id: t.units?.building_id,
      rent_per_bed: t.units?.rent_per_bed,
    }));

    if (effectiveBuildingId) enriched = enriched.filter((t: any) => t.building_id === effectiveBuildingId);

    setTenants(enriched);
    setFiltered(enriched);
    setSearch('');
    setLoading(false);
  }, [user, selectedBuildingId]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(true); setRefreshing(false); };

  const handleSearch = (q: string) => {
    setSearch(q);
    const lower = q.toLowerCase();
    setFiltered(tenants.filter(t =>
      t.full_name.toLowerCase().includes(lower) ||
      (t.phone ?? '').includes(q) ||
      (t.unit_number ?? '').toLowerCase().includes(lower) ||
      (t.building_name ?? '').toLowerCase().includes(lower),
    ));
  };

  const selectedBuilding = buildings.find(b => b.id === selectedBuildingId);
  const dropdownLabel = selectedBuilding?.name ?? 'Select Building';

  const bannerSubtitle = selectedBuilding
    ? `${selectedBuilding.name}  ·  ${tenants.length} active tenant${tenants.length !== 1 ? 's' : ''}`
    : `${tenants.length} active tenant${tenants.length !== 1 ? 's' : ''}`;

  return (
    <View style={styles.container}>
      <BlueBannerHeader
        title="All Tenants"
        subtitle={bannerSubtitle}
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      />

      {/* Building Dropdown */}
      <TouchableOpacity style={styles.dropdownBtn} onPress={() => setDropdownOpen(true)} activeOpacity={0.8}>
        <Ionicons name="business-outline" size={16} color={COLORS.primary} />
        <Text style={styles.dropdownLabel} numberOfLines={1}>{dropdownLabel}</Text>
        <Ionicons name="chevron-down" size={16} color={COLORS.muted} />
      </TouchableOpacity>

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
                placeholder="Search tenant, unit..."
                placeholderTextColor={COLORS.muted}
                value={search}
                onChangeText={handleSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => { setSearch(''); setFiltered(tenants); }} style={{ paddingRight: 10 }}>
                  <Ionicons name="close-circle" size={16} color={COLORS.muted} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('AddNewTenant')}>
              <Ionicons name="person-add" size={20} color={COLORS.primary} />
              <Text style={styles.addText}>Add New Tenant</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={loading ? null : (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>👤</Text>
            <Text style={styles.emptyTitle}>No tenants found</Text>
            <Text style={styles.emptyText}>{search ? 'Try a different search.' : 'Add your first tenant.'}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('TenantProfile', { tenantId: item.id })}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.full_name[0].toUpperCase()}</Text>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.name}>{item.full_name}</Text>
              <Text style={styles.meta}>{item.building_name} · {item.unit_number}</Text>
              <Text style={styles.meta}>📞 {item.phone} · Since {formatDate(item.move_in_date)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
          </TouchableOpacity>
        )}
      />

      {/* Building Picker Modal */}
      <Modal visible={dropdownOpen} transparent animationType="fade" onRequestClose={() => setDropdownOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDropdownOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.dropdownSheet}>
            <Text style={styles.dropdownTitle}>Select Building</Text>
            {buildings.map(b => (
              <TouchableOpacity
                key={b.id}
                style={[styles.dropdownItem, selectedBuildingId === b.id && styles.dropdownItemActive]}
                onPress={() => { setSelectedBuildingId(b.id); setDropdownOpen(false); }}
              >
                <Ionicons
                  name={b.building_type === 'pg' ? 'bed-outline' : 'business-outline'}
                  size={18}
                  color={selectedBuildingId === b.id ? COLORS.primary : COLORS.muted}
                />
                <Text style={[styles.dropdownItemText, selectedBuildingId === b.id && { color: COLORS.primary }]}>
                  {b.name}
                </Text>
                {selectedBuildingId === b.id && <Ionicons name="checkmark" size={18} color={COLORS.primary} />}
              </TouchableOpacity>
            ))}
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
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10,
  },
  searchIcon: { paddingLeft: 12 },
  searchInput: { flex: 1, padding: 12, fontSize: 14, color: COLORS.text },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primaryLight, padding: 14, borderRadius: 10, marginBottom: 4,
  },
  addText: { color: COLORS.primary, fontWeight: '700', fontSize: 15 },
  card: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: COLORS.primary },
  cardBody: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.muted },

  // Building picker modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-start', paddingTop: 80, paddingHorizontal: 16,
  },
  dropdownSheet: {
    backgroundColor: COLORS.white, borderRadius: 16, paddingVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, elevation: 12,
  },
  dropdownTitle: {
    fontSize: 13, fontWeight: '700', color: COLORS.muted,
    paddingHorizontal: 18, paddingVertical: 10,
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  dropdownItemActive: { backgroundColor: COLORS.primaryLight },
  dropdownItemText: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.text },
});
