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
      supabase.from('tenants').select(`*, units(unit_number, rent_per_bed, monthly_maintenance, buildings(name, id, building_type, monthly_maintenance_charge))`).eq('id', tenantId).single(),
      supabase.from('payments').select('*').eq('tenant_id', tenantId).order('payment_month', { ascending: false }),
    ]);
    if (t) {
      setTenant({
        ...t,
        unit_number: (t as any).units?.unit_number,
        building_name: (t as any).units?.buildings?.name,
        building_id: (t as any).units?.buildings?.id,
        building_type: (t as any).units?.buildings?.building_type ?? 'residential',
        rent_per_bed: (t as any).units?.rent_per_bed,
      });
    }
    setPayments((p ?? []) as Payment[]);
  }, [tenantId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const isOwner = tenant?.resident_type === 'owner_occupant';

  const sendReminder = () => {
    if (!tenant) return;
    const now = new Date();
    const effectiveDue = isOwner
      ? ((tenant as any).units?.monthly_maintenance ?? (tenant as any).units?.buildings?.monthly_maintenance_charge ?? 0)
      : (tenant.rent_override ?? tenant.rent_per_bed ?? 0);

    const msg = buildReminderMessage({
      tenantName: tenant.full_name,
      buildingName: tenant.building_name ?? '',
      unitNumber: tenant.unit_number ?? '',
      month: `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`,
      amountDue: effectiveDue,
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
        <View style={[styles.avatar, isOwner && styles.avatarOwner]}>
          <Text style={[styles.avatarText, isOwner && styles.avatarTextOwner]}>
            {tenant.full_name ? tenant.full_name[0].toUpperCase() : 'U'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.tenantName}>{tenant.full_name}</Text>
            <View style={[styles.typeBadge, isOwner ? styles.ownerBadge : styles.tenantBadge]}>
              <Text style={isOwner ? styles.ownerBadgeText : styles.tenantBadgeText}>
                {isOwner ? '👑 Owner' : 'Tenant'}
              </Text>
            </View>
          </View>
          <Text style={styles.tenantMeta}>📞 {tenant.phone}</Text>
          <Text style={styles.tenantMeta}>📍 {tenant.building_name} · Unit {tenant.unit_number}</Text>
          <Text style={styles.tenantMeta}>📅 Active since {formatDate(tenant.move_in_date)}</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.actionsRow}>
        <ActionBtn
          icon="cash-outline"
          label={isOwner ? 'Record Dues' : 'Record Rent'}
          onPress={() => navigation.navigate('RecordPayment', { tenantId })}
        />
        <ActionBtn
          icon="time-outline"
          label="Payment History"
          onPress={() => navigation.navigate('PaymentHistory', { tenantId })}
        />
        <ActionBtn
          icon="logo-whatsapp"
          label="Send Reminder"
          onPress={sendReminder}
          color="#25D366"
        />
        <ActionBtn
          icon="exit-outline"
          label="Move Out"
          onPress={moveOut}
          color={COLORS.danger}
        />
      </View>

      {/* Dues / Rent & Deposit */}
      <Card title={isOwner ? 'Maintenance & Society Dues' : 'Rent & Deposit Details'}>
        {!isOwner && (
          <Row
            label={tenant.building_type === 'pg' ? 'Rent / Bed' : 'Monthly Base Rent'}
            value={formatCurrency(effectiveRent)}
          />
        )}
        <Row label="Security Deposit" value={formatCurrency(tenant.deposit_amount)} />
        {tenant.deposit_returned > 0 && <Row label="Deposit Returned" value={formatCurrency(tenant.deposit_returned)} />}
      </Card>

      {/* Resident Details */}
      <Card title="Personal Details & Verification">
        {tenant.email && <Row label="Email" value={tenant.email} />}
        {tenant.id_type && <Row label={tenant.id_type} value={tenant.id_number ?? '—'} />}
        {tenant.emergency_name && <Row label="Emergency Contact" value={`${tenant.emergency_name} (${tenant.emergency_phone ?? ''})`} />}
        {tenant.notes && <Row label="Notes" value={tenant.notes} />}
      </Card>

      {/* Recent Payments */}
      {payments.length > 0 && (
        <Card title="Recent Transactions & Receipts">
          {payments.slice(0, 5).map((p, i) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.payRow, i > 0 && styles.topBorder]}
              onPress={() => navigation.navigate('Receipt', { paymentId: p.id })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.payMonth}>{formatMonth(p.payment_month)}</Text>
                <Text style={styles.payAmt}>
                  Paid: {formatCurrency(p.amount_paid + (p.advance_paid ?? 0))} · Total Due: {formatCurrency(p.amount_due)}
                </Text>
              </View>
              <StatusBadge status={p.status} />
            </TouchableOpacity>
          ))}
          {payments.length > 5 && (
            <TouchableOpacity style={styles.viewAll} onPress={() => navigation.navigate('PaymentHistory', { tenantId })}>
              <Text style={styles.viewAllText}>View complete history ({payments.length} transactions) →</Text>
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
    <Text style={styles.actionLabel} numberOfLines={2}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: 16,
    margin: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOwner: { backgroundColor: '#FEF3C7' },
  avatarText: { fontSize: 22, fontWeight: '800', color: COLORS.primary },
  avatarTextOwner: { color: '#B45309' },
  tenantName: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tenantBadge: { backgroundColor: COLORS.primaryLight },
  tenantBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.primary },
  ownerBadge: { backgroundColor: '#FEF3C7' },
  ownerBadgeText: { fontSize: 10, fontWeight: '700', color: '#B45309' },
  tenantMeta: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 10,
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  actionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 10, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowLabel: { fontSize: 13, color: COLORS.muted },
  rowValue: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  topBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  payMonth: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  payAmt: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  viewAll: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  viewAllText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
});
