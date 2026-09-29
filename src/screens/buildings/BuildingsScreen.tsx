import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import { Building } from '../../types';
import { AppStackParamList } from '../../navigation/RootNavigator';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList> };

export default function BuildingsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('buildings')
      .select(`id, name, address, building_type, created_at, units(id, is_vacant)`)
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true });

    const enriched = (data ?? []).map((b: any) => ({
      ...b,
      total_units: b.units?.length ?? 0,
      vacant_units: b.units?.filter((u: any) => u.is_vacant).length ?? 0,
    }));
    setBuildings(enriched);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const deleteBuilding = async (id: string) => {
    Alert.alert('Delete Building', 'This will also delete all units and tenants. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('buildings').delete().eq('id', id);
          load();
        },
      },
    ]);
  };

  const totalUnits  = buildings.reduce((s, b) => s + (b.total_units  ?? 0), 0);
  const totalVacant = buildings.reduce((s, b) => s + (b.vacant_units ?? 0), 0);

  return (
    <View style={styles.container}>
      <BlueBannerHeader
        title="All Buildings"
        subtitle={`${buildings.length} building${buildings.length !== 1 ? 's' : ''}  ·  ${totalUnits} units  ·  ${totalVacant} vacant`}
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      />

      <FlatList
        data={buildings}
        keyExtractor={b => b.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate('AddEditBuilding', {})}
          >
            <Ionicons name="add-circle" size={22} color={COLORS.primary} />
            <Text style={styles.addText}>Add new Building</Text>
          </TouchableOpacity>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🏢</Text>
            <Text style={styles.emptyTitle}>No buildings yet</Text>
            <Text style={styles.emptyText}>Tap "Add new Building" to get started.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('BuildingDetail', { buildingId: item.id })}
          >
            <View style={styles.cardLeft}>
              <Text style={styles.cardName}>{item.name}</Text>
              {item.address ? <Text style={styles.cardAddress}>{item.address}</Text> : null}
              <View style={styles.tags}>
                <Tag label={item.building_type === 'residential' ? '🏠 Residential' : '🏨 PG/Hostel'} />
                <Tag label={`${item.total_units ?? 0} units`} />
                {(item.vacant_units ?? 0) > 0 && (
                  <Tag label={`${item.vacant_units} vacant`} color={COLORS.warning} />
                )}
              </View>
            </View>
            <View style={styles.cardRight}>
              <TouchableOpacity onPress={() => navigation.navigate('AddEditBuilding', { buildingId: item.id })} style={styles.iconBtn}>
                <Ionicons name="pencil-outline" size={18} color={COLORS.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteBuilding(item.id)} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const Tag = ({ label, color = COLORS.primary }: { label: string; color?: string }) => (
  <View style={[styles.tag, { backgroundColor: color + '20' }]}>
    <Text style={[styles.tagText, { color }]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: 16, gap: 10, paddingBottom: 32 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.primaryLight, padding: 15, borderRadius: 12, marginBottom: 6,
  },
  addText: { color: COLORS.primary, fontWeight: '700', fontSize: 15 },
  card: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 16,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardLeft: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  cardAddress: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tagText: { fontSize: 12, fontWeight: '600' },
  cardRight: { gap: 8 },
  iconBtn: { padding: 6 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.muted },
});
