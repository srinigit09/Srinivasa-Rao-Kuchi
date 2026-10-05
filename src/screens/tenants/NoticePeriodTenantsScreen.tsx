import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import { formatDate } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';

type Props = NativeStackScreenProps<AppStackParamList, 'NoticePeriodTenants'>;

interface NoticeRow {
  id: string;
  full_name: string;
  phone: string;
  move_in_date: string;
  expected_vacate_date: string;
  unit_number: string;
  building_name: string;
  building_id: string;
}

interface BuildingSummary {
  id: string;
  name: string;
}

export default function NoticePeriodTenantsScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { buildingId: initialBuildingId } = route.params ?? {};

  const [buildings, setBuildings] = useState<BuildingSummary[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(initialBuildingId ?? '');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [tenants, setTenants] = useState<NoticeRow[]>([]);
  const [filtered, setFiltered] = useState<NoticeRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);

    const { data: bldData } = await supabase
      .from('buildings')
      .select('id, name')
      .eq('owner_id', user.id)
      .order('name');

    const blds: BuildingSummary[] = (bldData ?? []).map((b: any) => ({ id: b.id, name: b.name }));
    setBuildings(blds);

    const effectiveBuildingId = selectedBuildingId || blds[0]?.id || '';
    if (!selectedBuildingId && blds[0]?.id) setSelectedBuildingId(blds[0].id);

    const today = new Date().toISOString().split('T')[0];

    let query = supabase
      .from('tenants')
      .select('id, full_name, phone, move_in_date, expected_vacate_date, units(unit_number, building_id, buildings(name))')
      .eq('owner_id', user.id)
      .eq('is_active', true)
      .gte('expected_vacate_date', today)
      .order('expected_vacate_date');

    const { data } = await query;

    let rows = (data ?? []).map((t: any) => ({
      id: t.id,
      full_name: t.full_name,
      phone: t.phone,
      move_in_date: t.move_in_date,
      expected_vacate_date: t.expected_vacate_date,
      unit_number: t.units?.unit_number ?? '—',
      building_name: t.units?.buildings?.name ?? '—',
      building_id: t.units?.building_id ?? '',
    }));

    if (effectiveBuildingId) rows = rows.filter((r: NoticeRow) => r.building_id === effectiveBuildingId);
    setTenants(rows);
    setFiltered(rows);
    setSearch('');
    setLoading(false);
  }, [user, selectedBuildingId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(true); setRefreshing(false); };

  const handleSearch = (q: string) => {
    setSearch(q);
    const lower = q.toLowerCase();
    setFiltered(tenants.filter(t =>
      t.full_name.toLowerCase().includes(lower) ||
      t.unit_number.toLowerCase().includes(lower) ||
      (t.phone ?? '').includes(q)
    ));
  };

  const selectedBuilding = buildings.find(b => b.id === selectedBuildingId);

  return (
    <View style={styles.container}>
      <BlueBannerHeader
        title="Notice Period"
        subtitle={`${tenants.length} tenant${tenants.length !== 1 ? 's' : ''} under notice`}
        onBack={() => navigation.goBack()}
      />

      <TouchableOpacity style={styles.dropdownBtn} onPress={() => setDropdownOpen(true)} activeOpacity={0.8}>
        <Ionicons name="business-outline" size={16} color={COLORS.primary} />
        <Text style={styles.dropdownLabel} numberOfLines={1}>{selectedBuilding?.name ?? 'Select Property'}</Text>
        <Ionicons name="chevron-down" size={16} color={COLORS.muted} />
      </TouchableOpacity>

      <FlatList
        data={filtered}
        keyExtractor={t => t.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={COLORS.muted} />
            <TextInput style={styles.searchInput} placeholder="Search tenant, unit..." placeholderTextColor={COLORS.muted} value={search} onChangeText={handleSearch} />
            {search.length > 0 && <TouchableOpacity onPress={() => { setSearch(''); setFiltered(tenants); }}><Ionicons name="close-circle" size={16} color={COLORS.muted} /></TouchableOpacity>}
          </View>
        }
        ListEmptyComponent={loading ? null : (
          <View style={styles.empty}>
            <Ionicons name="time-outline" size={48} color={COLORS.border} />
            <Text style={styles.emptyTitle}>No notice period tenants</Text>
            <Text style={styles.emptyText}>Tenants with a vacating date set will appear here.</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('TenantProfile', { tenantId: item.id })}>
            <View style={[styles.noticeIcon]}>
              <Ionicons name="time-outline" size={20} color="#B45309" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.full_name}</Text>
              <Text style={styles.meta}>🏠 {item.building_name} · {item.unit_number}</Text>
              <Text style={styles.meta}>📞 {item.phone}</Text>
              <Text style={[styles.meta, { color: '#B45309', fontWeight: '600' }]}>
                Vacating: {formatDate(item.expected_vacate_date)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
          </TouchableOpacity>
        )}
      />

      <Modal visible={dropdownOpen} transparent animationType="fade" onRequestClose={() => setDropdownOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDropdownOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.dropdownSheet}>
            <Text style={styles.dropdownTitle}>Select Property</Text>
            {buildings.map(b => (
              <TouchableOpacity key={b.id} style={[styles.dropdownItem, selectedBuildingId === b.id && styles.dropdownItemActive]}
                onPress={() => { setSelectedBuildingId(b.id); setDropdownOpen(false); }}>
                <Ionicons name="business-outline" size={18} color={selectedBuildingId === b.id ? COLORS.primary : COLORS.muted} />
                <Text style={[styles.dropdownItemText, selectedBuildingId === b.id && { color: COLORS.primary }]}>{b.name}</Text>
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
  dropdownBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingHorizontal: 16, paddingVertical: 12 },
  dropdownLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text },
  list: { padding: 16, gap: 10, paddingBottom: 32 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.white, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text },
  card: { backgroundColor: COLORS.white, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, borderLeftWidth: 3, borderLeftColor: '#F59E0B' },
  noticeIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.muted, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  dropdownSheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 8, paddingBottom: 36 },
  dropdownTitle: { fontSize: 13, fontWeight: '700', color: COLORS.muted, paddingHorizontal: 18, paddingVertical: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  dropdownItemActive: { backgroundColor: COLORS.primaryLight },
  dropdownItemText: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.text },
});
