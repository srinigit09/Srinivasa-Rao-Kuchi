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
import { COLORS, PROPERTY_TYPES } from '../../constants';
import { formatCurrency, formatMonth, isOverdue } from '../../utils';
import Card from '../../components/common/Card';
import StatusBadge from '../../components/common/StatusBadge';
import { AppStackParamList } from '../../navigation/RootNavigator';
import { BuildingType } from '../../types';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList> };

interface BuildingSummary {
  id: string;
  name: string;
  building_type: BuildingType;
  society_name?: string;
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
  openMaintenanceCount: number;
  activeNoticesCount: number;
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
    const [bldRes, unitRes, payRes, maintRes, noticeRes] = await Promise.all([
      supabase
        .from('buildings')
        .select('id, name, building_type, society_name, units(id, is_vacant)')
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
      supabase
        .from('maintenance_requests')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', user.id)
        .neq('status', 'Resolved')
        .neq('status', 'Cancelled'),
      supabase
        .from('society_notices')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', user.id),
    ]);

    const allBuildings: BuildingSummary[] = (bldRes.data ?? []).map((b: any) => ({
      id: b.id,
      name: b.name,
      building_type: b.building_type,
      society_name: b.society_name,
      total_units: b.units?.length ?? 0,
      vacant_units: b.units?.filter((u: any) => u.is_vacant).length ?? 0,
    }));

