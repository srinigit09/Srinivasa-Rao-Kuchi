import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useProperty } from '../../context/PropertyContext';
import { COLORS } from '../../constants';
import { formatCurrency, formatMonth, isOverdue, showAlert } from '../../utils';
import Card from '../../components/common/Card';
import StatusBadge from '../../components/common/StatusBadge';
import PropertySelectorSheet from '../../components/common/PropertySelectorSheet';
import { AppStackParamList } from '../../navigation/RootNavigator';
import {
  BuildingType, BUILDING_TYPE_ICON,
  isRealEstateType, PLOT_STATUS_COLOR,
} from '../../types';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList> };

const HEADER_BLUE = '#1D4ED8';

// ── Data interfaces ───────────────────────────────────────────────────────────

interface RentalStats {
  totalUnits: number;
  occupied: number;
  vacant: number;
  collectedThisMonth: number;
  pendingThisMonth: number;
  overduePayments: { tenant_name: string; unit_number: string; building_name: string; amount: number; month: string }[];
}

interface REStats {
  total: number;
  available: number;
  booked: number;
  sold: number;
  underConstruction?: number;
  totalSaleValue: number;
  totalCollected: number;
  balanceDue: number;
}

interface AllStats {
  rentalUnits: number;
  rentalOccupied: number;
  reTotal: number;
  reSold: number;
  collectedThisMonth: number;
  pendingThisMonth: number;
  totalSaleValue: number;
  totalCollected: number;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardScreen({ navigation }: Props) {
  const { user, signOut } = useAuth();
  const {
    activeProperty, allProperties,
    loadProperties, isRental, isRealEstate, isPG, isAllProperties,
  } = useProperty();
  const insets = useSafeAreaInsets();

  const [selectorOpen, setSelectorOpen]   = useState(false);
  const [rentalStats,  setRentalStats]    = useState<RentalStats | null>(null);
  const [reStats,      setREStats]        = useState<REStats | null>(null);
  const [allStats,     setAllStats]       = useState<AllStats | null>(null);
  const [refreshing,   setRefreshing]     = useState(false);

  // ── Load data based on active property ──────────────────────────────────────
  const load = useCallback(async () => {
    if (!user) return;

    if (isAllProperties) {
      // ── All Properties overview ────────────────────────────────────────────
      const [unitRes, payRes, buyerRes] = await Promise.all([
        supabase.from('units').select('id, is_vacant, plot_status, buildings(building_type)').eq('owner_id', user.id),
        supabase.from('payments').select('amount_paid, advance_paid, outstanding, status, payment_month').eq('owner_id', user.id),
        supabase.from('buyers').select('sale_price, amount_paid').eq('owner_id', user.id).eq('is_active', true),
      ]);
      const units = (unitRes.data ?? []) as any[];
      const payments = (payRes.data ?? []) as any[];
      const buyers = (buyerRes.data ?? []) as any[];
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const thisMonthPay = payments.filter((p: any) => p.payment_month === thisMonth);
      const rentalUnits = units.filter((u: any) => {
        const bt = u.buildings?.building_type as BuildingType;
        return bt === 'residential' || bt === 'pg';
      });
      const reUnits = units.filter((u: any) => isRealEstateType(u.buildings?.building_type));
      setAllStats({
        rentalUnits: rentalUnits.length,
        rentalOccupied: rentalUnits.filter((u: any) => !u.is_vacant).length,
        reTotal: reUnits.length,
        reSold: reUnits.filter((u: any) => u.plot_status === 'sold').length,
        collectedThisMonth: thisMonthPay.reduce((s: number, p: any) => s + (p.amount_paid ?? 0) + (p.advance_paid ?? 0), 0),
        pendingThisMonth: thisMonthPay.reduce((s: number, p: any) => s + (p.outstanding ?? 0), 0),
        totalSaleValue: buyers.reduce((s: number, b: any) => s + (b.sale_price ?? 0), 0),
        totalCollected: buyers.reduce((s: number, b: any) => s + (b.amount_paid ?? 0), 0),
      });

    } else if (isRealEstate && activeProperty) {
      // ── Real Estate stats for selected project ─────────────────────────────
      const [unitRes, buyerRes] = await Promise.all([
        supabase.from('units').select('id, plot_status, sale_price').eq('building_id', activeProperty.id).eq('owner_id', user.id),
        supabase.from('buyers').select('sale_price, amount_paid').eq('owner_id', user.id).eq('is_active', true)
          .in('unit_id', await supabase.from('units').select('id').eq('building_id', activeProperty.id).eq('owner_id', user.id)
            .then(r => (r.data ?? []).map((u: any) => u.id))),
      ]);
      const units  = (unitRes.data ?? []) as any[];
      const buyers = (buyerRes.data ?? []) as any[];
      setREStats({
        total:             units.length,
        available:         units.filter((u: any) => u.plot_status === 'available' || !u.plot_status).length,
        booked:            units.filter((u: any) => u.plot_status === 'booked').length,
        sold:              units.filter((u: any) => u.plot_status === 'sold').length,
        underConstruction: units.filter((u: any) => u.plot_status === 'under_construction').length,
        totalSaleValue:    units.reduce((s: number, u: any) => s + (u.sale_price ?? 0), 0),
        totalCollected:    buyers.reduce((s: number, b: any) => s + (b.amount_paid ?? 0), 0),
        balanceDue:        buyers.reduce((s: number, b: any) => s + Math.max(0, (b.sale_price ?? 0) - (b.amount_paid ?? 0)), 0),
      });

    } else if ((isRental || isPG) && activeProperty) {
      // ── Rental/PG stats for selected building ──────────────────────────────
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const [unitRes, payRes] = await Promise.all([
        supabase.from('units').select('id, is_vacant').eq('building_id', activeProperty.id).eq('owner_id', user.id),
        supabase.from('payments')
          .select('amount_paid, advance_paid, outstanding, status, payment_month, tenant_id, tenants(full_name, units(unit_number, buildings(name)))')
          .eq('owner_id', user.id),
      ]);
      const units = (unitRes.data ?? []) as any[];
      const payments = (payRes.data ?? []) as any[];
      const thisMonthPay = payments.filter((p: any) => p.payment_month === thisMonth);
      const overdue = payments
        .filter((p: any) => isOverdue(p.payment_month) && p.status !== 'Paid')
        .slice(0, 5)
        .map((p: any) => ({
          tenant_name:   p.tenants?.full_name ?? '',
          unit_number:   p.tenants?.units?.unit_number ?? '',
          building_name: p.tenants?.units?.buildings?.name ?? '',
          amount: p.outstanding ?? 0,
          month:  p.payment_month,
        }));
      setRentalStats({
        totalUnits: units.length,
        occupied: units.filter((u: any) => !u.is_vacant).length,
        vacant: units.filter((u: any) => u.is_vacant).length,
        collectedThisMonth: thisMonthPay.reduce((s: number, p: any) => s + (p.amount_paid ?? 0) + (p.advance_paid ?? 0), 0),
        pendingThisMonth: thisMonthPay.reduce((s: number, p: any) => s + (p.outstanding ?? 0), 0),
        overduePayments: overdue,
      });
    }
  }, [user, activeProperty, isRental, isPG, isRealEstate, isAllProperties]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), loadProperties()]);
    setRefreshing(false);
  };

  // ── Quick actions config ────────────────────────────────────────────────────
  const quickActions = getQuickActions(activeProperty?.building_type ?? null, activeProperty?.id ?? null, navigation);

  // ── Selector label ──────────────────────────────────────────────────────────
  const selectorLabel = activeProperty
    ? `${BUILDING_TYPE_ICON[activeProperty.building_type]}  ${activeProperty.name}`
    : `🏢  All Properties (${allProperties.length})`;

  return (
    <View style={{ flex: 1, backgroundColor: HEADER_BLUE }}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BLUE} />

      {/* ── Header ── */}
      <View style={[styles.headerPanel, { paddingTop: insets.top + 8 }]}>
        <View style={styles.appNameRow}>
          <View style={styles.appIconCircle}>
            <Ionicons name="business" size={16} color={HEADER_BLUE} />
          </View>
          <Text style={styles.appName}>PropEase</Text>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={() => showAlert('Sign Out', 'Do you want to log out?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Log Out', style: 'destructive', onPress: signOut },
            ])}
          >
            <Ionicons name="log-out-outline" size={15} color="rgba(255,255,255,0.9)" />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Property selector pill */}
        <TouchableOpacity style={styles.selectorPill} onPress={() => setSelectorOpen(true)} activeOpacity={0.8}>
          <Text style={styles.selectorLabel} numberOfLines={1}>{selectorLabel}</Text>
          <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
      </View>

      {/* ── Quick Actions ── */}
      <View style={styles.quickActionsPanel}>
        {quickActions.map(qa => (
          <TouchableOpacity key={qa.label} style={styles.qaBtn} onPress={qa.onPress} activeOpacity={0.75}>
            <View style={styles.qaIconWrap}>
              <Ionicons name={qa.icon as any} size={20} color={HEADER_BLUE} />
            </View>
            <Text style={styles.qaLabel}>{qa.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Body ── */}
      <ScrollView
        style={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {isAllProperties && allStats && <AllPropertiesBody stats={allStats} navigation={navigation} />}
        {(isRental || isPG) && rentalStats && <RentalBody stats={rentalStats} navigation={navigation} />}
        {isRealEstate && reStats && <REBody stats={reStats} activeType={activeProperty?.building_type} activePropertyId={activeProperty?.id} navigation={navigation} />}
      </ScrollView>

      {/* Property selector sheet */}
      <PropertySelectorSheet
        visible={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onAddProperty={() => navigation.navigate('AddPropertyType')}
      />
    </View>
  );
}

// ── Quick actions config ────────────────────────────────────────────────────

function getQuickActions(type: BuildingType | null, propertyId: string | null, navigation: any) {
  const addProperty = {
    label: 'Add Property', icon: 'add-circle-outline',
    onPress: () => navigation.navigate('AddPropertyType'),
  };
  const viewPlots = {
    label: 'View Plots', icon: 'map-outline',
    onPress: () => propertyId
      ? navigation.navigate('Plots', { buildingId: propertyId })
      : navigation.navigate('Properties'),
  };
  if (!type || type === 'residential') return [
    { label: 'Add Tenant',      icon: 'person-add-outline',  onPress: () => navigation.navigate('AddTenantStep1') },
    { label: 'Record Payment',  icon: 'cash-outline',        onPress: () => navigation.navigate('Tenants') },
    { label: 'Vacant Units',    icon: 'key-outline',         onPress: () => navigation.navigate('VacantUnits', {}) },
    addProperty,
  ];
  if (type === 'pg') return [
    { label: 'Add Tenant',      icon: 'person-add-outline',  onPress: () => navigation.navigate('AddTenantStep1') },
    { label: 'Record Payment',  icon: 'cash-outline',        onPress: () => navigation.navigate('Tenants') },
    { label: 'Free Beds',       icon: 'bed-outline',         onPress: () => navigation.navigate('VacantUnits', {}) },
    addProperty,
  ];
  if (type === 'open_plots' || type === 'farm_land') return [
    viewPlots,
    { label: 'All Buyers',      icon: 'people-outline',      onPress: () => navigation.navigate('Buyers') },
    { label: 'Land Reports',    icon: 'bar-chart-outline',   onPress: () => navigation.navigate('LandReports') },
    addProperty,
  ];
  if (type === 'housing_villa') return [
    viewPlots,
    { label: 'All Buyers',      icon: 'people-outline',      onPress: () => navigation.navigate('Buyers') },
    { label: 'Land Reports',    icon: 'bar-chart-outline',   onPress: () => navigation.navigate('LandReports') },
    addProperty,
  ];
  return [addProperty];
}

// ── Body components ───────────────────────────────────────────────────────────

function AllPropertiesBody({ stats, navigation }: { stats: AllStats; navigation: any }) {
  return (
    <>
      <View style={styles.grid}>
        <StatCard label="Rental Units"  value={stats.rentalUnits}   icon="home"        color="#7C3AED" />
        <StatCard label="Occupied"      value={stats.rentalOccupied} icon="person"     color={COLORS.success} />
        <StatCard label="RE Plots"      value={stats.reTotal}        icon="map-outline" color="#D97706" />
        <StatCard label="Sold"          value={stats.reSold}         icon="checkmark-circle-outline" color="#DC2626" />
      </View>

      <Card title="This Month — Rental Collections">
        <View style={styles.row}>
          <TouchableOpacity style={styles.colHalf} onPress={() => navigation.navigate('CollectedPayments', {})}>
            <Text style={styles.amtLabel}>Received</Text>
            <Text style={[styles.amtValue, { color: COLORS.success }]}>{formatCurrency(stats.collectedThisMonth)}</Text>
            <Text style={styles.tapHint}>tap for details ›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.colHalf, styles.borderLeft]} onPress={() => navigation.navigate('Outstanding', {})}>
            <Text style={styles.amtLabel}>Outstanding</Text>
            <Text style={[styles.amtValue, { color: '#D97706' }]}>{formatCurrency(stats.pendingThisMonth)}</Text>
            <Text style={styles.tapHint}>tap for details ›</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {stats.totalSaleValue > 0 && (
        <Card title="Real Estate — Sales Summary">
          <View style={styles.row}>
            <View style={styles.colHalf}>
              <Text style={styles.amtLabel}>Total Collected</Text>
              <Text style={[styles.amtValue, { color: COLORS.success }]}>{formatCurrency(stats.totalCollected)}</Text>
            </View>
            <View style={[styles.colHalf, styles.borderLeft]}>
              <Text style={styles.amtLabel}>Balance Due</Text>
              <Text style={[styles.amtValue, { color: '#D97706' }]}>
                {formatCurrency(stats.totalSaleValue - stats.totalCollected)}
              </Text>
            </View>
          </View>
        </Card>
      )}
    </>
  );
}

function RentalBody({ stats, navigation }: { stats: RentalStats; navigation: any }) {
  return (
    <>
      {stats.overduePayments.length > 0 && (
        <TouchableOpacity style={styles.alertBanner} onPress={() => navigation.navigate('Outstanding', {})}>
          <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
          <Text style={styles.alertText}>
            {stats.overduePayments.length} overdue payment{stats.overduePayments.length > 1 ? 's' : ''} — tap to view
          </Text>
          <Ionicons name="chevron-forward" size={14} color={COLORS.danger} />
        </TouchableOpacity>
      )}
      <View style={styles.grid}>
        <StatCard label="Total Units" value={stats.totalUnits} icon="home"   color="#7C3AED" onPress={() => navigation.navigate('AllUnits', {})} />
        <StatCard label="Occupied"    value={stats.occupied}   icon="person" color={COLORS.success} onPress={() => navigation.navigate('OccupiedTenants', {})} />
        <StatCard label="Vacant"      value={stats.vacant}     icon="key"    color="#D97706" onPress={() => navigation.navigate('VacantUnits', {})} />
      </View>
      <Card title="This Month's Payment Summary">
        <View style={styles.row}>
          <TouchableOpacity style={styles.colHalf} onPress={() => navigation.navigate('CollectedPayments', {})}>
            <Text style={styles.amtLabel}>Received</Text>
            <Text style={[styles.amtValue, { color: COLORS.success }]}>{formatCurrency(stats.collectedThisMonth)}</Text>
            <Text style={styles.tapHint}>tap for details ›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.colHalf, styles.borderLeft]} onPress={() => navigation.navigate('Outstanding', {})}>
            <Text style={styles.amtLabel}>Outstanding</Text>
            <Text style={[styles.amtValue, { color: '#D97706' }]}>{formatCurrency(stats.pendingThisMonth)}</Text>
            <Text style={styles.tapHint}>tap for details ›</Text>
          </TouchableOpacity>
        </View>
      </Card>
      {stats.overduePayments.length > 0 && (
        <Card title="Overdue Payments">
          {stats.overduePayments.map((p, i) => (
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
    </>
  );
}

function REBody({ stats, activeType, activePropertyId, navigation }: { stats: REStats; activeType?: BuildingType; activePropertyId?: string; navigation: any }) {
  const isHousingVilla = activeType === 'housing_villa';
  const goPlots = () => activePropertyId
    ? navigation.navigate('Plots', { buildingId: activePropertyId })
    : navigation.navigate('Properties');
  return (
    <>
      <View style={[styles.grid, { flexWrap: 'wrap' }]}>
        <StatCard label="Total"     value={stats.total}     icon="map-outline"              color="#1D4ED8" onPress={goPlots} />
        <StatCard label="Available" value={stats.available} icon="checkmark-circle-outline"  color={PLOT_STATUS_COLOR.available} onPress={goPlots} />
        <StatCard label="Booked"    value={stats.booked}    icon="bookmark-outline"           color={PLOT_STATUS_COLOR.booked} onPress={goPlots} />
        <StatCard label="Sold"      value={stats.sold}      icon="ribbon-outline"             color={PLOT_STATUS_COLOR.sold} onPress={() => navigation.navigate('Buyers')} />
        {isHousingVilla && (
          <StatCard label="Under Const." value={stats.underConstruction ?? 0} icon="construct-outline" color={PLOT_STATUS_COLOR.under_construction} onPress={goPlots} />
        )}
      </View>

      <Card title="Sales Summary">
        <View style={styles.row}>
          <View style={styles.colHalf}>
            <Text style={styles.amtLabel}>Total Value</Text>
            <Text style={[styles.amtValue, { color: COLORS.primary }]}>{formatCurrency(stats.totalSaleValue)}</Text>
          </View>
          <View style={[styles.colHalf, styles.borderLeft]}>
            <Text style={styles.amtLabel}>Collected</Text>
            <Text style={[styles.amtValue, { color: COLORS.success }]}>{formatCurrency(stats.totalCollected)}</Text>
          </View>
        </View>
        <View style={[styles.row, { borderTopWidth: 1, borderTopColor: COLORS.border }]}>
          <TouchableOpacity style={styles.colHalf} onPress={() => navigation.navigate('Buyers')}>
            <Text style={styles.amtLabel}>Balance Due</Text>
            <Text style={[styles.amtValue, { color: '#D97706' }]}>{formatCurrency(stats.balanceDue)}</Text>
            <Text style={styles.tapHint}>tap for details ›</Text>
          </TouchableOpacity>
          <View style={[styles.colHalf, styles.borderLeft]}>
            <Text style={styles.amtLabel}>% Sold</Text>
            <Text style={[styles.amtValue, { color: PLOT_STATUS_COLOR.sold }]}>
              {stats.total > 0 ? Math.round((stats.sold / stats.total) * 100) : 0}%
            </Text>
          </View>
        </View>
      </Card>
    </>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────

const StatCard = ({ label, value, icon, color, onPress }: any) => (
  <TouchableOpacity
    style={styles.statCard}
    onPress={onPress}
    activeOpacity={onPress ? 0.75 : 1}
    disabled={!onPress}
  >
    <Text style={[styles.statLabel, { color }]}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
    <View style={[styles.statIconWrap, { backgroundColor: color + '18' }]}>
      <Ionicons name={icon} size={14} color={color} />
    </View>
  </TouchableOpacity>
);

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  headerPanel: {
    backgroundColor: HEADER_BLUE,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  appNameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
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

  selectorPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
  },
  selectorLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: '#fff' },

  quickActionsPanel: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: '#1640B8', paddingVertical: 12, paddingHorizontal: 8,
  },
  qaBtn: { alignItems: 'center', gap: 5, flex: 1 },
  qaIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  qaLabel: { fontSize: 10, color: 'rgba(255,255,255,0.93)', textAlign: 'center', fontWeight: '600' },

  body: { flex: 1, backgroundColor: COLORS.bg },

  alertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.dangerLight, marginHorizontal: 14, marginTop: 12,
    padding: 10, borderRadius: 10,
  },
  alertText: { flex: 1, color: COLORS.danger, fontSize: 12, fontWeight: '500' },

  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 10, marginTop: 12, gap: 8,
  },
  statCard: {
    flex: 1, minWidth: '22%',
    backgroundColor: COLORS.white, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 8,
    alignItems: 'center', gap: 3,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  statLabel: { fontSize: 11, fontWeight: '800', textAlign: 'center', letterSpacing: 0.1 },
  statValue: { fontSize: 26, fontWeight: '900', color: COLORS.text, lineHeight: 30 },
  statIconWrap: {
    width: 26, height: 26, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },

  row: { flexDirection: 'row' },
  colHalf: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  borderLeft: { borderLeftWidth: 1, borderLeftColor: COLORS.border },
  amtLabel: { fontSize: 12, color: COLORS.muted, marginBottom: 4, fontWeight: '500' },
  amtValue: { fontSize: 20, fontWeight: '700' },
  tapHint: { fontSize: 10, color: COLORS.primary, marginTop: 4 },

  overdueRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 10 },
  topBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  overdueName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  overdueSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
});
