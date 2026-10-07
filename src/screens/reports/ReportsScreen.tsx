import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  TextInput, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, PROPERTY_TYPES } from '../../constants';
import { Payment, BuildingType } from '../../types';
import { formatCurrency, formatMonth } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';
import StatusBadge from '../../components/common/StatusBadge';
import Card from '../../components/common/Card';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList> };
type FilterKey = 'thisMonth' | 'lastQuarter' | '6months' | '1year' | 'custom';

interface BuildingSummary {
  id: string;
  name: string;
  building_type: BuildingType;
  total_units: number;
  vacant_units: number;
}

interface MonthlySummary {
  month: string;
  total_due: number;
  total_collected: number;
  total_outstanding: number;
  paid_count: number;
  partial_count: number;
  pending_count: number;
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'thisMonth',    label: 'This Month'    },
  { key: 'lastQuarter',  label: 'Last Quarter'  },
  { key: '6months',      label: '6 Months'      },
  { key: '1year',        label: '1 Year'        },
  { key: 'custom',       label: 'Custom'        },
];


function getDateRange(filter: FilterKey, customFrom: string, customTo: string) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;

  switch (filter) {
    case 'thisMonth':   return { from: ymd(now), to: ymd(now) };
    case 'lastQuarter': return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to: ymd(now) };
    case '6months':     return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 5, 1)), to: ymd(now) };
    case '1year':       return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 11, 1)), to: ymd(now) };
    case 'custom':      return { from: customFrom || ymd(now), to: customTo || ymd(now) };
  }
}

