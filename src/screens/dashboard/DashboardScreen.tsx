import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import { formatCurrency, formatMonth, isOverdue } from '../../utils';
import Card from '../../components/common/Card';
import StatusBadge from '../../components/common/StatusBadge';
import { AppStackParamList } from '../../navigation/RootNavigator';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList> };

interface DashboardData {
  totalBuildings: number;
  totalUnits: number;
  vacantUnits: number;
  occupiedUnits: number;
  totalTenants: number;
  collectedThisMonth: number;
  pendingThisMonth: number;
  overduePayments: { tenant_name: string; unit_number: string; building_name: string; amount: number; month: string }[];
}

export default function DashboardScreen({ navigation }: Props) {
  const { user, profile, signOut } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [buildings, units, tenants, payments] = await Promise.all([
      supabase.from('buildings').select('id').eq('owner_id', user.id),
      supabase.from('units').select('id, is_vacant').eq('owner_id', user.id),
      supabase.from('tenants').select('id').eq('owner_id', user.id).eq('is_active', true),
      supabase.from('payments').select('amount_paid, outstanding, status, payment_month, tenant_id, tenants(full_name, units(unit_number, buildings(name)))').eq('owner_id', user.id),
    ]);

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const thisMonthPayments = (payments.data ?? []).filter(p => p.payment_month === thisMonth);
    const overdue = (payments.data ?? []).filter(p => isOverdue(p.payment_month) && p.status !== 'Paid');

    setData({
      totalBuildings: buildings.data?.length ?? 0,
      totalUnits: units.data?.length ?? 0,
      vacantUnits: units.data?.filter(u => u.is_vacant).length ?? 0,
      occupiedUnits: units.data?.filter(u => !u.is_vacant).length ?? 0,
      totalTenants: tenants.data?.length ?? 0,
      collectedThisMonth: thisMonthPayments.reduce((s, p) => s + (p.amount_paid ?? 0), 0),
      pendingThisMonth: thisMonthPayments.reduce((s, p) => s + (p.outstanding ?? 0), 0),
      overduePayments: overdue.slice(0, 5).map(p => ({
        tenant_name: (p.tenants as any)?.full_name ?? '',
        unit_number: (p.tenants as any)?.units?.unit_number ?? '',
        building_name: (p.tenants as any)?.units?.buildings?.name ?? '',
        amount: p.outstanding ?? 0,
        month: p.payment_month,
      })),
    });
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{greeting()}, {profile?.full_name?.split(' ')[0] ?? 'there'} 👋</Text>
          <Text style={styles.subHeader}>Here's your property summary</Text>
        </View>
        <TouchableOpacity
          style={styles.headerLogoutBtn}
          onPress={() => {
            const { showAlert } = require('../../utils');
            showAlert('Sign Out', 'Do you want to log out of RentEase?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Log Out', style: 'destructive', onPress: signOut },
            ]);
          }}
        >
          <Ionicons name="log-out-outline" size={18} color={COLORS.danger} />
          <Text style={styles.headerLogoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Overdue Alert Banner */}
      {data && data.overduePayments.length > 0 && (
        <TouchableOpacity style={styles.alertBanner} onPress={() => navigation.navigate('Reports' as any)}>
          <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
          <Text style={styles.alertText}>
            {data.overduePayments.length} overdue payment{data.overduePayments.length > 1 ? 's' : ''} need attention
          </Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.danger} />
        </TouchableOpacity>
      )}

      {/* Summary Cards */}
      <View style={styles.grid}>
        <StatCard label="Buildings" value={data?.totalBuildings ?? 0} icon="business" color={COLORS.primary} />
        <StatCard label="Units" value={data?.totalUnits ?? 0} icon="home" color={COLORS.primary} />
        <StatCard label="Occupied" value={data?.occupiedUnits ?? 0} icon="person" color={COLORS.success} />
        <StatCard label="Vacant" value={data?.vacantUnits ?? 0} icon="key" color={COLORS.warning}
          onPress={() => navigation.navigate('VacantUnits')} />
      </View>

      {/* Monthly Collection */}
      <Card title="This Month's Collection">
        <View style={styles.row}>
          <View style={styles.colHalf}>
            <Text style={styles.amtLabel}>Collected</Text>
            <Text style={[styles.amtValue, { color: COLORS.success }]}>{formatCurrency(data?.collectedThisMonth ?? 0)}</Text>
          </View>
          <View style={[styles.colHalf, styles.borderLeft]}>
            <Text style={styles.amtLabel}>Outstanding</Text>
            <Text style={[styles.amtValue, { color: COLORS.danger }]}>{formatCurrency(data?.pendingThisMonth ?? 0)}</Text>
          </View>
        </View>
      </Card>

      {/* Overdue Tenants */}
      {data && data.overduePayments.length > 0 && (
        <Card title="Overdue Payments">
          {data.overduePayments.map((p, i) => (
            <View key={i} style={[styles.overdueRow, i > 0 && styles.topBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.overdueName}>{p.tenant_name}</Text>
                <Text style={styles.overdueSub}>{p.building_name} · {p.unit_number} · {formatMonth(p.month)}</Text>
              </View>
              <StatusBadge status="Pending" />
            </View>
          ))}
        </Card>
      )}

      {/* Quick Actions */}
      <Card title="Quick Actions">
        <View style={styles.actionsRow}>
          <ActionBtn label="Add Building" icon="add-circle-outline" onPress={() => navigation.navigate('AddEditBuilding', {})} />
          <ActionBtn label="Add Tenant" icon="person-add-outline" onPress={() => navigation.navigate('AddTenantStep1')} />
          <ActionBtn label="Record Payment" icon="cash-outline" onPress={() => navigation.navigate('Tenants' as any)} />
          <ActionBtn label="Vacant Units" icon="key-outline" onPress={() => navigation.navigate('VacantUnits')} />
        </View>
      </Card>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const StatCard = ({ label, value, icon, color, onPress }: any) => (
  <TouchableOpacity style={styles.statCard} onPress={onPress} disabled={!onPress}>
    <Ionicons name={icon} size={22} color={color} />
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </TouchableOpacity>
);

const ActionBtn = ({ label, icon, onPress }: any) => (
  <TouchableOpacity style={styles.actionBtn} onPress={onPress}>
    <View style={styles.actionIconWrap}>
      <Ionicons name={icon} size={24} color={COLORS.primary} />
    </View>
    <Text style={styles.actionLabel}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greeting: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  headerLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: COLORS.dangerLight,
    borderRadius: 8,
  },
  headerLogoutText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.danger,
  },
  subHeader: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  alertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.dangerLight, marginHorizontal: 16, marginVertical: 6,
    padding: 12, borderRadius: 10,
  },
  alertText: { flex: 1, color: COLORS.danger, fontSize: 13, fontWeight: '500' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, marginTop: 4 },
  statCard: {
    width: '44%', margin: '3%', backgroundColor: COLORS.white, borderRadius: 12,
    padding: 16, alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  statValue: { fontSize: 28, fontWeight: '700', color: COLORS.text },
  statLabel: { fontSize: 12, color: COLORS.muted },
  row: { flexDirection: 'row' },
  colHalf: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  borderLeft: { borderLeftWidth: 1, borderLeftColor: COLORS.border },
  amtLabel: { fontSize: 12, color: COLORS.muted, marginBottom: 4 },
  amtValue: { fontSize: 22, fontWeight: '700' },
  overdueRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  topBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  overdueName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  overdueSub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  actionBtn: { alignItems: 'center', gap: 8 },
  actionIconWrap: {
    width: 52, height: 52, borderRadius: 14, backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { fontSize: 11, color: COLORS.muted, textAlign: 'center', maxWidth: 64 },
});
