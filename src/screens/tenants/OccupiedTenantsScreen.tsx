import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput,
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

type Props = NativeStackScreenProps<AppStackParamList, 'OccupiedTenants'>;

interface OccupiedRow {
  id: string;
  full_name: string;
  phone: string;
  move_in_date: string;
  unit_number: string;
  building_name: string;
  building_type: 'residential' | 'pg';
}

export default function OccupiedTenantsScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { buildingId, buildingName } = route.params ?? {};
  const [tenants, setTenants] = useState<OccupiedRow[]>([]);
  const [filtered, setFiltered] = useState<OccupiedRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    let query = supabase
      .from('tenants')
      .select('id, full_name, phone, move_in_date, units(unit_number, building_id, buildings(name, building_type))')
      .eq('owner_id', user.id)
      .eq('is_active', true)
      .order('full_name');

    const { data } = await query;

    let rows = (data ?? []).map((t: any) => ({
      id: t.id,
      full_name: t.full_name,
      phone: t.phone,
      move_in_date: t.move_in_date,
      unit_number: t.units?.unit_number ?? '—',
      building_name: t.units?.buildings?.name ?? '—',
      building_type: t.units?.buildings?.building_type ?? 'residential',
      building_id: t.units?.building_id ?? '',
    }));

    if (buildingId) rows = rows.filter(r => r.building_id === buildingId);
    setTenants(rows);
    setFiltered(rows);
    setLoading(false);
  }, [user, buildingId]);

  useFocusEffect(useCallback(() => {
    if (tenants.length > 0) { load(true); } else { load(); }
  }, [load, tenants.length]));
  const onRefresh = async () => { setRefreshing(true); await load(true); setRefreshing(false); };

  const handleSearch = (q: string) => {
    setSearch(q);
    const lower = q.toLowerCase();
    setFiltered(tenants.filter(t =>
      t.full_name.toLowerCase().includes(lower) ||
      t.building_name.toLowerCase().includes(lower) ||
      t.unit_number.toLowerCase().includes(lower) ||
      (t.phone ?? '').includes(q)
    ));
  };



  const bannerSubtitle = buildingName
    ? `${buildingName}  ·  ${tenants.length} active tenant${tenants.length !== 1 ? 's' : ''}`
    : `${tenants.length} active tenant${tenants.length !== 1 ? 's' : ''}`;

  return (
    <View style={styles.container}>
      <BlueBannerHeader
        title="Record Payment"
        subtitle={bannerSubtitle}
        onBack={() => navigation.goBack()}
      />

      <FlatList
        data={filtered}
        keyExtractor={t => t.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={COLORS.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search tenant, building, unit..."
              placeholderTextColor={COLORS.muted}
              value={search}
              onChangeText={handleSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => { setSearch(''); setFiltered(tenants); }}>
                <Ionicons name="close-circle" size={16} color={COLORS.muted} />
              </TouchableOpacity>
            )}
          </View>
        }
        ListEmptyComponent={loading ? null : (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={COLORS.border} />
            <Text style={styles.emptyTitle}>No active tenants</Text>
            <Text style={styles.emptyText}>Add tenants to occupied units.</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('TenantProfile', { tenantId: item.id })}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.full_name[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.full_name}</Text>
              <Text style={styles.meta}>
                {item.building_type === 'pg' ? '🏨' : '🏠'} {item.building_name} · {item.unit_number}
              </Text>
              <Text style={styles.meta}>📞 {item.phone}</Text>
              <Text style={styles.meta}>Since {formatDate(item.move_in_date)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
          </TouchableOpacity>
        )}
      />
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
    marginHorizontal: 16, marginTop: 12,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text },
  card: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    borderLeftWidth: 3, borderLeftColor: COLORS.success,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: COLORS.primary },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.muted },
});
