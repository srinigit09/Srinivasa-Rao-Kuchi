import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  StatusBar, Modal, FlatList,
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

interface BuildingSummary {
  id: string;
  name: string;
  building_type: 'residential' | 'pg';
  total_units: number;
  vacant_units: number;
}

interface PaymentRow {
  amount_paid: number;
  advance_paid: number;
  outstanding: number;
  status: string;
  payment_month: string;
  tenant_id: string;
  tenants: any;
}

interface DashboardData {
  buildings: BuildingSummary[];
  totalBuildings: number;
  allUnits: { id: string; is_vacant: boolean; building_id: string }[];
  allPayments: PaymentRow[];
}

const HEADER_BLUE = '#1D4ED8';

export default function DashboardScreen({ navigation }: Props) {
  const { user, signOut } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    const [bldRes, unitRes, payRes] = await Promise.all([
      supabase
        .from('buildings')
        .select('id, name, building_type, units(id, is_vacant)')
        .eq('owner_id', user.id)
        .order('name'),
      supabase
        .from('units')
        .select('id, is_vacant, building_id')
        .eq('owner_id', user.id),
      supabase
        .from('payments')
        .select('amount_paid, advance_paid, outstanding, status, payment_month, tenant_id, tenants(full_name, units(unit_number, building_id, buildings(name, id)))')
        .eq('owner_id', user.id),
    ]);

    const allBuildings: BuildingSummary[] = (bldRes.data ?? []).map((b: any) => ({
      id: b.id,
      name: b.name,
      building_type: b.building_type,
      total_units: b.units?.length ?? 0,
      vacant_units: b.units?.filter((u: any) => u.is_vacant).length ?? 0,
    }));

    setData({
      buildings: allBuildings,
      totalBuildings: allBuildings.length,
      allUnits: (unitRes.data ?? []) as any,
      allPayments: (payRes.data ?? []) as any,
    });

    // Auto-select first building if none selected yet
    setSelectedBuildingId(prev =>
      prev && allBuildings.find(b => b.id === prev) ? prev : (allBuildings[0]?.id ?? '')
    );

    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => {
    if (data) { load(true); } else { load(); }
  }, [load, data]));
  const onRefresh = async () => { setRefreshing(true); await load(true); setRefreshing(false); };

  // ── derived stats — always filtered by selected building ─────────────────
  const selectedBuilding = data?.buildings.find(b => b.id === selectedBuildingId);

  const filteredUnits = (data?.allUnits ?? []).filter(u => u.building_id === selectedBuildingId);
  const displayUnits    = filteredUnits.length;
  const displayVacant   = filteredUnits.filter(u => u.is_vacant).length;
  const displayOccupied = displayUnits - displayVacant;

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const filteredPayments = (data?.allPayments ?? []).filter(p => {
    const bid = (p.tenants as any)?.units?.buildings?.id;
    return bid === selectedBuildingId;
  });

  const thisMonthPayments = filteredPayments.filter(p => p.payment_month === thisMonth);
  const collectedThisMonth = thisMonthPayments.reduce((s, p) => s + (p.amount_paid ?? 0) + (p.advance_paid ?? 0), 0);
  const pendingThisMonth   = thisMonthPayments.reduce((s, p) => s + (p.outstanding ?? 0), 0);

  const overduePayments = filteredPayments
    .filter(p => isOverdue(p.payment_month) && p.status !== 'Paid')
    .slice(0, 5)
    .map(p => ({
      tenant_name:   (p.tenants as any)?.full_name ?? '',
      unit_number:   (p.tenants as any)?.units?.unit_number ?? '',
      building_name: (p.tenants as any)?.units?.buildings?.name ?? '',
      amount: p.outstanding ?? 0,
      month:  p.payment_month,
    }));

  const dropdownLabel = selectedBuilding?.name ?? 'Select Building';

  // Navigation helpers — always pass the selected building
  const buildingParam = { buildingId: selectedBuildingId, buildingName: selectedBuilding?.name };
  const navToUnits    = () => navigation.navigate('AllUnits', buildingParam);
  const navToOccupied = () => navigation.navigate('OccupiedTenants', buildingParam);

  return (
    <View style={{ flex: 1, backgroundColor: HEADER_BLUE }}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BLUE} />

      {/* ── Blue Header ── */}
      <View style={[styles.headerPanel, { paddingTop: insets.top + 8 }]}>
        <View style={styles.appNameRow}>
          <View style={styles.appIconCircle}>
            <Ionicons name="business" size={16} color={HEADER_BLUE} />
          </View>
          <Text style={styles.appName}>RentEase</Text>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={() => {
              const { showAlert } = require('../../utils');
              showAlert('Sign Out', 'Do you want to log out?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Log Out', style: 'destructive', onPress: signOut },
              ]);
            }}
          >
            <Ionicons name="log-out-outline" size={15} color="rgba(255,255,255,0.9)" />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Building selector */}
        <TouchableOpacity style={styles.dropdownBtn} onPress={() => setDropdownOpen(true)} activeOpacity={0.8}>
          <Ionicons name="business-outline" size={16} color="#fff" />
          <Text style={styles.dropdownLabel} numberOfLines={1}>{dropdownLabel}</Text>
          <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
      </View>

      {/* ── Quick Actions ── */}
      <View style={styles.quickActionsPanel}>
        <QuickActionBtn label="Add Tenant"     icon="person-add-outline" onPress={() => navigation.navigate('AddNewTenant')} />
        <QuickActionBtn label="Record Payment" icon="cash-outline"       onPress={() => navigation.navigate('OccupiedTenants', {})} />
      </View>

      {/* ── Scrollable body ── */}
      <ScrollView
        style={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Overdue alert */}
        {overduePayments.length > 0 && (
          <TouchableOpacity style={styles.alertBanner} onPress={() => navigation.navigate('Outstanding', buildingParam)}>
            <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
            <Text style={styles.alertText}>
              {overduePayments.length} overdue payment{overduePayments.length > 1 ? 's' : ''} — tap to view
            </Text>
            <Ionicons name="chevron-forward" size={14} color={COLORS.danger} />
          </TouchableOpacity>
        )}

        {/* ── Stat cards: 3 cards (Buildings removed) ── */}
        <View style={styles.grid}>
          <StatCard label="Total Units" value={displayUnits}    icon="home-outline"   color="#7C3AED" onPress={navToUnits}    loading={loading} />
          <StatCard label="Occupied"    value={displayOccupied} icon="person-add"     color={COLORS.success} onPress={navToOccupied} loading={loading} />
          <StatCard label="Vacant"      value={displayVacant}   icon="key-outline"    color="#D97706" onPress={() => navigation.navigate('AddNewTenant')} loading={loading} />
        </View>

        {/* ── This Month's Payment Summary ── */}
        <Card title="This Month's Payment Summary">
          <View style={styles.row}>
            <TouchableOpacity style={styles.colHalf} onPress={() => navigation.navigate('CollectedPayments', buildingParam)}>
              <Text style={styles.amtLabel}>Received</Text>
              <Text style={[styles.amtValue, { color: COLORS.success }]}>{formatCurrency(collectedThisMonth)}</Text>
              <Text style={styles.tapHint}>tap for details ›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.colHalf, styles.borderLeft]} onPress={() => navigation.navigate('Outstanding', buildingParam)}>
              <Text style={styles.amtLabel}>Outstanding</Text>
              <Text style={[styles.amtValue, { color: '#D97706' }]}>{formatCurrency(pendingThisMonth)}</Text>
              <Text style={styles.tapHint}>tap for details ›</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* ── Overdue list ── */}
        {overduePayments.length > 0 && (
          <Card title="Overdue Payments">
            {overduePayments.map((p, i) => (
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

      {/* ── Building picker modal ── */}
      <Modal visible={dropdownOpen} transparent animationType="fade" onRequestClose={() => setDropdownOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDropdownOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.dropdownSheet}>
            <Text style={styles.dropdownTitle}>Filter by Building</Text>

            {/* Per-building rows */}
            <FlatList
              data={data?.buildings ?? []}
              keyExtractor={b => b.id}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.dropdownItem, selectedBuildingId === item.id && styles.dropdownItemActive]}
                  onPress={() => { setSelectedBuildingId(item.id); setDropdownOpen(false); }}
                >
                  <Ionicons
                    name={item.building_type === 'pg' ? 'bed-outline' : 'business-outline'}
                    size={18}
                    color={selectedBuildingId === item.id ? COLORS.primary : COLORS.muted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dropdownItemText, selectedBuildingId === item.id && { color: COLORS.primary }]}>{item.name}</Text>
                    <Text style={styles.dropdownItemSub}>
                      {item.building_type === 'pg' ? 'PG/Hostel' : 'Residential'} · {item.total_units} units · {item.vacant_units} vacant
                    </Text>
                  </View>
                  {selectedBuildingId === item.id && <Ionicons name="checkmark" size={18} color={COLORS.primary} />}
                </TouchableOpacity>
              )}
            />

            {/* Open building detail shortcut — always shown since a building is always selected */}
            <TouchableOpacity
              style={styles.viewBuildingBtn}
              onPress={() => { setDropdownOpen(false); navigation.navigate('BuildingDetail', { buildingId: selectedBuildingId }); }}
            >
              <Text style={styles.viewBuildingText}>Open Building Detail →</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

