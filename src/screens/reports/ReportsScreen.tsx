import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import { Payment } from '../../types';
import { formatCurrency, formatMonth } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';
import StatusBadge from '../../components/common/StatusBadge';
import Card from '../../components/common/Card';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList> };

interface MonthlySummary {
  month: string;
  total_due: number;
  total_collected: number;
  total_outstanding: number;
  paid_count: number;
  partial_count: number;
  pending_count: number;
}

export default function ReportsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [summaries, setSummaries] = useState<MonthlySummary[]>([]);
  const [pendingPayments, setPendingPayments] = useState<Payment[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: s }, { data: p }] = await Promise.all([
      supabase
        .from('v_monthly_summary')
        .select('*')
        .eq('owner_id', user.id)
        .order('month', { ascending: false })
        .limit(12),
      supabase
        .from('payments')
        .select('*, tenants(full_name, phone, units(unit_number, buildings(name)))')
        .eq('owner_id', user.id)
        .neq('status', 'Paid')
        .order('payment_month', { ascending: false })
        .limit(20),
    ]);
    setSummaries((s ?? []) as MonthlySummary[]);
    setPendingPayments((p ?? []).map((x: any) => ({
      ...x,
      tenant_name: x.tenants?.full_name,
      unit_number: x.tenants?.units?.unit_number,
      building_name: x.tenants?.units?.buildings?.name,
    })) as Payment[]);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Monthly Collection Summary */}
      <Card title="Monthly Collection Summary">
        {summaries.length === 0 && <Text style={styles.emptyText}>No payment records yet.</Text>}
        {summaries.map((s, i) => (
          <View key={i} style={[styles.summaryRow, i > 0 && styles.topBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.monthText}>{formatMonth(s.month)}</Text>
              <Text style={styles.countText}>
                ✅ {s.paid_count} paid · ⚠️ {s.partial_count} partial · ❌ {s.pending_count} pending
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.collectedText}>{formatCurrency(s.total_collected)}</Text>
              {s.total_outstanding > 0 && (
                <Text style={styles.outstandingText}>-{formatCurrency(s.total_outstanding)}</Text>
              )}
            </View>
          </View>
        ))}
      </Card>

      {/* Pending / Partial Payments */}
      {pendingPayments.length > 0 && (
        <Card title="Pending & Partial Payments">
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
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  emptyText: { color: COLORS.muted, fontSize: 14 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  topBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  monthText: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  countText: { fontSize: 11, color: COLORS.muted, marginTop: 3 },
  collectedText: { fontSize: 15, fontWeight: '700', color: COLORS.success },
  outstandingText: { fontSize: 12, color: COLORS.danger, fontWeight: '600' },
  pendingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  tenantName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  tenantMeta: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  periodText: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
});
