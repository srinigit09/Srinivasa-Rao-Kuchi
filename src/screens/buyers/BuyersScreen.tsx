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
import { formatCurrency, formatDate } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';
import { Buyer, PlotStatus, PLOT_STATUS_LABEL, PLOT_STATUS_COLOR, PLOT_STATUS_BG } from '../../types';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList> };

export default function BuyersScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { activeProperty } = useProperty();
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    let query = supabase
      .from('buyers')
      .select(`
        *,
        units(unit_number, unit_type, custom_type, plot_status, sale_price,
          buildings(id, name, building_type))
      `)
      .eq('owner_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (activeProperty) {
      // filter to units in active property
      query = query.eq('units.building_id', activeProperty.id);
    }

    const { data } = await query;
    const mapped = ((data ?? []) as any[])
      .filter((b: any) => b.units) // remove if unit was filtered out
      .map((b: any) => ({
        ...b,
        unit_number: b.units?.unit_number,
        unit_type: b.units?.custom_type ?? b.units?.unit_type,
        plot_status: b.units?.plot_status,
        building_name: b.units?.buildings?.name,
        building_id: b.units?.buildings?.id,
        building_type: b.units?.buildings?.building_type,
        balance: (b.units?.sale_price ?? b.sale_price ?? 0) - (b.amount_paid ?? 0),
      }));
    setBuyers(mapped);
  }, [user, activeProperty]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const totalCollected = buyers.reduce((s, b) => s + (b.amount_paid ?? 0), 0);
  const totalBalance   = buyers.reduce((s, b) => s + (b.balance ?? 0), 0);
  const subtitle = `${buyers.length} active buyers · ₹${(totalCollected / 100000).toFixed(1)}L collected`;

  return (
    <View style={styles.container}>
      <BlueBannerHeader
        title="Buyers"
        subtitle={subtitle}
        onBack={() => navigation.goBack()}
      />

      {/* Summary strip */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryChip}>
          <Text style={styles.summaryVal}>{formatCurrency(totalCollected)}</Text>
          <Text style={styles.summaryLbl}>Collected</Text>
        </View>
        <View style={[styles.summaryChip, { backgroundColor: '#FEF3C7' }]}>
          <Text style={[styles.summaryVal, { color: '#D97706' }]}>{formatCurrency(totalBalance)}</Text>
          <Text style={styles.summaryLbl}>Balance</Text>
        </View>
        <View style={[styles.summaryChip, { backgroundColor: '#DCFCE7' }]}>
          <Text style={[styles.summaryVal, { color: COLORS.success }]}>{buyers.length}</Text>
          <Text style={styles.summaryLbl}>Buyers</Text>
        </View>
      </View>

      <FlatList
        data={buyers}
        keyExtractor={b => b.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🧑‍💼</Text>
            <Text style={styles.emptyTitle}>No buyers yet</Text>
            <Text style={styles.emptyText}>
              Add buyers from the Plots screen after changing a plot's status.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const status = (item.plot_status ?? 'available') as PlotStatus;
          const paidPct = item.sale_price
            ? Math.min(100, Math.round(((item.amount_paid ?? 0) / item.sale_price) * 100))
            : 0;

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('BuyerProfile', { buyerId: item.id })}
              activeOpacity={0.8}
            >
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.buyerName}>{item.full_name}</Text>
                  <Text style={styles.unitLine}>
                    Unit {item.unit_number}  ·  {item.unit_type}
                    {item.building_name ? `  ·  ${item.building_name}` : ''}
                  </Text>
                  <Text style={styles.dateLine}>Booked {formatDate(item.booking_date)}</Text>
                </View>
                <View style={styles.cardRight}>
                  {status !== 'available' && (
                    <View style={[styles.badge, { backgroundColor: PLOT_STATUS_BG[status] }]}>
                      <Text style={[styles.badgeText, { color: PLOT_STATUS_COLOR[status] }]}>
                        {PLOT_STATUS_LABEL[status]}
                      </Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
                </View>
              </View>

              {/* Payment progress bar */}
              <View style={styles.progSection}>
                <View style={styles.progHeader}>
                  <Text style={styles.progLabel}>Payment Progress</Text>
                  <Text style={styles.progPct}>{paidPct}%</Text>
                </View>
                <View style={styles.progTrack}>
                  <View style={[styles.progFill, { width: `${paidPct}%` }]} />
                </View>
                <View style={styles.amtRow}>
                  <Text style={styles.amtPaid}>Paid: {formatCurrency(item.amount_paid ?? 0)}</Text>
                  <Text style={styles.amtBal}>Balance: {formatCurrency(item.balance ?? 0)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: 14, gap: 10, paddingBottom: 40 },

  summaryRow: {
    flexDirection: 'row', gap: 10, padding: 14, paddingBottom: 6,
  },
  summaryChip: {
    flex: 1, backgroundColor: COLORS.primaryLight,
    borderRadius: 10, padding: 10, alignItems: 'center',
  },
  summaryVal: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  summaryLbl: { fontSize: 10, color: COLORS.muted, marginTop: 2 },

  card: {
    backgroundColor: COLORS.white, borderRadius: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    overflow: 'hidden',
  },
  cardTop: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 14, paddingBottom: 10,
  },
  buyerName: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  unitLine: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  dateLine: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  cardRight: { alignItems: 'flex-end', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  progSection: {
    backgroundColor: COLORS.bg, paddingHorizontal: 14, paddingBottom: 12, paddingTop: 6,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  progHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  progLabel: { fontSize: 11, color: COLORS.muted, fontWeight: '600' },
  progPct: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  progTrack: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: 'hidden' },
  progFill: { height: 6, backgroundColor: COLORS.primary, borderRadius: 3 },
  amtRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  amtPaid: { fontSize: 11, fontWeight: '600', color: COLORS.success },
  amtBal: { fontSize: 11, fontWeight: '600', color: '#D97706' },

  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 13, color: COLORS.muted, textAlign: 'center', paddingHorizontal: 30 },
});
