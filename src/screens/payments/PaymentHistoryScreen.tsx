import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../constants';
import { Payment } from '../../types';
import { formatCurrency, formatDate, formatMonth } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';
import StatusBadge from '../../components/common/StatusBadge';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, 'PaymentHistory'>;
  route: RouteProp<AppStackParamList, 'PaymentHistory'>;
};

export default function PaymentHistoryScreen({ navigation, route }: Props) {
  const { tenantId } = route.params;
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tenant, setTenant] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('tenants').select('full_name, units(unit_number, buildings(name))').eq('id', tenantId).single(),
      supabase.from('payments').select('*').eq('tenant_id', tenantId).order('payment_month', { ascending: false }),
    ]);
    setTenant(t);
    setPayments((p ?? []) as Payment[]);
  }, [tenantId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const totalDue = payments.reduce((s, p) => s + (p.amount_due + p.electricity + p.water + p.other_charges), 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount_paid, 0);

  return (
    <View style={styles.container}>
      <FlatList
        data={payments}
        keyExtractor={p => p.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            {tenant && (
              <View style={styles.header}>
                <Text style={styles.name}>{tenant.full_name}</Text>
                <Text style={styles.meta}>{tenant.units?.buildings?.name} · {tenant.units?.unit_number}</Text>
              </View>
            )}
            <View style={styles.summary}>
              <View style={styles.summaryHalf}>
                <Text style={styles.summaryLabel}>Total Billed</Text>
                <Text style={styles.summaryValue}>{formatCurrency(totalDue)}</Text>
              </View>
              <View style={[styles.summaryHalf, styles.borderLeft]}>
                <Text style={styles.summaryLabel}>Total Paid</Text>
                <Text style={[styles.summaryValue, { color: COLORS.success }]}>{formatCurrency(totalPaid)}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => navigation.navigate('RecordPayment', { tenantId })}
            >
              <Text style={styles.addText}>+ Record New Payment</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No payment records yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('Receipt', { paymentId: item.id })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.month}>{formatMonth(item.payment_month)}</Text>
              <Text style={styles.amtRow}>Paid: {formatCurrency(item.amount_paid)} / Due: {formatCurrency(item.amount_due)}</Text>
              {item.outstanding > 0 && <Text style={styles.outstanding}>Outstanding: {formatCurrency(item.outstanding)}</Text>}
              {item.payment_date && <Text style={styles.date}>{item.payment_mode} · {formatDate(item.payment_date)}</Text>}
              {item.receipt_number && <Text style={styles.rcpNo}>{item.receipt_number}</Text>}
            </View>
            <StatusBadge status={item.status} />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: 16, gap: 10 },
  header: { marginBottom: 12 },
  name: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  summary: {
    flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: 12,
    marginBottom: 10, overflow: 'hidden',
  },
  summaryHalf: { flex: 1, alignItems: 'center', padding: 12 },
  borderLeft: { borderLeftWidth: 1, borderLeftColor: COLORS.border },
  summaryLabel: { fontSize: 12, color: COLORS.muted },
  summaryValue: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginTop: 4 },
  addBtn: {
    backgroundColor: COLORS.primaryLight, padding: 14, borderRadius: 10,
    alignItems: 'center', marginBottom: 4,
  },
  addText: { color: COLORS.primary, fontWeight: '600', fontSize: 14 },
  card: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  month: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  amtRow: { fontSize: 13, color: COLORS.muted, marginTop: 3 },
  outstanding: { fontSize: 12, color: COLORS.danger, marginTop: 2 },
  date: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  rcpNo: { fontSize: 11, color: COLORS.primary, marginTop: 2 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: COLORS.muted, fontSize: 14 },
});
