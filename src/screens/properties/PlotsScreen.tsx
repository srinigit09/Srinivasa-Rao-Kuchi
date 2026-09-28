import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useProperty } from '../../context/PropertyContext';
import { COLORS } from '../../constants';
import { formatCurrency } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';
import {
  Unit, PlotStatus, PLOT_STATUS_LABEL,
  PLOT_STATUS_COLOR, PLOT_STATUS_BG, HAS_CONSTRUCTION_STAGES,
} from '../../types';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList> };

export default function PlotsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { activeProperty } = useProperty();
  const [units, setUnits] = useState<Unit[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user || !activeProperty) return;
    const { data } = await supabase
      .from('units')
      .select('*, buyers(id, full_name, amount_paid, sale_price, is_active)')
      .eq('building_id', activeProperty.id)
      .eq('owner_id', user.id)
      .order('unit_number');
    setUnits((data ?? []) as any);
  }, [user, activeProperty]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const deleteUnit = (id: string) => {
    Alert.alert('Delete Plot/Unit?', 'This will also remove buyer and payment records.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => { await supabase.from('units').delete().eq('id', id); load(); },
      },
    ]);
  };

  const total     = units.length;
  const available = units.filter(u => u.plot_status === 'available' || !u.plot_status).length;
  const sold      = units.filter(u => u.plot_status === 'sold').length;
  const subtitle  = `${total} total · ${available} available · ${sold} sold`;
  const isHousingVilla = activeProperty?.building_type === 'housing_villa';

  return (
    <View style={styles.container}>
      <BlueBannerHeader
        title={activeProperty?.name ?? 'Plots'}
        subtitle={subtitle}
        onBack={() => navigation.goBack()}
      />
      <FlatList
        data={units}
        keyExtractor={u => u.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          activeProperty ? (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => navigation.navigate('AddEditUnit', { buildingId: activeProperty.id })}
            >
              <Ionicons name="add-circle" size={22} color={COLORS.primary} />
              <Text style={styles.addText}>Add Plot / Unit</Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🌳</Text>
            <Text style={styles.emptyTitle}>No plots yet</Text>
            <Text style={styles.emptyText}>Tap "Add Plot / Unit" to get started.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const status = (item.plot_status ?? 'available') as PlotStatus;
          const activeBuyer = (item as any).buyers?.find((b: any) => b.is_active);
          const hasStages = isHousingVilla &&
            HAS_CONSTRUCTION_STAGES.some(t =>
              (item.unit_type ?? '').toLowerCase().includes(t.toLowerCase())
            );

          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                {/* Left: plot number + type + area */}
                <View style={{ flex: 1 }}>
                  <Text style={styles.plotNum}>{item.unit_number}</Text>
                  <Text style={styles.plotType}>
                    {item.custom_type ?? item.unit_type}
                    {item.area_sqft ? `  ·  ${item.area_sqft} sq.ft` : ''}
                    {item.area_acres ? `  ·  ${item.area_acres} acres` : ''}
                    {item.facing ? `  ·  ${item.facing}` : ''}
                  </Text>
                  {(item.sale_price ?? 0) > 0 && (
                    <Text style={styles.price}>{formatCurrency(item.sale_price ?? 0)}</Text>
                  )}
                </View>

                {/* Right: status badge + actions */}
                <View style={styles.cardRight}>
                  <View style={[styles.badge, { backgroundColor: PLOT_STATUS_BG[status] }]}>
                    <Text style={[styles.badgeText, { color: PLOT_STATUS_COLOR[status] }]}>
                      {PLOT_STATUS_LABEL[status]}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('AddEditUnit', { buildingId: activeProperty!.id, unitId: item.id })}
                    style={styles.iconBtn}
                  >
                    <Ionicons name="pencil-outline" size={16} color={COLORS.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteUnit(item.id)} style={styles.iconBtn}>
                    <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Buyer info row */}
              {activeBuyer && (
                <TouchableOpacity
                  style={styles.buyerRow}
                  onPress={() => navigation.navigate('BuyerProfile', { buyerId: activeBuyer.id })}
                >
                  <Ionicons name="person" size={13} color={COLORS.primary} />
                  <Text style={styles.buyerName}>{activeBuyer.full_name}</Text>
                  <Text style={styles.buyerAmt}>
                    Paid: {formatCurrency(activeBuyer.amount_paid)} / {formatCurrency(activeBuyer.sale_price)}
                  </Text>
                  <Ionicons name="chevron-forward" size={13} color={COLORS.muted} />
                </TouchableOpacity>
              )}

              {/* No buyer — add buyer shortcut */}
              {!activeBuyer && status !== 'available' && (
                <TouchableOpacity
                  style={styles.addBuyerRow}
                  onPress={() => navigation.navigate('AddBuyer', { unitId: item.id })}
                >
                  <Ionicons name="person-add-outline" size={13} color={COLORS.success} />
                  <Text style={styles.addBuyerText}>Add Buyer</Text>
                </TouchableOpacity>
              )}

              {/* Construction stages shortcut */}
              {hasStages && (
                <TouchableOpacity
                  style={styles.stagesRow}
                  onPress={() => navigation.navigate('ConstructionStages', { unitId: item.id, unitNumber: item.unit_number })}
                >
                  <Ionicons name="construct-outline" size={13} color="#D97706" />
                  <Text style={styles.stagesText}>View Construction Stages</Text>
                  <Ionicons name="chevron-forward" size={13} color={COLORS.muted} />
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: 14, gap: 10, paddingBottom: 32 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.primaryLight, padding: 14,
    borderRadius: 12, marginBottom: 4,
  },
  addText: { color: COLORS.primary, fontWeight: '700', fontSize: 15 },
  card: {
    backgroundColor: COLORS.white, borderRadius: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    overflow: 'hidden',
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', padding: 14 },
  plotNum: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  plotType: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  price: { fontSize: 14, fontWeight: '700', color: COLORS.primary, marginTop: 4 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  iconBtn: { padding: 4 },
  buyerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 14, paddingVertical: 9,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  buyerName: { flex: 1, fontSize: 12, fontWeight: '700', color: COLORS.primary },
  buyerAmt: { fontSize: 11, color: COLORS.muted },
  addBuyerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  addBuyerText: { fontSize: 12, fontWeight: '600', color: COLORS.success },
  stagesRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9,
    backgroundColor: '#FFFBEB',
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  stagesText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#D97706' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.muted },
});
