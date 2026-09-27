import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import { formatDate } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList> };

interface OccupiedRow {
  id: string;
  full_name: string;
  phone: string;
  move_in_date: string;
  unit_number: string;
  building_name: string;
  building_type: 'residential' | 'pg';
}

const HEADER_BLUE = '#1D4ED8';

export default function OccupiedTenantsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<OccupiedRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('tenants')
      .select('id, full_name, phone, move_in_date, units(unit_number, buildings(name, building_type))')
      .eq('owner_id', user.id)
      .eq('is_active', true)
      .order('full_name');

    setTenants(
      (data ?? []).map((t: any) => ({
        id: t.id,
        full_name: t.full_name,
        phone: t.phone,
        move_in_date: t.move_in_date,
        unit_number: t.units?.unit_number ?? '—',
        building_name: t.units?.buildings?.name ?? '—',
        building_type: t.units?.buildings?.building_type ?? 'residential',
      }))
    );
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <View style={styles.container}>
      {/* Blue banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Occupied Units</Text>
        <Text style={styles.bannerSub}>
          {tenants.length} active tenant{tenants.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <FlatList
        data={tenants}
        keyExtractor={t => t.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={COLORS.border} />
            <Text style={styles.emptyTitle}>No active tenants</Text>
            <Text style={styles.emptyText}>Add tenants to occupied units.</Text>
          </View>
        }
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
  banner: {
    backgroundColor: HEADER_BLUE,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  bannerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  bannerSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  list: { padding: 16, gap: 10, paddingBottom: 32 },
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
