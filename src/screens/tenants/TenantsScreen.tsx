import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, RefreshControl,
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

type Props = { navigation: NativeStackNavigationProp<AppStackParamList> };

export default function TenantsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [filtered, setFiltered] = useState<Tenant[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('tenants')
      .select(`*, units(unit_number, rent_per_bed, buildings(name))`)
      .eq('owner_id', user.id)
      .eq('is_active', true)
      .order('full_name');
    const enriched = (data ?? []).map((t: any) => ({
      ...t,
      unit_number: t.units?.unit_number,
      building_name: t.units?.buildings?.name,
      rent_per_bed: t.units?.rent_per_bed,
    }));
    setTenants(enriched);
    setFiltered(enriched);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

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

  return (
    <View style={styles.container}>
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
                placeholder="Search tenant, building, unit..."
                placeholderTextColor={COLORS.muted}
                value={search}
                onChangeText={handleSearch}
              />
            </View>
            <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('AddTenantStep1')}>
              <Ionicons name="person-add" size={20} color={COLORS.primary} />
              <Text style={styles.addText}>Add New Tenant</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>👤</Text>
            <Text style={styles.emptyTitle}>No tenants found</Text>
            <Text style={styles.emptyText}>{search ? 'Try a different search.' : 'Add your first tenant.'}</Text>
          </View>
        }
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: 16, gap: 10 },
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
  addText: { color: COLORS.primary, fontWeight: '600', fontSize: 15 },
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
});
