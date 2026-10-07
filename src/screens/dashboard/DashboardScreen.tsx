import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useSelectedBuilding } from '../../context/SelectedBuildingContext';
import { COLORS, PROPERTY_TYPES } from '../../constants';
import { formatCurrency, formatMonth, isOverdue } from '../../utils';
import Card from '../../components/common/Card';
import StatusBadge from '../../components/common/StatusBadge';
import SubscriptionBanner from '../../components/common/SubscriptionBanner';
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
  allUnits: { id: string; is_vacant: boolean; building_id: string; total_beds?: number }[];
  allPayments: PaymentRow[];
  allTenants: { id: string; is_active: boolean; unit_id: string; building_id: string; expected_vacate_date?: string | null; full_name: string; unit_number?: string }[];
  openMaintenanceCount: number;
  activeNoticesCount: number;
}


export default function DashboardScreen({ navigation }: Props) {
  const { user, signOut } = useAuth();
  const { selectedBuildingId, setSelectedBuildingId } = useSelectedBuilding();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    const [bldRes, unitRes, payRes, tenantRes, maintRes, noticeRes] = await Promise.all([
      supabase
        .from('buildings')
        .select('id, name, building_type, society_name, units(id, is_vacant)')
        .eq('owner_id', user.id)
        .order('name'),
      supabase
        .from('units')
        .select('id, is_vacant, building_id, total_beds')
        .eq('owner_id', user.id),
      supabase
        .from('payments')
        .select('amount_paid, advance_paid, outstanding, status, payment_month, tenant_id, tenants(full_name, is_active, units(unit_number, building_id, buildings(name, id)))')
        .eq('owner_id', user.id),
      supabase
        .from('tenants')
        .select('id, full_name, is_active, unit_id, expected_vacate_date, units(building_id, unit_number)')
        .eq('owner_id', user.id)
        .eq('is_active', true),
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
      allTenants: (tenantRes.data ?? []).map((t: any) => ({
        id: t.id,
        full_name: t.full_name,
        is_active: t.is_active,
        unit_id: t.unit_id,
        building_id: t.units?.building_id,
        unit_number: t.units?.unit_number,
        expected_vacate_date: t.expected_vacate_date,
      })),
      openMaintenanceCount: maintRes.count ?? 0,
      activeNoticesCount: noticeRes.count ?? 0,
    });

    // Auto-select first building if none selected yet
    setSelectedBuildingId(
      selectedBuildingId && allBuildings.find(b => b.id === selectedBuildingId)
        ? selectedBuildingId
        : (allBuildings[0]?.id ?? '')
    );

    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => {
    if (data) { load(true); } else { load(); }
    return () => setDropdownOpen(false);
  }, [load, data]));
  const onRefresh = async () => { setRefreshing(true); await load(true); setRefreshing(false); };

  // ── derived stats — always filtered by selected building ─────────────────
  const selectedBuilding = data?.buildings.find(b => b.id === selectedBuildingId);

  const isPGBuilding = selectedBuilding?.building_type === 'pg';
  const filteredUnits = (data?.allUnits ?? []).filter(u => u.building_id === selectedBuildingId);
  const buildingTenants = (data?.allTenants ?? []).filter(t => t.building_id === selectedBuildingId);

  const noticePeriodTenants = buildingTenants.filter(t => {
    if (!t.expected_vacate_date) return false;
    const today = new Date().toISOString().split('T')[0];
    return t.expected_vacate_date >= today;
  });

  const displayUnits = isPGBuilding
    ? filteredUnits.reduce((sum, u) => sum + (u.total_beds || 1), 0)
    : filteredUnits.length;

  // Occupied = all active tenants MINUS those on notice period
  const displayOccupied = isPGBuilding
    ? buildingTenants.length - noticePeriodTenants.length
    : filteredUnits.filter(u => !u.is_vacant).length - noticePeriodTenants.length;

  const displayVacant = Math.max(0, displayUnits - displayOccupied - noticePeriodTenants.length);

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const filteredPayments = (data?.allPayments ?? []).filter(p => {
    const bid = (p.tenants as any)?.units?.buildings?.id;
    return bid === selectedBuildingId;
  });

  const thisMonthPayments = filteredPayments.filter(p => p.payment_month === thisMonth);
  // Collected this month includes all payments (including moved-out tenants)
  const collectedThisMonth = thisMonthPayments.reduce((s, p) => s + (p.amount_paid ?? 0) + (p.advance_paid ?? 0), 0);
  // Outstanding only for active tenants (exclude moved-out tenants from pending)
  const pendingThisMonth = thisMonthPayments
    .filter(p => (p.tenants as any)?.is_active !== false)
    .reduce((s, p) => s + (p.outstanding ?? 0), 0);

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
    <View style={{ flex: 1, backgroundColor: COLORS.primaryDark }}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />

      {/* ── Blue Header ── */}
      <View style={[styles.headerPanel, { paddingTop: insets.top + 8 }]}>
        <View style={styles.appNameRow}>
          <View style={styles.appIconCircle}>
            <Ionicons name="business" size={16} color={COLORS.primaryDark} />
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

        {/* Property selector — single box, expands in-place when open */}
        <View style={[styles.dropdownBox, dropdownOpen && styles.dropdownBoxOpen]}>
          {/* Trigger row — always visible */}
          <TouchableOpacity
            style={styles.dropdownTriggerRow}
            onPress={() => setDropdownOpen(v => !v)}
            activeOpacity={0.8}
          >
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
            <Ionicons name={dropdownOpen ? 'chevron-up' : 'chevron-down'} size={16} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>

          {/* List — appears inside the same box below the trigger row */}
          {dropdownOpen && (
            <View style={styles.dropdownList}>
              {(data?.buildings ?? []).length === 0 ? (
                <Text style={styles.dropdownEmptyText}>No properties found</Text>
              ) : (
                (data?.buildings ?? []).map(item => {
                  const isSelected = selectedBuildingId === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.dropdownListItem, isSelected && styles.dropdownListItemActive]}
                      onPress={() => { setSelectedBuildingId(item.id); setDropdownOpen(false); }}
                    >
                      <Ionicons name="business-outline" size={16} color={isSelected ? COLORS.primary : 'rgba(255,255,255,0.7)'} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.dropdownListItemText, isSelected && styles.dropdownListItemTextActive]}>
                          {item.name}
                        </Text>
                        <Text style={styles.dropdownListItemSub}>
                          {getPropBadge(item.building_type)} · {item.total_units} units · {item.vacant_units} vacant
                        </Text>
                      </View>
                      {isSelected && <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}
        </View>
      </View>

      {/* ── Quick Actions ── */}
      <View style={styles.quickActionsPanel}>
        <QuickActionBtn label="Occupants" icon="people-outline" onPress={() => navigation.navigate('Tenants' as any, { preselectedBuildingId: selectedBuildingId })} />
        <QuickActionBtn label="Add Resident" icon="person-add-outline" onPress={() => navigation.navigate('AddNewTenant', { preselectedBuildingId: selectedBuildingId })} />
        <QuickActionBtn label="Record Payment" icon="cash-outline" onPress={() => navigation.navigate('OccupiedTenants', {})} />
        <QuickActionBtn label="Notices" icon="megaphone-outline" onPress={() => navigation.navigate('SocietyNotices' as any, buildingParam)} />
      </View>

      {/* ── Subscription Banner ── */}
      <SubscriptionBanner />

      {/* ── Scrollable body ── */}
      <ScrollView
        style={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* ── Stat cards ── */}
        <View style={styles.grid}>
          <StatCard
            label={isPGBuilding ? 'Total Beds' : 'Total Units'}
            value={displayUnits}
            icon="home-outline"
            color="#7C3AED"
            onPress={navToUnits}
            loading={loading}
          />
          <StatCard
            label={isPGBuilding ? 'Beds Occupied' : 'Occupied\n'}
            value={Math.max(0, displayOccupied)}
            icon="person-add"
            color={COLORS.success}
            onPress={navToOccupied}
            loading={loading}
          />
          <StatCard
            label={isPGBuilding ? 'Beds Vacant' : 'Vacant\n'}
            value={Math.max(0, displayVacant)}
            icon="key-outline"
            color="#D97706"
            onPress={() => navigation.navigate('AddNewTenant', { preselectedBuildingId: selectedBuildingId })}
            loading={loading}
          />
          <StatCard
            label="Notice Period"
            value={noticePeriodTenants.length}
            icon="time-outline"
            color="#B45309"
            onPress={() => navigation.navigate('NoticePeriodTenants' as any, buildingParam)}
            loading={loading}
          />
        </View>

        {/* ── Payment Summary of the Month ── */}
        <Card title="Payment Summary of the Month">
          <View style={styles.row}>
            <TouchableOpacity style={styles.colHalf} onPress={() => navigation.navigate('CollectedPayments', buildingParam)}>
              <Text style={styles.amtLabel}>Received (Rent + Dues)</Text>
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

        {/* ── Service Requests Link Box ── */}
        <TouchableOpacity
          style={styles.serviceBox}
          onPress={() => navigation.navigate('Maintenance' as any, buildingParam)}
          activeOpacity={0.8}
        >
          <View style={[styles.serviceIconWrap, { backgroundColor: COLORS.primaryLight }]}>
            <Ionicons name="construct" size={20} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.serviceTitle}>Service Requests</Text>
            <Text style={styles.serviceCount}>{data?.openMaintenanceCount ?? 0} Pending / In Progress</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
        </TouchableOpacity>
      </ScrollView>

    </View>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

const StatCard = ({ label, value, icon, color, onPress, loading }: any) => (
  <TouchableOpacity style={styles.statCard} onPress={onPress} activeOpacity={0.75}>
    <Text style={[styles.statLabel, { color }]}>{label}</Text>
    <View style={styles.statValueRow}>
      {loading
        ? <View style={styles.statSkeleton} />
        : <Text style={styles.statValue}>{value}</Text>
      }
      <View style={[styles.statIconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
    </View>
  </TouchableOpacity>
);

const QuickActionBtn = ({ label, icon, onPress }: any) => (
  <TouchableOpacity style={styles.qaBtn} onPress={onPress} activeOpacity={0.75}>
    <View style={styles.qaIconWrap}>
      <Ionicons name={icon} size={18} color={COLORS.primaryDark} />
    </View>
    <Text style={styles.qaLabel} numberOfLines={1}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  headerPanel: {
    backgroundColor: COLORS.primaryDark,
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
  dropdownBox: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    overflow: 'hidden',
  },
  dropdownBoxOpen: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  dropdownTriggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
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
  dropdownList: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  dropdownListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  dropdownListItemActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dropdownListItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  dropdownListItemTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  dropdownListItemSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  dropdownEmptyText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    paddingVertical: 14,
  },
  quickActionsPanel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primaryDark,
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
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  statSkeleton: {
    height: 22,
    width: 32,
    backgroundColor: COLORS.border,
    borderRadius: 4,
  },
  statIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  noticeAlertIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeAlertTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  noticeAlertSub: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
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
});