const StatCard = ({ label, value, icon, color, onPress, loading }: any) => (
  <TouchableOpacity style={styles.statCard} onPress={onPress} activeOpacity={0.75}>
    <Text style={[styles.statLabel, { color }]}>{label}</Text>
    {loading
      ? <View style={styles.statSkeleton} />
      : <Text style={styles.statValue}>{value}</Text>
    }
    <View style={[styles.statIconWrap, { backgroundColor: color + '18' }]}>
      <Ionicons name={icon} size={14} color={color} />
    </View>
  </TouchableOpacity>
);

const QuickActionBtn = ({ label, icon, onPress }: any) => (
  <TouchableOpacity style={styles.qaBtn} onPress={onPress} activeOpacity={0.75}>
    <View style={styles.qaIconWrap}>
      <Ionicons name={icon} size={20} color={HEADER_BLUE} />
    </View>
    <Text style={styles.qaLabel}>{label}</Text>
  </TouchableOpacity>
);

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  headerPanel: {
    backgroundColor: HEADER_BLUE,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  appNameRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 10,
  },
  appIconCircle: {
    width: 28, height: 28, borderRadius: 7,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  appName: { flex: 1, fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: 0.4 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8,
  },
  logoutText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },

  dropdownBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  dropdownLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: '#fff' },

  quickActionsPanel: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: '#1640B8', paddingVertical: 12, paddingHorizontal: 8,
  },
  qaBtn: { alignItems: 'center', gap: 5, flex: 1 },
  qaIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  qaLabel: { fontSize: 11, color: 'rgba(255,255,255,0.93)', textAlign: 'center', fontWeight: '600' },

  body: { flex: 1, backgroundColor: COLORS.bg },

  alertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.dangerLight, marginHorizontal: 14, marginTop: 12,
    padding: 10, borderRadius: 10,
  },
  alertText: { flex: 1, color: COLORS.danger, fontSize: 12, fontWeight: '500' },

  grid: { flexDirection: 'row', paddingHorizontal: 10, marginTop: 12, gap: 8 },
  statCard: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', gap: 3,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  statLabel: { fontSize: 12, fontWeight: '800', textAlign: 'center', letterSpacing: 0.1 },
  statValue: { fontSize: 28, fontWeight: '900', color: COLORS.text, lineHeight: 32 },
  statSkeleton: { width: 48, height: 32, borderRadius: 6, backgroundColor: '#E5E7EB', marginVertical: 2 },
  statIconWrap: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginTop: 2 },

  row: { flexDirection: 'row' },
  colHalf: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  borderLeft: { borderLeftWidth: 1, borderLeftColor: COLORS.border },
  amtLabel: { fontSize: 12, color: COLORS.muted, marginBottom: 4, fontWeight: '500' },
  amtValue: { fontSize: 22, fontWeight: '700' },
  tapHint: { fontSize: 10, color: COLORS.primary, marginTop: 4 },

  overdueRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 10 },
  topBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  overdueName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  overdueSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-start', paddingTop: 120, paddingHorizontal: 16,
  },
  dropdownSheet: {
    backgroundColor: COLORS.white, borderRadius: 18,
    paddingTop: 16, paddingBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, elevation: 12,
  },
  dropdownTitle: {
    fontSize: 13, fontWeight: '700', color: COLORS.muted,
    paddingHorizontal: 18, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase',
  },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 13 },
  dropdownItemActive: { backgroundColor: COLORS.primaryLight },
  dropdownItemText: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  dropdownItemSub: { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  viewBuildingBtn: {
    margin: 14, marginTop: 6,
    backgroundColor: COLORS.primaryLight, borderRadius: 10, padding: 12, alignItems: 'center',
  },
  viewBuildingText: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },
});
