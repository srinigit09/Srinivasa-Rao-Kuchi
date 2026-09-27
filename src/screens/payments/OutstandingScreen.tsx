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
import { Payment } from '../../types';
import { formatCurrency, formatMonth } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';
import StatusBadge from '../../components/common/StatusBadge';

type Tab = 'thisMonth' | 'allTime';
type Props = { navigation: NativeStackNavigationProp<AppStackParamList> };

export default function OutstandingScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('thisMonth');
  const [thisMonthPayments, setThisMonthPayments] = useState<Payment[]>([]);
  const [allTimePayments, setAllTimePayments] = useState<Payment[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const [{ data: tm }, { data: at }] = await Promise.all([
      supabase
        .from('payments')
        .select('*, tenants(full_name, units(unit_number, buildings(name)))')
        .eq('owner_id', user.id)
        .eq('payment_month', thisMonth)
        .neq('status', 'Paid')
        .order('payment_month', { ascending: false }),
      supabase
        .from('payments')
        .select('*, tenants(full_name, units(unit_number, buildings(name)))')
        .eq('owner_id', user.id)
        .neq('status', 'Paid')
        .order('payment_month', { ascending: false }),
    ]);

    const mapPayments = (arr: any[]): Payment[] =>
      arr.map((x: any) => ({
        ...x,
        tenant_name: x.tenants?.full_name,
        unit_number: x.tenants?.units?.unit_number,
        building_name: x.tenants?.units?.buildings?.name,
      }));

    setThisMonthPayments(mapPayments(tm ?? []));
    setAllTimePayments(mapPayments(at ?? []));
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const payments = activeTab === 'thisMonth' ? thisMonthPayments : allTimePayments;
  const totalOutstanding = payments.reduce((s, p) => s + (p.outstanding ?? 0), 0);

  return (
    <View style={styles.container}>
      {/* Summary banner */}
      <View style={styles.summaryBanner}>
        <Text style={styles.summaryLabel}>
          {activeTab === 'thisMonth' ? 'Outstanding This Month' : 'All-Time Outstanding'}
        </Text>
        <Text style={styles.summaryValue}>{formatCurrency(totalOutstanding)}</Text>
        <Text style={styles.summaryCount}>
          {payments.length} unpaid record{payments.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'thisMonth' && styles.tabActive]}
          onPress={() => setActiveTab('thisMonth')}
        >
          <Text style={[styles.tabText, activeTab === 'thisMonth' && styles.tabTextActive]}>
            This Month
          </Text>
          {thisMonthPayments.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{thisMonthPayments.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'allTime' && styles.tabActive]}
          onPress={() => setActiveTab('allTime')}
        >
          <Text style={[styles.tabText, activeTab === 'allTime' && styles.tabTextActive]}>
            All Time
          </Text>
          {allTimePayments.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{allTimePayments.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={payments}
        keyExtractor={p => p.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle-outline" size={48} color={COLORS.success} />
            <Text style={styles.emptyTitle}>All clear!</Text>
            <Text style={styles.emptyText}>No outstanding payments.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('TenantProfile', { tenantId: item.tenant_id })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.tenantName}>{item.tenant_name}</Text>
              <Text style={styles.meta}>{item.building_name} · {item.unit_number}</Text>
              <Text style={styles.period}>{formatMonth(item.payment_month)}</Text>
              <Text style={styles.dueRow}>
                Due: {formatCurrency(item.amount_due)} · Paid: {formatCurrency(item.amount_paid)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              {item.outstanding > 0 && (
                <Text style={styles.outstanding}>{formatCurrency(item.outstanding)}</Text>
              )}
              <StatusBadge status={item.status} />
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const ORANGE = '#D97706';
const ORANGE_LIGHT = '#FEF3C7';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  summaryBanner: {
    backgroundColor: ORANGE,
    padding: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  summaryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginBottom: 4 },
  summaryValue: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  summaryCount: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: ORANGE,
  },
  tabText: { fontSize: 14, fontWeight: '600', color: COLORS.muted },
  tabTextActive: { color: ORANGE },
  badge: {
    backgroundColor: ORANGE,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  list: { padding: 16, gap: 10, paddingBottom: 32 },
  card: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    borderLeftWidth: 3, borderLeftColor: ORANGE,
  },
  tenantName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  period: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  dueRow: { fontSize: 11, color: COLORS.muted, marginTop: 3 },
  outstanding: { fontSize: 17, fontWeight: '700', color: ORANGE },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.muted },
});
