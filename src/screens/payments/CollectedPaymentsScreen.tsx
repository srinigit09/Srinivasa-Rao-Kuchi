import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import { Payment } from '../../types';
import { formatCurrency, formatDate, formatMonth } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';
import StatusBadge from '../../components/common/StatusBadge';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';

type Props = NativeStackScreenProps<AppStackParamList, 'CollectedPayments'>;

export default function CollectedPaymentsScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { buildingId, buildingName } = route.params ?? {};
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    if (!user) return;
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    let query = supabase
      .from('payments')
      .select('*, tenants(full_name, units(unit_number, building_id, buildings(name)))')
      .eq('owner_id', user.id)
      .eq('payment_month', thisMonth)
      .gt('amount_paid', 0)
      .order('payment_date', { ascending: false });

    const { data } = await query;

    let rows = (data ?? []).map((x: any) => ({
      ...x,
      tenant_name: x.tenants?.full_name,
      unit_number: x.tenants?.units?.unit_number,
      building_name: x.tenants?.units?.buildings?.name,
      _building_id: x.tenants?.units?.building_id,
    })) as (Payment & { _building_id?: string })[];

    if (buildingId) rows = rows.filter(r => r._building_id === buildingId);

    setPayments(rows);
    setLoading(false);
  }, [user, buildingId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const totalCollected = payments.reduce((s, p) => s + p.amount_paid + (p.advance_paid ?? 0), 0);

  const bannerSubtitle = buildingName
    ? `${buildingName}  ·  ${formatCurrency(totalCollected)} · ${payments.length} payment${payments.length !== 1 ? 's' : ''}`
    : `${formatCurrency(totalCollected)} · ${payments.length} payment${payments.length !== 1 ? 's' : ''}`;

  return (
    <View style={styles.container}>
      <BlueBannerHeader
        title="Collected This Month"
        subtitle={bannerSubtitle}
        onBack={() => navigation.goBack()}
      />

      <FlatList
        data={payments}
        keyExtractor={p => p.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={loading ? null : (
          <View style={styles.empty}>
            <Ionicons name="cash-outline" size={48} color={COLORS.border} />
            <Text style={styles.emptyTitle}>No collections yet</Text>
            <Text style={styles.emptyText}>No payments recorded for this month.</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('Receipt', { paymentId: item.id })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.tenantName}>{item.tenant_name}</Text>
              <Text style={styles.meta}>{item.building_name} · {item.unit_number}</Text>
              <Text style={styles.period}>{formatMonth(item.payment_month)}</Text>
              {item.payment_date && (
                <Text style={styles.date}>
                  {item.payment_mode} · {formatDate(item.payment_date)}
                </Text>
              )}
              {(item.advance_paid ?? 0) > 0 && (
                <Text style={styles.advanceTag}>
                  + {formatCurrency(item.advance_paid)} advance
                </Text>
              )}
              {item.receipt_number && (
                <Text style={styles.rcpNo}>{item.receipt_number}</Text>
              )}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Text style={styles.amount}>{formatCurrency(item.amount_paid + (item.advance_paid ?? 0))}</Text>
              {(item.advance_paid ?? 0) > 0 && (
                <Text style={styles.amountBreak}>rent {formatCurrency(item.amount_paid)}</Text>
              )}
              <StatusBadge status={item.status} />
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: 16, gap: 10, paddingBottom: 32 },
  card: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    borderLeftWidth: 3, borderLeftColor: COLORS.success,
  },
  tenantName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  period: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  date: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  rcpNo: { fontSize: 11, color: COLORS.primary, marginTop: 2 },
  amount: { fontSize: 17, fontWeight: '700', color: COLORS.success },
  amountBreak: { fontSize: 10, color: COLORS.muted },
  advanceTag: { fontSize: 11, color: '#7C3AED', fontWeight: '600', marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.muted },
});
