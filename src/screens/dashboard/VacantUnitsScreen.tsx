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
import { VacantUnit } from '../../types';
import { formatCurrency } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList, 'VacantUnits'> };

export default function VacantUnitsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [units, setUnits] = useState<VacantUnit[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('v_vacant_units')
      .select('*')
      .eq('owner_id', user.id)
      .order('building_name');
    setUnits((data ?? []) as VacantUnit[]);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <View style={styles.container}>
      {units.length > 0 && (
        <View style={styles.summaryBanner}>
          <Text style={styles.summaryText}>
            {units.length} vacant unit{units.length > 1 ? 's' : ''}
          </Text>
        </View>
      )}
      <FlatList
        data={units}
        keyExtractor={u => u.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyTitle}>All units occupied!</Text>
            <Text style={styles.emptyText}>You have no vacant units right now.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.unitNum}>{item.unit_number}</Text>
              <Text style={styles.unitType}>{item.unit_type}</Text>
              <Text style={styles.building}>{item.building_name}</Text>
              <Text style={styles.rent}>{formatCurrency(item.rent_per_bed)} / bed · {item.total_beds} bed{item.total_beds > 1 ? 's' : ''}</Text>
            </View>
            <TouchableOpacity
              style={styles.addTenantBtn}
              onPress={() => navigation.navigate('AddTenantStep1')}
            >
              <Ionicons name="person-add-outline" size={16} color={COLORS.primary} />
              <Text style={styles.addTenantText}>Add Tenant</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  summaryBanner: { backgroundColor: COLORS.warningLight, padding: 12, paddingHorizontal: 16 },
  summaryText: { color: COLORS.warning, fontWeight: '600', fontSize: 14 },
  list: { padding: 16, gap: 10 },
  card: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    borderLeftWidth: 3, borderLeftColor: COLORS.warning,
  },
  unitNum: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  unitType: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  building: { fontSize: 13, color: COLORS.text, marginTop: 4 },
  rent: { fontSize: 13, color: COLORS.primary, fontWeight: '600', marginTop: 4 },
  addTenantBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primaryLight, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8,
  },
  addTenantText: { color: COLORS.primary, fontSize: 12, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.muted },
});
