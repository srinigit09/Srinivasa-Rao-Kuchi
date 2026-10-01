import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, PROPERTY_TYPES } from '../../constants';
import { Building, BuildingType } from '../../types';
import { AppStackParamList } from '../../navigation/RootNavigator';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList> };

const getPropertyMeta = (type: BuildingType) => {
  return PROPERTY_TYPES.find(p => p.id === type) ?? {
    id: type,
    label: type,
    icon: 'business',
    badge: '🏢 Property',
  };
};

export default function BuildingsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('buildings')
      .select(`id, name, address, building_type, society_name, monthly_maintenance_charge, created_at, units(id, is_vacant)`)
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
    Alert.alert('Delete Property', 'This will also delete all units and occupant data. Are you sure?', [
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
        title="Properties & Societies"
        subtitle={`${buildings.length} propert${buildings.length !== 1 ? 'ies' : 'y'}  ·  ${totalUnits} units  ·  ${totalVacant} vacant`}
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
            <Text style={styles.addText}>Add New Property / Society</Text>
          </TouchableOpacity>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🏡</Text>
            <Text style={styles.emptyTitle}>No properties added yet</Text>
            <Text style={styles.emptyText}>Add Houses, Multi-story Flats, PG/Hostels, Standalone Apartments or Gated Communities.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const meta = getPropertyMeta(item.building_type);
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('BuildingDetail', { buildingId: item.id })}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardLeft}>
                  <View style={styles.titleRow}>
                    <Text style={styles.cardName}>{item.name}</Text>
                    <Tag label={meta.badge} color={COLORS.primary} />
                  </View>
                  {item.society_name ? (
                    <Text style={styles.societyName}>🏛️ {item.society_name}</Text>
                  ) : null}
                  {item.address ? <Text style={styles.cardAddress}>{item.address}</Text> : null}

                  <View style={styles.tags}>
                    <Tag label={`${item.total_units ?? 0} units`} />
                    {(item.total_units ?? 0) === 0 ? (
                      <Tag label="No Units Added" color={COLORS.muted} />
                    ) : (item.vacant_units ?? 0) > 0 ? (
                      <Tag label={`${item.vacant_units} vacant`} color={COLORS.warning} />
                    ) : (
                      <Tag label="Fully Occupied" color={COLORS.success} />
                    )}
                    {item.monthly_maintenance_charge && item.monthly_maintenance_charge > 0 ? (
                      <Tag label={`₹${item.monthly_maintenance_charge}/mo Maint`} color={COLORS.accent} />
                    ) : null}
                  </View>
                </View>

                <View style={styles.cardRight}>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('AddEditBuilding', { buildingId: item.id })}
                    style={styles.iconBtn}
                  >
                    <Ionicons name="pencil-outline" size={18} color={COLORS.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteBuilding(item.id)} style={styles.iconBtn}>
                    <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const Tag = ({ label, color = COLORS.primary }: { label: string; color?: string }) => (
  <View style={[styles.tag, { backgroundColor: color + '15', borderColor: color + '30', borderWidth: 0.5 }]}>
    <Text style={[styles.tagText, { color }]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: 16, paddingBottom: 32 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    marginBottom: 16,
    gap: 8,
  },
  addText: { fontSize: 15, fontWeight: '600', color: COLORS.primary },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  cardLeft: { flex: 1, marginRight: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  cardName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  societyName: { fontSize: 13, fontWeight: '500', color: COLORS.secondary, marginBottom: 4 },
  cardAddress: { fontSize: 12, color: COLORS.muted, marginBottom: 8 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 11, fontWeight: '600' },
  cardRight: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  iconBtn: { padding: 8, borderRadius: 8, backgroundColor: COLORS.surface },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 20 },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  emptyText: { fontSize: 13, color: COLORS.muted, textAlign: 'center', lineHeight: 18 },
});
