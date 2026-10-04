import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import { Payment } from '../../types';
import { formatCurrency, formatMonth, openWhatsApp, buildReminderMessage } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';
import StatusBadge from '../../components/common/StatusBadge';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';

type Tab = 'thisMonth' | 'allTime';
type Props = NativeStackScreenProps<AppStackParamList, 'Outstanding'>;

interface OutstandingRow extends Payment {
  phone?: string;
  _building_id?: string;
}


export default function OutstandingScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { buildingId, buildingName } = route.params ?? {};
  const [activeTab, setActiveTab] = useState<Tab>('thisMonth');
  const [thisMonthPayments, setThisMonthPayments] = useState<OutstandingRow[]>([]);
  const [allTimePayments, setAllTimePayments] = useState<OutstandingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    if (!user) return;
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const [{ data: tm }, { data: at }] = await Promise.all([
      supabase
        .from('payments')
        .select('*, tenants(full_name, phone, units(unit_number, building_id, buildings(name)))')
        .eq('owner_id', user.id)
        .eq('payment_month', thisMonth)
        .neq('status', 'Paid')
        .order('payment_month', { ascending: false }),
      supabase
        .from('payments')
        .select('*, tenants(full_name, phone, units(unit_number, building_id, buildings(name)))')
        .eq('owner_id', user.id)
        .neq('status', 'Paid')
        .order('payment_month', { ascending: false }),
    ]);

    const mapPayments = (arr: any[]): OutstandingRow[] =>
      arr.map((x: any) => ({
        ...x,
        tenant_name: x.tenants?.full_name,
        unit_number: x.tenants?.units?.unit_number,
        building_name: x.tenants?.units?.buildings?.name,
        phone: x.tenants?.phone,
        _building_id: x.tenants?.units?.building_id,
      }));

    let tmRows = mapPayments(tm ?? []);
    let atRows = mapPayments(at ?? []);

    if (buildingId) {
      tmRows = tmRows.filter(r => r._building_id === buildingId);
      atRows = atRows.filter(r => r._building_id === buildingId);
    }

    setThisMonthPayments(tmRows);
    setAllTimePayments(atRows);
    setLoading(false);
  }, [user, buildingId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const payments = activeTab === 'thisMonth' ? thisMonthPayments : allTimePayments;
  const totalOutstanding = payments.reduce((s, p) => s + (p.outstanding ?? 0), 0);

  const bannerSubtitle = buildingName
    ? `${buildingName}  ·  ${formatCurrency(totalOutstanding)} unpaid · ${payments.length} record${payments.length !== 1 ? 's' : ''}`
    : `${formatCurrency(totalOutstanding)} unpaid · ${payments.length} record${payments.length !== 1 ? 's' : ''}`;

  const sendReminder = (item: OutstandingRow) => {
    if (!item.phone) return;
    const msg = buildReminderMessage({
      tenantName: item.tenant_name ?? '',
      buildingName: item.building_name ?? '',
      unitNumber: item.unit_number ?? '',
      month: formatMonth(item.payment_month),
      amountDue: item.outstanding ?? 0,
    });
    openWhatsApp(item.phone, msg);
  };

  return (
    <View style={styles.container}>
      <BlueBannerHeader
        title="Outstanding Payments"
        subtitle={bannerSubtitle}
        onBack={() => navigation.goBack()}
      />

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
        ListEmptyComponent={loading ? null : (
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle-outline" size={48} color={COLORS.success} />
            <Text style={styles.emptyTitle}>All clear!</Text>
            <Text style={styles.emptyText}>No outstanding payments.</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => navigation.navigate('TenantProfile', { tenantId: item.tenant_id })}
            >
              <Text style={styles.tenantName}>{item.tenant_name}</Text>
              <Text style={styles.meta}>{item.building_name} · {item.unit_number}</Text>
              <Text style={styles.period}>{formatMonth(item.payment_month)}</Text>
              <Text style={styles.dueRow}>
                Due: {formatCurrency(item.amount_due)} · Rent Paid: {formatCurrency(item.amount_paid)}
              </Text>
              {(item.advance_paid ?? 0) > 0 && (
                <Text style={styles.advanceRow}>
                  Advance: {formatCurrency(item.advance_paid)} applied
                </Text>
              )}
            </TouchableOpacity>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              {item.outstanding > 0 && (
                <Text style={styles.outstanding}>{formatCurrency(item.outstanding)}</Text>
              )}
              <StatusBadge status={item.status} />
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => navigation.navigate('RecordPayment', { tenantId: item.tenant_id, paymentId: item.id })}
              >
                <Text style={styles.editBtnText}>✏️ Pay</Text>
              </TouchableOpacity>
              {item.phone && (
                <TouchableOpacity
                  style={styles.reminderBtn}
                  onPress={() => sendReminder(item)}
                >
                  <Ionicons name="logo-whatsapp" size={13} color="#25D366" />
                  <Text style={styles.reminderText}>Remind</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
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
    paddingVertical: 13,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: COLORS.warning,
  },
  tabText: { fontSize: 14, fontWeight: '600', color: COLORS.muted },
  tabTextActive: { color: COLORS.warning },
  badge: {
    backgroundColor: COLORS.warning,
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
    borderLeftWidth: 3, borderLeftColor: COLORS.warning,
  },
  tenantName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  period: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  dueRow: { fontSize: 11, color: COLORS.muted, marginTop: 3 },
  advanceRow: { fontSize: 11, color: '#7C3AED', fontWeight: '600', marginTop: 2 },
  outstanding: { fontSize: 17, fontWeight: '700', color: COLORS.warning },
  editBtn: {
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: '#EFF6FF', borderRadius: 6,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  editBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  reminderBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#E8FFF0', paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: 7, borderWidth: 1, borderColor: '#25D366',
  },
  reminderText: { fontSize: 11, color: '#25D366', fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.muted },
});