export default function ReportsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [selectedFilter, setSelectedFilter] = useState<FilterKey>('thisMonth');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Buildings dropdown state
  const [buildings, setBuildings] = useState<BuildingSummary[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('ALL');
  const [buildingDropdown, setBuildingDropdown] = useState(false);

  // Data
  const [monthlySummaries, setMonthlySummaries] = useState<MonthlySummary[]>([]);
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);

  // Totals
  const [totalCollected, setTotalCollected] = useState(0);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [totalDue, setTotalDue] = useState(0);
  const [paidCount, setPaidCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  const loadData = useCallback(async () => {
    if (!user) return;
    const { from, to } = getDateRange(selectedFilter, customFrom, customTo);

    // Fetch buildings list
    const { data: bldData } = await supabase
      .from('buildings')
      .select('id, name, building_type, units(id, is_vacant)')
      .eq('owner_id', user.id)
      .order('name');

    const blds: BuildingSummary[] = (bldData ?? []).map((b: any) => ({
      id: b.id,
      name: b.name,
      building_type: b.building_type,
      total_units: b.units?.length ?? 0,
      vacant_units: b.units?.filter((u: any) => u.is_vacant).length ?? 0,
    }));
    setBuildings(blds);

    // Fetch payments
    let query = supabase
      .from('payments')
      .select(`
        id, amount_due, amount_paid, advance_paid, outstanding, status,
        payment_month, payment_date, payment_mode, notes, receipt_number,
        electricity, water, maintenance_charge, other_charges,
        tenants (
          full_name, phone,
          units (
            unit_number,
            buildings ( id, name )
          )
        )
      `)
      .eq('owner_id', user.id)
      .gte('payment_month', from)
      .lte('payment_month', to)
      .order('payment_month', { ascending: false });

    const { data: paymentsData, error } = await query;
    if (error) { console.error(error); return; }

    const allPayments: Payment[] = (paymentsData ?? []).map((p: any) => ({
      id: p.id,
      owner_id: user.id,
      tenant_id: p.tenant_id,
      payment_month: p.payment_month,
      amount_due: p.amount_due,
      amount_paid: p.amount_paid,
      advance_paid: p.advance_paid ?? 0,
      payment_date: p.payment_date,
      payment_mode: p.payment_mode,
      electricity: p.electricity ?? 0,
      water: p.water ?? 0,
      maintenance_charge: p.maintenance_charge ?? 0,
      other_charges: p.other_charges ?? 0,
      other_label: p.other_label,
      outstanding: p.outstanding,
      status: p.status,
      notes: p.notes,
      receipt_number: p.receipt_number,
      created_at: '',
      tenant_name: p.tenants?.full_name ?? '—',
      tenant_phone: p.tenants?.phone ?? '',
      unit_number: p.tenants?.units?.unit_number ?? '—',
      building_name: p.tenants?.units?.buildings?.name ?? '—',
      _building_id: p.tenants?.units?.buildings?.id ?? '',
    } as any));

    // Filter by selected building if not ALL
    const filteredPayments = (selectedBuildingId && selectedBuildingId !== 'ALL')
      ? allPayments.filter((p: any) => p._building_id === selectedBuildingId)
      : allPayments;

    // Aggregate monthly
    const monthMap = new Map<string, MonthlySummary>();
    let col = 0, out = 0, due = 0, paid = 0, pend = 0;

    filteredPayments.forEach((p) => {
      const m = p.payment_month.substring(0, 7) + '-01';
      const existing = monthMap.get(m) ?? {
        month: m,
        total_due: 0,
        total_collected: 0,
        total_outstanding: 0,
        paid_count: 0,
        partial_count: 0,
        pending_count: 0,
      };

      const collected = (p.amount_paid ?? 0) + (p.advance_paid ?? 0);
      existing.total_due += p.amount_due ?? 0;
      existing.total_collected += collected;
      existing.total_outstanding += p.outstanding ?? 0;
      if (p.status === 'Paid') existing.paid_count++;
      else if (p.status === 'Partial') existing.partial_count++;
      else existing.pending_count++;

      monthMap.set(m, existing);

      col += collected;
      out += p.outstanding ?? 0;
      due += p.amount_due ?? 0;
      if (p.status === 'Paid') paid++;
      else pend++;
    });

    const sortedSummaries = Array.from(monthMap.values()).sort(
      (a, b) => b.month.localeCompare(a.month)
    );

    setMonthlySummaries(sortedSummaries);
    setRecentPayments(filteredPayments.slice(0, 10));
    setTotalCollected(col);
    setTotalOutstanding(out);
    setTotalDue(due);
    setPaidCount(paid);
    setPendingCount(pend);
  }, [user, selectedFilter, customFrom, customTo, selectedBuildingId]);

  useFocusEffect(useCallback(() => { loadData(); return () => setBuildingDropdown(false); }, [loadData]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleFilterSelect = (key: FilterKey) => {
    if (key === 'custom') {
      setShowModal(true);
    } else {
      setSelectedFilter(key);
    }
  };

  const collectionRate = totalDue > 0 ? Math.min(100, Math.round((totalCollected / totalDue) * 100)) : 0;
  const selectedBuilding = buildings.find(b => b.id === selectedBuildingId);
  const dropdownLabel = selectedBuildingId === 'ALL'
    ? 'All Properties / Societies'
    : (selectedBuilding?.name ?? 'Select Property');

  const getPropBadge = (type?: BuildingType) => {
    const p = PROPERTY_TYPES.find(x => x.id === type);
    return p ? p.badge : '🏢 Property';
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.primaryDark }}>
      {/* Blue Header */}
      <View style={[styles.headerPanel, { paddingTop: insets.top + 8 }]}>
        <View style={styles.appNameRow}>
          <Text style={styles.appName}>Reports & Analytics</Text>
        </View>

        {/* Property selector — single box, expands in-place */}
        <View style={styles.dropdownBox}>
          <TouchableOpacity style={styles.dropdownTriggerRow} onPress={() => setBuildingDropdown(v => !v)} activeOpacity={0.8}>
            <Ionicons name="business" size={16} color="#fff" />
            <Text style={styles.dropdownLabel} numberOfLines={1}>{dropdownLabel}</Text>
            <Ionicons name={buildingDropdown ? 'chevron-up' : 'chevron-down'} size={16} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
          {buildingDropdown && (
            <View style={styles.dropdownList}>
              <TouchableOpacity
                style={[styles.dropdownListItem, selectedBuildingId === 'ALL' && styles.dropdownListItemActive]}
                onPress={() => { setSelectedBuildingId('ALL'); setBuildingDropdown(false); }}
              >
                <Ionicons name="globe-outline" size={16} color="rgba(255,255,255,0.8)" />
                <Text style={[styles.dropdownListItemText, selectedBuildingId === 'ALL' && styles.dropdownListItemTextActive]}>
                  All Properties / Societies
                </Text>
                {selectedBuildingId === 'ALL' && <Ionicons name="checkmark-circle" size={16} color="#fff" />}
              </TouchableOpacity>
              {buildings.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.dropdownListItem, selectedBuildingId === item.id && styles.dropdownListItemActive]}
                  onPress={() => { setSelectedBuildingId(item.id); setBuildingDropdown(false); }}
                >
                  <Ionicons name="business-outline" size={16} color="rgba(255,255,255,0.8)" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dropdownListItemText, selectedBuildingId === item.id && styles.dropdownListItemTextActive]}>{item.name}</Text>
                    <Text style={styles.dropdownListItemSub}>
                      {getPropBadge(item.building_type)} · {item.total_units} units · {item.vacant_units} vacant
                    </Text>
                  </View>
                  {selectedBuildingId === item.id && <Ionicons name="checkmark-circle" size={16} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Time Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
        >
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.filterTab,
                selectedFilter === f.key && styles.filterTabActive,
              ]}
              onPress={() => handleFilterSelect(f.key)}
            >
              <Text
                style={[
                  styles.filterTabText,
                  selectedFilter === f.key && styles.filterTabTextActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Main Content */}
      <ScrollView
        style={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* KPI Grid */}
        <View style={styles.grid}>
          <View style={[styles.kpiCard, { borderColor: COLORS.success }]}>
            <Text style={[styles.kpiLabel, { color: COLORS.success }]}>Collected</Text>
            <Text style={styles.kpiValue}>{formatCurrency(totalCollected)}</Text>
            <Text style={styles.kpiSub}>{paidCount} paid</Text>
          </View>
          <View style={[styles.kpiCard, { borderColor: '#D97706' }]}>
            <Text style={[styles.kpiLabel, { color: '#D97706' }]}>Outstanding</Text>
            <Text style={[styles.kpiValue, { color: '#D97706' }]}>{formatCurrency(totalOutstanding)}</Text>
            <Text style={styles.kpiSub}>{pendingCount} pending</Text>
          </View>
        </View>

        {/* Collection Efficiency Banner */}
        <Card>
          <View style={styles.efficiencyRow}>
            <View>
              <Text style={styles.efficiencyLabel}>Collection Rate</Text>
              <Text style={styles.efficiencyValue}>{collectionRate}%</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${collectionRate}%` }]} />
              </View>
              <Text style={styles.progressHint}>
                {formatCurrency(totalCollected)} of {formatCurrency(totalDue)} total dues
              </Text>
            </View>
          </View>
        </Card>

        {/* Monthly Breakdown Table */}
        <Card title="Monthly Breakdown">
          {monthlySummaries.length === 0 ? (
            <Text style={styles.emptyText}>No data for this time range.</Text>
          ) : (
            monthlySummaries.map((s, idx) => (
              <View key={s.month} style={[styles.breakdownRow, idx > 0 && styles.topBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.monthName}>{formatMonth(s.month)}</Text>
                  <Text style={styles.monthSub}>
                    {s.paid_count} paid · {s.partial_count + s.pending_count} pending
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.monthCollected, { color: COLORS.success }]}>
                    +{formatCurrency(s.total_collected)}
                  </Text>
                  {s.total_outstanding > 0 && (
                    <Text style={[styles.monthOutstanding, { color: '#D97706' }]}>
                      {formatCurrency(s.total_outstanding)} due
                    </Text>
                  )}
                </View>
              </View>
            ))
          )}
        </Card>

        {/* Recent Transactions */}
        <Card title="Recent Transactions">
          {recentPayments.length === 0 ? (
            <Text style={styles.emptyText}>No payments recorded yet.</Text>
          ) : (
            recentPayments.map((p, idx) => (
              <View key={p.id} style={[styles.txRow, idx > 0 && styles.topBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txTenant}>{p.tenant_name}</Text>
                  <Text style={styles.txMeta}>
                    {p.building_name} · {p.unit_number} · {formatMonth(p.payment_month)}
                  </Text>
                  {p.payment_date && (
                    <Text style={styles.txDate}>
                      {new Date(p.payment_date).toLocaleDateString()} · {p.payment_mode ?? 'Cash'}
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={styles.txAmount}>{formatCurrency(p.amount_paid + (p.advance_paid ?? 0))}</Text>
                  <StatusBadge status={p.status} />
                </View>
              </View>
            ))
          )}
        </Card>
      </ScrollView>

      {/* Custom Date Range Modal */}
      <Modal visible={showModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowModal(false)} />
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Custom Date Range</Text>
            <Text style={styles.modalHint}>Format: YYYY-MM-01 (e.g. 2025-01-01)</Text>

            <Text style={styles.modalLabel}>From Month</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="2024-01-01"
              value={customFrom}
              onChangeText={setCustomFrom}
            />

            <Text style={styles.modalLabel}>To Month</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="2025-01-01"
              value={customTo}
              onChangeText={setCustomTo}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }]}
                onPress={() => setShowModal(false)}
              >
                <Text style={{ fontWeight: '600', color: COLORS.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: COLORS.primary }]}
                onPress={() => {
                  setSelectedFilter('custom');
                  setShowModal(false);
                }}
              >
                <Text style={{ fontWeight: '700', color: '#fff' }}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  headerPanel: {
    backgroundColor: COLORS.primaryDark,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  appNameRow: {
    marginBottom: 8,
  },
  appName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 8,
    marginBottom: 10,
  },
  dropdownLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  filterScroll: {
    marginTop: 2,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  filterTabActive: {
    backgroundColor: '#fff',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  filterTabTextActive: {
    color: COLORS.primaryDark,
    fontWeight: '800',
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
    marginBottom: 10,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 4,
  },
  kpiSub: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 2,
  },
  efficiencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  efficiencyLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.muted,
  },
  efficiencyValue: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primary,
    marginTop: 2,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  progressHint: {
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 4,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  topBorder: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  monthName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  monthSub: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 2,
  },
  monthCollected: {
    fontSize: 14,
    fontWeight: '700',
  },
  monthOutstanding: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  txTenant: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  txMeta: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 2,
  },
  txDate: {
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
    paddingVertical: 14,
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  dropdownBox: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 6,
  },
  dropdownTriggerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  dropdownList: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' },
  dropdownListItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  dropdownListItemActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  dropdownListItemText: { flex: 1, fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  dropdownListItemTextActive: { color: '#fff', fontWeight: '700' },
  dropdownListItemSub: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  modalBox: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: 18,
    paddingBottom: 36,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  modalHint: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 12,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 8,
    marginBottom: 4,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: COLORS.text,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
});
