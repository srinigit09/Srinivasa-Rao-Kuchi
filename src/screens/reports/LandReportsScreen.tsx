import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useProperty } from '../../context/PropertyContext';
import { COLORS } from '../../constants';
import { formatCurrency, formatDate } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';
import {
  PLOT_STATUS_LABEL, PLOT_STATUS_COLOR, PLOT_STATUS_BG, PlotStatus,
} from '../../types';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList> };

const HEADER_BLUE = '#1D4ED8';

interface ProjectStat {
  id: string;
  name: string;
  building_type: string;
  total: number;
  available: number;
  booked: number;
  under_construction: number;
  ready: number;
  sold: number;
  totalSaleValue: number;
  collectedValue: number;
  balanceValue: number;
}

export default function LandReportsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { activeProperty } = useProperty();
  const insets = useSafeAreaInsets();
  const [projects, setProjects] = useState<ProjectStat[]>([]);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;

    let bldQuery = supabase
      .from('buildings')
      .select('id, name, building_type')
      .eq('owner_id', user.id)
      .in('building_type', ['open_plots', 'housing_villa', 'farm_land']);

    if (activeProperty) {
      bldQuery = bldQuery.eq('id', activeProperty.id);
    }

    const { data: blds } = await bldQuery;

    const stats: ProjectStat[] = [];
    for (const b of (blds ?? [])) {
      const { data: units } = await supabase
        .from('units')
        .select('id, plot_status, sale_price, buyers(amount_paid, is_active)')
        .eq('building_id', b.id)
        .eq('owner_id', user.id);

      const u = (units ?? []) as any[];
      const stat: ProjectStat = {
        id: b.id, name: b.name, building_type: b.building_type,
        total: u.length,
        available: u.filter(x => !x.plot_status || x.plot_status === 'available').length,
        booked: u.filter(x => x.plot_status === 'booked').length,
        under_construction: u.filter(x => x.plot_status === 'under_construction').length,
        ready: u.filter(x => x.plot_status === 'ready').length,
        sold: u.filter(x => x.plot_status === 'sold').length,
        totalSaleValue: u.reduce((s: number, x: any) => s + (x.sale_price ?? 0), 0),
        collectedValue: u.reduce((s: number, x: any) => {
          const activeBuyer = (x.buyers ?? []).find((b: any) => b.is_active);
          return s + (activeBuyer?.amount_paid ?? 0);
        }, 0),
        balanceValue: 0,
      };
      stat.balanceValue = stat.totalSaleValue - stat.collectedValue;
      stats.push(stat);
    }
    setProjects(stats);

    // Recent sale payments
    let payQ = supabase
      .from('sale_payments')
      .select('*, buyers(full_name, unit_id, units(unit_number, buildings(name)))')
      .eq('owner_id', user.id)
      .order('payment_date', { ascending: false })
      .limit(20);

    const { data: pays } = await payQ;
    setRecentSales(
      (pays ?? []).map((p: any) => ({
        ...p,
        buyer_name: p.buyers?.full_name,
        unit_number: p.buyers?.units?.unit_number,
        building_name: p.buyers?.units?.buildings?.name,
      }))
    );
  }, [user, activeProperty]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const totalSold      = projects.reduce((s, p) => s + p.sold, 0);
  const totalCollected = projects.reduce((s, p) => s + p.collectedValue, 0);
  const totalBalance   = projects.reduce((s, p) => s + p.balanceValue, 0);
  const totalSaleVal   = projects.reduce((s, p) => s + p.totalSaleValue, 0);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Land Reports</Text>
        </View>
        <Text style={styles.headerSub}>Real Estate Sales Overview</Text>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.scroll}
      >
        {/* Summary strip */}
        <View style={styles.summaryGrid}>
          <View style={[styles.summaryBox, { backgroundColor: COLORS.primaryLight }]}>
            <Text style={[styles.summaryVal, { color: COLORS.primary }]}>{totalSold}</Text>
            <Text style={styles.summaryLbl}>Units Sold</Text>
          </View>
          <View style={[styles.summaryBox, { backgroundColor: '#DCFCE7' }]}>
            <Text style={[styles.summaryVal, { color: COLORS.success }]}>
              {formatCurrency(totalCollected)}
            </Text>
            <Text style={styles.summaryLbl}>Collected</Text>
          </View>
          <View style={[styles.summaryBox, { backgroundColor: '#FEF3C7' }]}>
            <Text style={[styles.summaryVal, { color: '#D97706' }]}>
              {formatCurrency(totalBalance)}
            </Text>
            <Text style={styles.summaryLbl}>Balance</Text>
          </View>
        </View>

        {/* Per-project breakdowns */}
        {projects.map(proj => {
          const soldPct = proj.total ? Math.round((proj.sold / proj.total) * 100) : 0;
          return (
            <View key={proj.id} style={styles.card}>
              <Text style={styles.projName}>{proj.name}</Text>

              {/* Status chips */}
              <View style={styles.statusRow}>
                {([
                  ['available', proj.available],
                  ['booked', proj.booked],
                  ['under_construction', proj.under_construction],
                  ['ready', proj.ready],
                  ['sold', proj.sold],
                ] as [PlotStatus, number][]).filter(([, cnt]) => cnt > 0).map(([st, cnt]) => (
                  <View key={st} style={[styles.statusChip, { backgroundColor: PLOT_STATUS_BG[st] }]}>
                    <Text style={[styles.statusChipText, { color: PLOT_STATUS_COLOR[st] }]}>
                      {PLOT_STATUS_LABEL[st]}: {cnt}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Progress bar */}
              <View style={styles.progRow}>
                <View style={styles.progTrack}>
                  <View style={[styles.progFill, { width: `${soldPct}%` }]} />
                </View>
                <Text style={styles.progPct}>{soldPct}% sold</Text>
              </View>

              {/* Financials */}
              <View style={styles.finRow}>
                <View style={styles.finBox}>
                  <Text style={styles.finVal}>{formatCurrency(proj.totalSaleValue)}</Text>
                  <Text style={styles.finLbl}>Total Value</Text>
                </View>
                <View style={[styles.finBox, { backgroundColor: '#DCFCE7' }]}>
                  <Text style={[styles.finVal, { color: COLORS.success }]}>
                    {formatCurrency(proj.collectedValue)}
                  </Text>
                  <Text style={styles.finLbl}>Collected</Text>
                </View>
                <View style={[styles.finBox, { backgroundColor: '#FEF3C7' }]}>
                  <Text style={[styles.finVal, { color: '#D97706' }]}>
                    {formatCurrency(proj.balanceValue)}
                  </Text>
                  <Text style={styles.finLbl}>Balance</Text>
                </View>
              </View>
            </View>
          );
        })}

        {projects.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyTitle}>No RE properties found</Text>
            <Text style={styles.emptyText}>Add Open Plots, Housing/Villa, or Farm Land properties to see reports here.</Text>
          </View>
        )}

        {/* Recent sale payments */}
        {recentSales.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Recent Payments ({recentSales.length})</Text>
            {recentSales.map((p, i) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.payRow, i > 0 && styles.topBorder]}
                onPress={() => navigation.navigate('SaleReceipt', { paymentId: p.id })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.payName}>{p.buyer_name}</Text>
                  <Text style={styles.payMeta}>
                    Unit {p.unit_number}  ·  {p.building_name}  ·  {formatDate(p.payment_date)}
                  </Text>
                </View>
                <Text style={styles.payAmt}>{formatCurrency(p.amount)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { backgroundColor: HEADER_BLUE, paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4 },

  scroll: { padding: 14, gap: 12, paddingBottom: 48 },

  summaryGrid: { flexDirection: 'row', gap: 8 },
  summaryBox: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  summaryVal: { fontSize: 13, fontWeight: '800' },
  summaryLbl: { fontSize: 10, color: COLORS.muted, marginTop: 2 },

  card: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    gap: 10,
  },
  projName: { fontSize: 16, fontWeight: '800', color: COLORS.text },

  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusChipText: { fontSize: 11, fontWeight: '700' },

  progRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progTrack: { flex: 1, height: 7, backgroundColor: COLORS.border, borderRadius: 4, overflow: 'hidden' },
  progFill: { height: 7, backgroundColor: COLORS.primary, borderRadius: 4 },
  progPct: { fontSize: 11, fontWeight: '700', color: COLORS.primary, width: 60, textAlign: 'right' },

  finRow: { flexDirection: 'row', gap: 8 },
  finBox: { flex: 1, backgroundColor: COLORS.bg, borderRadius: 8, padding: 8, alignItems: 'center' },
  finVal: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  finLbl: { fontSize: 10, color: COLORS.muted, marginTop: 2 },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.muted },
  payRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  topBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  payName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  payMeta: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  payAmt: { fontSize: 15, fontWeight: '800', color: COLORS.success },

  empty: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 13, color: COLORS.muted, textAlign: 'center', paddingHorizontal: 20 },
});
