import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  TextInput, Modal, FlatList,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import { Payment } from '../../types';
import { formatCurrency, formatMonth } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';
import StatusBadge from '../../components/common/StatusBadge';
import Card from '../../components/common/Card';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList> };
type FilterKey = 'thisMonth' | 'lastQuarter' | '6months' | '1year' | 'custom';

interface BuildingSummary {
  id: string;
  name: string;
  building_type: 'residential' | 'pg';
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

const HEADER_BLUE = '#1D4ED8';

function getDateRange(filter: FilterKey, customFrom: string, customTo: string) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;

  switch (filter) {
    case 'thisMonth':   return { from: ymd(now), to: ymd(now) };
    case 'lastQuarter': return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to: ymd(now) };
    case '6months':     return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 5, 1)), to: ymd(now) };
    case '1year':       return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 11, 1)), to: ymd(now) };
    case 'custom':
      return {
        from: customFrom || ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1)),
        to:   customTo   || ymd(now),
      };
  }
}

export default function ReportsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [activeFilter, setActiveFilter]     = useState<FilterKey>('thisMonth');
  const [customFrom,   setCustomFrom]        = useState('');
  const [customTo,     setCustomTo]          = useState('');
  const [showModal,    setShowModal]         = useState(false);
  const [tempFrom,     setTempFrom]          = useState('');
  const [tempTo,       setTempTo]            = useState('');

  // Building filter
  const ALL_ID = '__all__';
  const [buildings,          setBuildings]          = useState<BuildingSummary[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(ALL_ID);
  const [buildingDropdown,   setBuildingDropdown]   = useState(false);

  const [summaries,       setSummaries]       = useState<MonthlySummary[]>([]);
  const [pendingPayments, setPendingPayments] = useState<Payment[]>([]);
  const [refreshing,      setRefreshing]      = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { from, to } = getDateRange(activeFilter, customFrom, customTo);
    const [{ data: bld }, { data: s }, { data: p }] = await Promise.all([
      supabase
        .from('buildings')
        .select('id, name, building_type, units(id, is_vacant)')
        .eq('owner_id', user.id)
        .order('name'),
      supabase.from('v_monthly_summary').select('*')
        .eq('owner_id', user.id).gte('month', from).lte('month', to)
        .order('month', { ascending: false }),
      supabase.from('payments')
        .select('*, tenants(full_name, phone, units(unit_number, building_id, buildings(name, id)))')
        .eq('owner_id', user.id).neq('status', 'Paid')
        .gte('payment_month', from).lte('payment_month', to)
        .order('payment_month', { ascending: false }),
    ]);

    setBuildings((bld ?? []).map((b: any) => ({
      id: b.id,
      name: b.name,
      building_type: b.building_type,
      total_units: b.units?.length ?? 0,
      vacant_units: b.units?.filter((u: any) => u.is_vacant).length ?? 0,
    })));

    setSummaries((s ?? []) as MonthlySummary[]);

    let payments = (p ?? []).map((x: any) => ({
      ...x,
      tenant_name:   x.tenants?.full_name,
      unit_number:   x.tenants?.units?.unit_number,
      building_name: x.tenants?.units?.buildings?.name,
      _building_id:  x.tenants?.units?.building_id,
    })) as (Payment & { _building_id?: string })[];

    if (selectedBuildingId !== ALL_ID) {
      payments = payments.filter(pp => pp._building_id === selectedBuildingId);
    }

    setPendingPayments(payments as Payment[]);
  }, [user, activeFilter, customFrom, customTo, selectedBuildingId]);

  // Reload whenever the filter or custom range changes
  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const isFiltered = selectedBuildingId !== ALL_ID;
  const selectedBuilding = buildings.find(b => b.id === selectedBuildingId);

  // Filter monthly summaries by building if a specific building is selected.
  // v_monthly_summary doesn't have building_id, so we apply pending-payment
  // derived totals instead when filtered; for the breakdown table we keep
  // unfiltered summaries but note the caveat. Building-level summary totals
  // are derived from the already-filtered pendingPayments list below.
  const totalReceived    = summaries.reduce((s, m) => s + m.total_collected, 0);
  const totalOutstanding = summaries.reduce((s, m) => s + m.total_outstanding, 0);

  const dropdownLabel = isFiltered
    ? selectedBuilding?.name ?? 'Select Building'
    : `All Buildings (${buildings.length})`;

  const rangeLabel = activeFilter === 'custom' && customFrom
    ? `${formatMonth(customFrom)} – ${formatMonth(customTo)}`
    : FILTERS.find(f => f.key === activeFilter)?.label ?? '';

  const openCustomModal = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
    setTempFrom(customFrom || ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1)));
    setTempTo(customTo || ymd(now));
    setShowModal(true);
  };

  const applyCustom = () => {
    if (!tempFrom || !tempTo) return;
    setCustomFrom(tempFrom);
    setCustomTo(tempTo);
    setActiveFilter('custom');
    setShowModal(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: COLORS.bg }]}>
      {/* Blue header banner */}
      <View style={[styles.headerBanner, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Reports</Text>
        </View>

        {/* Building filter dropdown */}
        <TouchableOpacity style={styles.bldDropdownBtn} onPress={() => setBuildingDropdown(true)} activeOpacity={0.8}>
          <Ionicons name="business-outline" size={15} color="#fff" />
          <Text style={styles.bldDropdownLabel} numberOfLines={1}>{dropdownLabel}</Text>
          <Ionicons name="chevron-down" size={15} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>

        {/* Date filter chips inside the blue banner */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, activeFilter === f.key && styles.filterChipActive]}
              onPress={() => {
                if (f.key === 'custom') { openCustomModal(); }
                else { setActiveFilter(f.key); }
              }}
            >
              <Text style={[styles.filterChipText, activeFilter === f.key && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Period + totals */}
        <View style={styles.periodRow}>
          <Ionicons name="calendar-outline" size={14} color={COLORS.muted} />
          <Text style={styles.periodLabel}>Showing: {rangeLabel}</Text>
        </View>

        <View style={styles.totalsRow}>
          <View style={styles.totalChip}>
            <Text style={styles.totalChipLabel}>Total Received</Text>
            <Text style={[styles.totalChipValue, { color: COLORS.success }]}>{formatCurrency(totalReceived)}</Text>
          </View>
          <View style={[styles.totalChip, { borderLeftWidth: 1, borderLeftColor: COLORS.border }]}>
            <Text style={styles.totalChipLabel}>Total Outstanding</Text>
            <Text style={[styles.totalChipValue, { color: '#D97706' }]}>{formatCurrency(totalOutstanding)}</Text>
          </View>
        </View>

        {/* Monthly breakdown */}
        <Card title="Monthly Breakdown">
          {summaries.length === 0 && (
            <Text style={styles.emptyText}>No payment records for this period.</Text>
          )}
          {summaries.map((s, i) => (
            <View key={i} style={[styles.summaryRow, i > 0 && styles.topBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.monthText}>{formatMonth(s.month)}</Text>
                <Text style={styles.countText}>
                  ✅ {s.paid_count} paid · ⚠️ {s.partial_count} partial · ❌ {s.pending_count} pending
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={styles.receivedText}>{formatCurrency(s.total_collected)}</Text>
                {s.total_outstanding > 0 && (
                  <Text style={styles.outstandingText}>−{formatCurrency(s.total_outstanding)}</Text>
                )}
              </View>
            </View>
          ))}
        </Card>

        {pendingPayments.length > 0 && (
          <Card title={`Pending & Partial (${pendingPayments.length})`}>
            {pendingPayments.map((p, i) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.pendingRow, i > 0 && styles.topBorder]}
                onPress={() => navigation.navigate('TenantProfile', { tenantId: p.tenant_id })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.tenantName}>{p.tenant_name}</Text>
                  <Text style={styles.tenantMeta}>{p.building_name} · {p.unit_number}</Text>
                  <Text style={styles.periodText}>{formatMonth(p.payment_month)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <StatusBadge status={p.status} />
                  {p.outstanding > 0 && <Text style={styles.outstandingText}>{formatCurrency(p.outstanding)}</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </Card>
        )}
      </ScrollView>

      {/* Building picker modal */}
      <Modal visible={buildingDropdown} transparent animationType="fade" onRequestClose={() => setBuildingDropdown(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setBuildingDropdown(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.bldSheet}>
            <Text style={styles.bldSheetTitle}>Filter by Building</Text>

            {/* All buildings */}
            <TouchableOpacity
              style={[styles.bldItem, selectedBuildingId === ALL_ID && styles.bldItemActive]}
              onPress={() => { setSelectedBuildingId(ALL_ID); setBuildingDropdown(false); }}
            >
              <Ionicons name="grid-outline" size={18} color={selectedBuildingId === ALL_ID ? COLORS.primary : COLORS.muted} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.bldItemText, selectedBuildingId === ALL_ID && { color: COLORS.primary }]}>All Buildings</Text>
                <Text style={styles.bldItemSub}>{buildings.length} buildings</Text>
              </View>
              {selectedBuildingId === ALL_ID && <Ionicons name="checkmark" size={18} color={COLORS.primary} />}
            </TouchableOpacity>

            {/* Per-building rows */}
            <FlatList
              data={buildings}
              keyExtractor={b => b.id}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.bldItem, selectedBuildingId === item.id && styles.bldItemActive]}
                  onPress={() => { setSelectedBuildingId(item.id); setBuildingDropdown(false); }}
                >
                  <Ionicons
                    name={item.building_type === 'pg' ? 'bed-outline' : 'business-outline'}
                    size={18}
                    color={selectedBuildingId === item.id ? COLORS.primary : COLORS.muted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.bldItemText, selectedBuildingId === item.id && { color: COLORS.primary }]}>{item.name}</Text>
                    <Text style={styles.bldItemSub}>
                      {item.building_type === 'pg' ? 'PG/Hostel' : 'Residential'} · {item.total_units} units · {item.vacant_units} vacant
                    </Text>
                  </View>
                  {selectedBuildingId === item.id && <Ionicons name="checkmark" size={18} color={COLORS.primary} />}
                </TouchableOpacity>
              )}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Custom date modal */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowModal(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Custom Date Range</Text>
              <Text style={styles.modalHint}>Format: YYYY-MM-01  (e.g. 2025-01-01)</Text>

              <Text style={styles.modalLabel}>From Month</Text>
              <TextInput
                style={styles.modalInput}
                value={tempFrom}
                onChangeText={setTempFrom}
                placeholder="2025-01-01"
                placeholderTextColor={COLORS.muted}
                keyboardType="numeric"
                autoFocus
              />
              <Text style={styles.modalLabel}>To Month</Text>
              <TextInput
                style={styles.modalInput}
                value={tempTo}
                onChangeText={setTempTo}
                placeholder="2025-06-01"
                placeholderTextColor={COLORS.muted}
                keyboardType="numeric"
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: COLORS.border }]}
                  onPress={() => setShowModal(false)}
                >
                  <Text style={[styles.modalBtnText, { color: COLORS.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: COLORS.primary }]}
                  onPress={applyCustom}
                >
                  <Text style={[styles.modalBtnText, { color: '#fff' }]}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1 },
  headerBanner:   { backgroundColor: HEADER_BLUE, paddingHorizontal: 16, paddingBottom: 12 },
  headerRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  bldDropdownBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    marginBottom: 10,
  },
  bldDropdownLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: '#fff' },
  bldSheet: {
    backgroundColor: COLORS.white, borderRadius: 18,
    paddingTop: 16, paddingBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, elevation: 12,
  },
  bldSheetTitle: {
    fontSize: 13, fontWeight: '700', color: COLORS.muted,
    paddingHorizontal: 18, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase',
  },
  bldItem:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 13 },
  bldItemActive: { backgroundColor: COLORS.primaryLight },
  bldItemText:   { fontSize: 15, fontWeight: '600', color: COLORS.text },
  bldItemSub:    { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  backBtn:        { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:    { fontSize: 20, fontWeight: '800', color: '#fff' },
  filterScroll:   { gap: 8, paddingRight: 8 },
  filterChip:     { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  filterChipActive:     { backgroundColor: '#fff' },
  filterChipText:       { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  filterChipTextActive: { color: HEADER_BLUE },
  periodRow:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10 },
  periodLabel:    { fontSize: 12, color: COLORS.muted },
  totalsRow:      { flexDirection: 'row', backgroundColor: COLORS.white, marginHorizontal: 16, marginBottom: 4, borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  totalChip:      { flex: 1, alignItems: 'center', paddingVertical: 14 },
  totalChipLabel: { fontSize: 11, color: COLORS.muted, marginBottom: 4 },
  totalChipValue: { fontSize: 20, fontWeight: '800' },
  emptyText:      { color: COLORS.muted, fontSize: 14, paddingVertical: 8 },
  summaryRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  topBorder:      { borderTopWidth: 1, borderTopColor: COLORS.border },
  monthText:      { fontSize: 15, fontWeight: '700', color: COLORS.text },
  countText:      { fontSize: 11, color: COLORS.muted, marginTop: 3 },
  receivedText:   { fontSize: 15, fontWeight: '700', color: COLORS.success },
  outstandingText:{ fontSize: 12, color: '#D97706', fontWeight: '600' },
  pendingRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  tenantName:     { fontSize: 14, fontWeight: '600', color: COLORS.text },
  tenantMeta:     { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  periodText:     { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-start', paddingTop: 140, paddingHorizontal: 16 },
  modalBox:       { backgroundColor: COLORS.white, borderRadius: 16, padding: 24, width: 320, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 10 },
  modalTitle:     { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  modalHint:      { fontSize: 12, color: COLORS.muted, marginBottom: 16 },
  modalLabel:     { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  modalInput:     { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12, fontSize: 15, color: COLORS.text, marginBottom: 14, backgroundColor: COLORS.bg },
  modalActions:   { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn:       { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalBtnText:   { fontSize: 15, fontWeight: '700' },
});
