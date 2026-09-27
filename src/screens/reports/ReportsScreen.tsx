import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  TextInput, Modal, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import { Payment } from '../../types';
import { formatCurrency, formatMonth } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';
import StatusBadge from '../../components/common/StatusBadge';
import Card from '../../components/common/Card';
import { Ionicons } from '@expo/vector-icons';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList> };

type FilterKey = 'thisMonth' | 'lastQuarter' | '6months' | '1year' | 'custom';

interface FilterOption {
  key: FilterKey;
  label: string;
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

const FILTERS: FilterOption[] = [
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastQuarter', label: 'Last Quarter' },
  { key: '6months', label: '6 Months' },
  { key: '1year', label: '1 Year' },
  { key: 'custom', label: 'Custom' },
];

function getDateRange(filter: FilterKey, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;

  if (filter === 'thisMonth') {
    const from = ymd(now);
    return { from, to: from };
  }
  if (filter === 'lastQuarter') {
    const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return { from: ymd(from), to: ymd(now) };
  }
  if (filter === '6months') {
    const from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    return { from: ymd(from), to: ymd(now) };
  }
  if (filter === '1year') {
    const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    return { from: ymd(from), to: ymd(now) };
  }
  // custom
  return {
    from: customFrom || ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1)),
    to: customTo || ymd(now),
  };
}

export default function ReportsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [activeFilter, setActiveFilter] = useState<FilterKey>('thisMonth');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [tempFrom, setTempFrom] = useState('');
  const [tempTo, setTempTo] = useState('');

  const [summaries, setSummaries] = useState<MonthlySummary[]>([]);
  const [pendingPayments, setPendingPayments] = useState<Payment[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { from, to } = getDateRange(activeFilter, customFrom, customTo);

    const [{ data: s }, { data: p }] = await Promise.all([
      supabase
        .from('v_monthly_summary')
        .select('*')
        .eq('owner_id', user.id)
        .gte('month', from)
        .lte('month', to)
        .order('month', { ascending: false }),
      supabase
        .from('payments')
        .select('*, tenants(full_name, phone, units(unit_number, buildings(name)))')
        .eq('owner_id', user.id)
        .neq('status', 'Paid')
        .gte('payment_month', from)
        .lte('payment_month', to)
        .order('payment_month', { ascending: false }),
    ]);

    setSummaries((s ?? []) as MonthlySummary[]);
    setPendingPayments((p ?? []).map((x: any) => ({
      ...x,
      tenant_name: x.tenants?.full_name,
      unit_number: x.tenants?.units?.unit_number,
      building_name: x.tenants?.units?.buildings?.name,
    })) as Payment[]);
  }, [user, activeFilter, customFrom, customTo]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const totalReceived = summaries.reduce((s, m) => s + m.total_collected, 0);
  const totalOutstanding = summaries.reduce((s, m) => s + m.total_outstanding, 0);
  const totalDue = summaries.reduce((s, m) => s + m.total_due, 0);

  const applyCustom = () => {
    setCustomFrom(tempFrom);
    setCustomTo(tempTo);
    setShowCustomModal(false);
  };

  const { from, to } = getDateRange(activeFilter, customFrom, customTo);
  const rangeLabel = activeFilter === 'custom' && customFrom
    ? `${formatMonth(customFrom + '')} – ${formatMonth(customTo + '')}`
    : FILTERS.find(f => f.key === activeFilter)?.label ?? '';

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {/* Filter bar */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, activeFilter === f.key && styles.filterChipActive]}
              onPress={() => {
                if (f.key === 'custom') {
                  const now = new Date();
                  const pad = (n: number) => String(n).padStart(2, '0');
                  const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
                  setTempFrom(customFrom || ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1)));
                  setTempTo(customTo || ymd(now));
                  setShowCustomModal(true);
                } else {
                  setActiveFilter(f.key);
                }
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
        {/* Period label */}
        <View style={styles.periodRow}>
          <Ionicons name="calendar-outline" size={14} color={COLORS.muted} />
          <Text style={styles.periodLabel}>Showing: {rangeLabel}</Text>
        </View>

        {/* Summary totals */}
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

        {/* Pending / Partial Payments */}
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
                  {p.outstanding > 0 && (
                    <Text style={styles.outstandingText}>{formatCurrency(p.outstanding)}</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </Card>
        )}
      </ScrollView>

      {/* Custom date modal */}
      <Modal visible={showCustomModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Custom Date Range</Text>
            <Text style={styles.modalHint}>Enter month start dates (YYYY-MM-01)</Text>

            <Text style={styles.modalLabel}>From</Text>
            <TextInput
              style={styles.modalInput}
              value={tempFrom}
              onChangeText={setTempFrom}
              placeholder="e.g. 2025-01-01"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
            />
            <Text style={styles.modalLabel}>To</Text>
            <TextInput
              style={styles.modalInput}
              value={tempTo}
              onChangeText={setTempTo}
              placeholder="e.g. 2025-06-01"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: COLORS.border }]}
                onPress={() => setShowCustomModal(false)}
              >
                <Text style={[styles.modalBtnText, { color: COLORS.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: COLORS.primary }]}
                onPress={() => { setActiveFilter('custom'); applyCustom(); }}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  filterBar: {
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterScroll: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: { fontSize: 13, fontWeight: '600', color: COLORS.muted },
  filterChipTextActive: { color: '#FFFFFF' },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  periodLabel: { fontSize: 12, color: COLORS.muted },
  totalsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginBottom: 4,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  totalChip: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  totalChipLabel: { fontSize: 11, color: COLORS.muted, marginBottom: 4 },
  totalChipValue: { fontSize: 20, fontWeight: '800' },
  emptyText: { color: COLORS.muted, fontSize: 14, paddingVertical: 8 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  topBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  monthText: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  countText: { fontSize: 11, color: COLORS.muted, marginTop: 3 },
  receivedText: { fontSize: 15, fontWeight: '700', color: COLORS.success },
  outstandingText: { fontSize: 12, color: '#D97706', fontWeight: '600' },
  pendingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  tenantName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  tenantMeta: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  periodText: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  // modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 24,
    width: '85%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  modalHint: { fontSize: 12, color: COLORS.muted, marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: COLORS.text,
    marginBottom: 14,
    backgroundColor: COLORS.bg,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalBtnText: { fontSize: 15, fontWeight: '700' },
});
