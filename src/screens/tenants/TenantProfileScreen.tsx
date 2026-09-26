import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import { Tenant, Payment } from '../../types';
import { formatCurrency, formatDate, formatMonth, openWhatsApp, buildReminderMessage } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';
import StatusBadge from '../../components/common/StatusBadge';
import Card from '../../components/common/Card';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, 'TenantProfile'>;
  route: RouteProp<AppStackParamList, 'TenantProfile'>;
};

export default function TenantProfileScreen({ navigation, route }: Props) {
  const { profile } = useAuth();
  const { tenantId } = route.params;
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('tenants').select(`*, units(unit_number, rent_per_bed, buildings(name, id))`).eq('id', tenantId).single(),
      supabase.from('payments').select('*').eq('tenant_id', tenantId).order('payment_month', { ascending: false }),
    ]);
    if (t) {
      setTenant({
        ...t,
        unit_number: (t as any).units?.unit_number,
        building_name: (t as any).units?.buildings?.name,
        building_id: (t as any).units?.buildings?.id,
        rent_per_bed: (t as any).units?.rent_per_bed,
      });
    }
    setPayments((p ?? []) as Payment[]);
  }, [tenantId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const sendReminder = () => {
    if (!tenant) return;
    const now = new Date();
    const msg = buildReminderMessage({
      tenantName: tenant.full_name,
      buildingName: tenant.building_name ?? '',
      unitNumber: tenant.unit_number ?? '',
      month: `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`,
      amountDue: tenant.rent_override ?? tenant.rent_per_bed ?? 0,
      upiId: profile?.upi_id ?? undefined,
    });
    openWhatsApp(tenant.phone, msg);
  };

  const moveOut = () => {
    navigation.navigate('MoveOut', { tenantId });
  };

  if (!tenant) return <View style={styles.loading}><Text>Loading...</Text></View>;

  const effectiveRent = tenant.rent_override ?? tenant.rent_per_bed ?? 0;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Hero card */}
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{tenant.full_name[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.tenantName}>{tenant.full_name}</Text>
          <Text style={styles.tenantMeta}>📞 {tenant.phone}</Text>
          <Text style={styles.tenantMeta}>🏠 {tenant.building_name} · {tenant.unit_number}</Text>
          <Text style={styles.tenantMeta}>📅 Since {formatDate(tenant.move_in_date)}</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionsRow}>
        <ActionBtn icon="cash-outline" label="Record Payment"
          onPress={() => navigation.navigate('RecordPayment', { tenantId })} />
        <ActionBtn icon="time-outline" label="Payment History"
          onPress={() => navigation.navigate('PaymentHistory', { tenantId })} />
        <ActionBtn icon="logo-whatsapp" label="Send Reminder"
          onPress={sendReminder} color="#25D366" />
        <ActionBtn icon="exit-outline" label="Move Out"
          onPress={moveOut} color={COLORS.danger} />
      </View>

      {/* Rent & Deposit */}
      <Card title="Rent & Deposit">
        <Row label="Monthly Rent" value={formatCurrency(effectiveRent)} />
        <Row label="Security Deposit" value={formatCurrency(tenant.deposit_amount)} />
        {tenant.deposit_returned > 0 && <Row label="Deposit Returned" value={formatCurrency(tenant.deposit_returned)} />}
      </Card>

      {/* Tenant Details */}
      <Card title="Personal Details">
        {tenant.email && <Row label="Email" value={tenant.email} />}
        {tenant.id_type && <Row label={tenant.id_type} value={tenant.id_number ?? '—'} />}
        {tenant.emergency_name && <Row label="Emergency Contact" value={`${tenant.emergency_name} · ${tenant.emergency_phone}`} />}
        {tenant.notes && <Row label="Notes" value={tenant.notes} />}
      </Card>

      {/* Recent Payments */}
      {payments.length > 0 && (
        <Card title="Recent Payments">
          {payments.slice(0, 5).map((p, i) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.payRow, i > 0 && styles.topBorder]}
              onPress={() => navigation.navigate('Receipt', { paymentId: p.id })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.payMonth}>{formatMonth(p.payment_month)}</Text>
                <Text style={styles.payAmt}>{formatCurrency(p.amount_paid)} / {formatCurrency(p.amount_due)}</Text>
              </View>
              <StatusBadge status={p.status} />
            </TouchableOpacity>
          ))}
          {payments.length > 5 && (
            <TouchableOpacity style={styles.viewAll} onPress={() => navigation.navigate('PaymentHistory', { tenantId })}>
              <Text style={styles.viewAllText}>View all payments →</Text>
            </TouchableOpacity>
          )}
        </Card>
      )}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

const ActionBtn = ({ icon, label, onPress, color = COLORS.primary }: any) => (
  <TouchableOpacity style={styles.actionBtn} onPress={onPress}>
    <View style={[styles.actionIconWrap, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon} size={22} color={color} />
    </View>
    <Text style={[styles.actionLabel, { color }]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hero: {
    flexDirection: 'row', gap: 14, backgroundColor: COLORS.white,
    padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 24, fontWeight: '700', color: COLORS.primary },
  tenantName: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  tenantMeta: { fontSize: 13, color: COLORS.muted, marginTop: 3 },
  actionsRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: COLORS.white, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  actionBtn: { alignItems: 'center', gap: 6 },
  actionIconWrap: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 11, textAlign: 'center', maxWidth: 60 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowLabel: { fontSize: 13, color: COLORS.muted, flex: 1 },
  rowValue: { fontSize: 13, color: COLORS.text, fontWeight: '500', flex: 1.5, textAlign: 'right' },
  payRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  topBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  payMonth: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  payAmt: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  viewAll: { paddingTop: 12 },
  viewAllText: { color: COLORS.primary, fontSize: 13 },
});
