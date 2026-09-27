import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

const HEADER_BLUE = '#1D4ED8'; // slightly deeper blue matching the RentEase icon

export default function DashboardScreen({ navigation }: Props) {
  const { user, profile, signOut } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();

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
    <View style={{ flex: 1, backgroundColor: HEADER_BLUE }}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BLUE} />

      {/* Blue Header Panel */}
      <View style={[styles.headerPanel, { paddingTop: insets.top + 10 }]}>
        {/* App name row */}
        <View style={styles.appNameRow}>
          <View style={styles.appIconCircle}>
            <Ionicons name="home" size={18} color={HEADER_BLUE} />
          </View>
          <Text style={styles.appName}>RentEase</Text>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={() => {
              const { showAlert } = require('../../utils');
              showAlert('Sign Out', 'Do you want to log out of RentEase?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Log Out', style: 'destructive', onPress: signOut },
              ]);
            }}
          >
            <Ionicons name="log-out-outline" size={16} color="rgba(255,255,255,0.9)" />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Greeting */}
        <Text style={styles.greeting}>
          {greeting()}, {profile?.full_name?.split(' ')[0] ?? 'there'} 👋
        </Text>
        <Text style={styles.subGreeting}>Here's your property summary</Text>

        {/* Quick Actions inside header */}
        <View style={styles.quickActionsRow}>
          <QuickActionBtn
            label="Add Building"
            icon="add-circle-outline"
            onPress={() => navigation.navigate('AddEditBuilding', {})}
          />
          <QuickActionBtn
            label="Add Tenant"
            icon="person-add-outline"
            onPress={() => navigation.navigate('AddTenantStep1')}
          />
          <QuickActionBtn
            label="Record Payment"
            icon="cash-outline"
            onPress={() => navigation.navigate('Tenants' as any)}
          />
          <QuickActionBtn
            label="Vacant Units"
            icon="key-outline"
            onPress={() => navigation.navigate('VacantUnits')}
          />
        </View>
      </View>

      {/* White/Grey body */}
      <ScrollView
        style={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
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
          <StatCard
            label="Buildings"
            value={data?.totalBuildings ?? 0}
            icon="business"
            color={COLORS.primary}
            onPress={() => navigation.navigate('Buildings' as any)}
          />
          <StatCard
            label="Units"
            value={data?.totalUnits ?? 0}
            icon="home"
            color={COLORS.primary}
            onPress={() => navigation.navigate('Buildings' as any)}
          />
          <StatCard
            label="Occupied"
            value={data?.occupiedUnits ?? 0}
            icon="person"
            color={COLORS.success}
            onPress={() => navigation.navigate('Tenants' as any)}
          />
          <StatCard
            label="Vacant"
            value={data?.vacantUnits ?? 0}
            icon="key"
            color={COLORS.warning}
            onPress={() => navigation.navigate('VacantUnits')}
          />
        </View>

        {/* Monthly Collection */}
        <Card title="This Month's Collection">
          <View style={styles.row}>
            <TouchableOpacity
              style={styles.colHalf}
              onPress={() => navigation.navigate('CollectedPayments' as any)}
            >
              <Text style={styles.amtLabel}>Collected</Text>
              <Text style={[styles.amtValue, { color: COLORS.success }]}>
                {formatCurrency(data?.collectedThisMonth ?? 0)}
              </Text>
              <Text style={styles.tapHint}>tap to view ›</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.colHalf, styles.borderLeft]}
              onPress={() => navigation.navigate('Outstanding' as any)}
            >
              <Text style={styles.amtLabel}>Outstanding</Text>
              <Text style={[styles.amtValue, { color: COLORS.danger }]}>
                {formatCurrency(data?.pendingThisMonth ?? 0)}
              </Text>
              <Text style={styles.tapHint}>tap to view ›</Text>
            </TouchableOpacity>
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
      </ScrollView>
    </View>
  );
}

const StatCard = ({ label, value, icon, color, onPress }: any) => (
  <TouchableOpacity style={styles.statCard} onPress={onPress} activeOpacity={0.75}>
    <Ionicons name={icon} size={22} color={color} />
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </TouchableOpacity>
);

const QuickActionBtn = ({ label, icon, onPress }: any) => (
  <TouchableOpacity style={styles.qaBtn} onPress={onPress} activeOpacity={0.75}>
    <View style={styles.qaIconWrap}>
      <Ionicons name={icon} size={22} color={HEADER_BLUE} />
    </View>
    <Text style={styles.qaLabel}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  headerPanel: {
    backgroundColor: HEADER_BLUE,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  appNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  appIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  appName: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
  },
  logoutText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  greeting: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  subGreeting: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 16,
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  qaBtn: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  qaIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qaLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    fontWeight: '500',
    maxWidth: 60,
  },
  body: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -4,
  },
  alertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.dangerLight, marginHorizontal: 16, marginTop: 14,
    padding: 12, borderRadius: 10,
  },
  alertText: { flex: 1, color: COLORS.danger, fontSize: 13, fontWeight: '500' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, marginTop: 14 },
  statCard: {
    width: '44%', margin: '3%', backgroundColor: COLORS.white, borderRadius: 12,
    padding: 16, alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  statValue: { fontSize: 28, fontWeight: '700', color: COLORS.text },
  statLabel: { fontSize: 12, color: COLORS.muted },
  row: { flexDirection: 'row' },
  colHalf: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  borderLeft: { borderLeftWidth: 1, borderLeftColor: COLORS.border },
  amtLabel: { fontSize: 12, color: COLORS.muted, marginBottom: 4 },
  amtValue: { fontSize: 22, fontWeight: '700' },
  tapHint: { fontSize: 10, color: COLORS.primary, marginTop: 4 },
  overdueRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  topBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  overdueName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  overdueSub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
});