    setData({
      buildings: allBuildings,
      totalBuildings: allBuildings.length,
      allUnits: (unitRes.data ?? []) as any,
      allPayments: (payRes.data ?? []) as any,
      openMaintenanceCount: maintRes.count ?? 0,
      activeNoticesCount: noticeRes.count ?? 0,
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

  const dropdownLabel = selectedBuilding?.name ?? 'Select Property / Community';

  // Navigation helpers
  const buildingParam = { buildingId: selectedBuildingId, buildingName: selectedBuilding?.name };
  const navToUnits    = () => navigation.navigate('AllUnits', buildingParam);
  const navToOccupied = () => navigation.navigate('OccupiedTenants', buildingParam);

  const getPropBadge = (type?: BuildingType) => {
    const p = PROPERTY_TYPES.find(x => x.id === type);
    return p ? p.badge : '🏢 Property';
  };

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

        {/* Property & Community selector */}
        <TouchableOpacity style={styles.dropdownBtn} onPress={() => setDropdownOpen(true)} activeOpacity={0.8}>
          <Ionicons name="business-outline" size={16} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.dropdownLabel} numberOfLines={1}>{dropdownLabel}</Text>
            {selectedBuilding && (
              <Text style={styles.dropdownSubLabel}>
                {getPropBadge(selectedBuilding.building_type)}
                {selectedBuilding.society_name ? ` · ${selectedBuilding.society_name}` : ''}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
      </View>

      {/* ── Quick Actions ── */}
      <View style={styles.quickActionsPanel}>
        <QuickActionBtn label="Add Resident" icon="person-add-outline" onPress={() => navigation.navigate('AddNewTenant')} />
        <QuickActionBtn label="Record Payment" icon="cash-outline" onPress={() => navigation.navigate('OccupiedTenants', {})} />
        <QuickActionBtn label="Services / Fix" icon="construct-outline" onPress={() => navigation.navigate('Maintenance' as any, buildingParam)} />
        <QuickActionBtn label="Notices" icon="megaphone-outline" onPress={() => navigation.navigate('SocietyNotices' as any, buildingParam)} />
      </View>

      {/* ── Scrollable body ── */}
      <ScrollView
        style={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* ── Stat cards ── */}
        <View style={styles.grid}>
          <StatCard label="Total Units" value={displayUnits} icon="home-outline" color="#7C3AED" onPress={navToUnits} loading={loading} />
          <StatCard label="Occupied" value={displayOccupied} icon="person-add" color={COLORS.success} onPress={navToOccupied} loading={loading} />
          <StatCard label="Vacant" value={displayVacant} icon="key-outline" color="#D97706" onPress={() => navigation.navigate('AddNewTenant')} loading={loading} />
        </View>

        {/* ── This Month's Payment Summary ── */}
        <Card title="This Month's Dues & Collections">
          <View style={styles.row}>
            <TouchableOpacity style={styles.colHalf} onPress={() => navigation.navigate('CollectedPayments', buildingParam)}>
              <Text style={styles.amtLabel}>Received (Rent + Dues)</Text>
              <Text style={[styles.amtValue, { color: COLORS.success }]}>{formatCurrency(collectedThisMonth)}</Text>
              <Text style={styles.tapHint}>tap for details ›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.colHalf, styles.borderLeft]} onPress={() => navigation.navigate('Outstanding', buildingParam)}>
              <Text style={styles.amtLabel}>Outstanding Pending</Text>
              <Text style={[styles.amtValue, { color: '#D97706' }]}>{formatCurrency(pendingThisMonth)}</Text>
              <Text style={styles.tapHint}>tap for details ›</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* ── Active Service Requests Quick Box ── */}
        <Card title="Services & Maintenance Status">
          <TouchableOpacity
            style={styles.serviceBox}
            onPress={() => navigation.navigate('Maintenance' as any, buildingParam)}
          >
            <View style={[styles.serviceIconWrap, { backgroundColor: COLORS.primaryLight }]}>
              <Ionicons name="construct" size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.serviceTitle}>Active Service Requests</Text>
              <Text style={styles.serviceCount}>{data?.openMaintenanceCount ?? 0} Pending / In Progress</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
          </TouchableOpacity>
        </Card>
      </ScrollView>

      {/* ── Building picker modal ── */}
      <Modal visible={dropdownOpen} transparent animationType="fade" onRequestClose={() => setDropdownOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDropdownOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.dropdownSheet}>
            <Text style={styles.dropdownTitle}>Select Property / Society</Text>

            <FlatList
              data={data?.buildings ?? []}
              keyExtractor={b => b.id}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => {
                const isSelected = selectedBuildingId === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                    onPress={() => { setSelectedBuildingId(item.id); setDropdownOpen(false); }}
                  >
                    <Ionicons
                      name="business-outline"
                      size={20}
                      color={isSelected ? COLORS.primary : COLORS.muted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.dropdownItemText, isSelected && { color: COLORS.primary }]}>{item.name}</Text>
                      <Text style={styles.dropdownItemSub}>
                        {getPropBadge(item.building_type)} · {item.total_units} units · {item.vacant_units} vacant
                      </Text>
                    </View>
                    {isSelected && <Ionicons name="checkmark" size={18} color={COLORS.primary} />}
                  </TouchableOpacity>
                );
              }}
            />

            <TouchableOpacity
              style={styles.viewBuildingBtn}
              onPress={() => { setDropdownOpen(false); navigation.navigate('BuildingDetail', { buildingId: selectedBuildingId }); }}
            >
              <Text style={styles.viewBuildingText}>Open Property / Society Details →</Text>
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
      <Ionicons name={icon} size={18} color={HEADER_BLUE} />
    </View>
    <Text style={styles.qaLabel} numberOfLines={1}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  headerPanel: {
    backgroundColor: HEADER_BLUE,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  appNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  appIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  appName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    flex: 1,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  logoutText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 8,
  },
  dropdownLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  dropdownSubLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 1,
  },
  quickActionsPanel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: HEADER_BLUE,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  qaBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  qaIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qaLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  body: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 16,
    paddingHorizontal: 14,
  },
  grid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    position: 'relative',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 4,
  },
  statSkeleton: {
    height: 20,
    width: 32,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    marginTop: 4,
  },
  statIconWrap: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceRow: { gap: 4 },
  serviceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  serviceIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  serviceCount: { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colHalf: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  borderLeft: {
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  amtLabel: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '600',
  },
  amtValue: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  tapHint: {
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 2,
  },
  overdueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  topBorder: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  overdueName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  overdueSub: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dropdownSheet: {
    width: '100%',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
  },
  dropdownTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 10,
  },
  dropdownItemActive: {
    backgroundColor: '#EFF6FF',
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  dropdownItemSub: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 1,
  },
  viewBuildingBtn: {
    marginTop: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 10,
    alignItems: 'center',
  },
  viewBuildingText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
});
