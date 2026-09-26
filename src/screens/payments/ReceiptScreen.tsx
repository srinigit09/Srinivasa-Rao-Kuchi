import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl, Share,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import { Payment } from '../../types';
import { formatCurrency, formatDate, formatMonth, openWhatsApp, buildReceiptMessage } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';
import StatusBadge from '../../components/common/StatusBadge';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, 'Receipt'>;
  route: RouteProp<AppStackParamList, 'Receipt'>;
};

const buildReceiptHTML = (payment: Payment & { tenant_name: string; building_name: string; unit_number: string; landlord_name: string; landlord_phone: string }) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #111827; }
    .header { text-align: center; border-bottom: 2px solid #2563EB; padding-bottom: 16px; margin-bottom: 16px; }
    .app-name { font-size: 24px; font-weight: 700; color: #2563EB; }
    .receipt-title { font-size: 16px; color: #6B7280; margin-top: 4px; }
    .receipt-no { font-size: 14px; font-weight: 600; color: #374151; margin-top: 8px; }
    .section { margin-bottom: 16px; }
    .section-title { font-size: 13px; color: #6B7280; font-weight: 600; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #F3F4F6; }
    .row-label { color: #6B7280; font-size: 13px; }
    .row-value { color: #111827; font-size: 13px; font-weight: 500; }
    .total-row { display: flex; justify-content: space-between; padding: 12px 0; border-top: 2px solid #2563EB; margin-top: 8px; }
    .total-label { font-size: 15px; font-weight: 700; color: #111827; }
    .total-value { font-size: 18px; font-weight: 700; color: #2563EB; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-top: 12px; }
    .status-Paid { background: #DCFCE7; color: #16A34A; }
    .status-Partial { background: #FEF3C7; color: #D97706; }
    .status-Pending { background: #FEE2E2; color: #DC2626; }
    .footer { text-align: center; margin-top: 32px; color: #9CA3AF; font-size: 11px; border-top: 1px solid #E5E7EB; padding-top: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="app-name">🏠 RentEase</div>
    <div class="receipt-title">Rent Receipt</div>
    <div class="receipt-no">${payment.receipt_number}</div>
  </div>
  <div class="section">
    <div class="section-title">Landlord</div>
    <div class="row"><span class="row-label">Name</span><span class="row-value">${payment.landlord_name}</span></div>
    <div class="row"><span class="row-label">Phone</span><span class="row-value">${payment.landlord_phone}</span></div>
  </div>
  <div class="section">
    <div class="section-title">Tenant</div>
    <div class="row"><span class="row-label">Name</span><span class="row-value">${payment.tenant_name}</span></div>
    <div class="row"><span class="row-label">Property</span><span class="row-value">${payment.building_name} - ${payment.unit_number}</span></div>
  </div>
  <div class="section">
    <div class="section-title">Payment Details</div>
    <div class="row"><span class="row-label">Period</span><span class="row-value">${formatMonth(payment.payment_month)}</span></div>
    <div class="row"><span class="row-label">Rent</span><span class="row-value">${formatCurrency(payment.amount_due)}</span></div>
    ${payment.electricity > 0 ? `<div class="row"><span class="row-label">Electricity</span><span class="row-value">${formatCurrency(payment.electricity)}</span></div>` : ''}
    ${payment.water > 0 ? `<div class="row"><span class="row-label">Water</span><span class="row-value">${formatCurrency(payment.water)}</span></div>` : ''}
    ${payment.other_charges > 0 ? `<div class="row"><span class="row-label">${payment.other_label || 'Other'}</span><span class="row-value">${formatCurrency(payment.other_charges)}</span></div>` : ''}
    <div class="row"><span class="row-label">Amount Paid</span><span class="row-value">${formatCurrency(payment.amount_paid)}</span></div>
    ${payment.outstanding > 0 ? `<div class="row"><span class="row-label">Outstanding</span><span class="row-value" style="color:#DC2626">${formatCurrency(payment.outstanding)}</span></div>` : ''}
    <div class="row"><span class="row-label">Payment Mode</span><span class="row-value">${payment.payment_mode ?? '—'}</span></div>
    <div class="row"><span class="row-label">Payment Date</span><span class="row-value">${formatDate(payment.payment_date)}</span></div>
  </div>
  <div class="total-row">
    <span class="total-label">Total Billed</span>
    <span class="total-value">${formatCurrency(payment.amount_due + payment.electricity + payment.water + payment.other_charges)}</span>
  </div>
  <div class="status status-${payment.status}">${payment.status}</div>
  ${payment.notes ? `<p style="margin-top:16px;font-size:13px;color:#6B7280;">Note: ${payment.notes}</p>` : ''}
  <div class="footer">Generated by RentEase · ${new Date().toLocaleDateString('en-IN')}</div>
</body>
</html>
`;

export default function ReceiptScreen({ navigation, route }: Props) {
  const { profile } = useAuth();
  const { paymentId } = route.params;
  const [payment, setPayment] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('payments')
      .select('*, tenants(full_name, phone, units(unit_number, buildings(name)))')
      .eq('id', paymentId)
      .single();
    if (data) {
      setPayment({
        ...data,
        tenant_name: data.tenants?.full_name,
        tenant_phone: data.tenants?.phone,
        unit_number: data.tenants?.units?.unit_number,
        building_name: data.tenants?.units?.buildings?.name,
        landlord_name: profile?.full_name ?? 'Landlord',
        landlord_phone: profile?.phone ?? '',
      });
    }
  }, [paymentId, profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const sharePDF = async () => {
    try {
      const html = buildReceiptHTML(payment);
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Receipt ${payment.receipt_number}` });
      } else {
        Alert.alert('Sharing not available on this device.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const sendWhatsApp = async () => {
    const msg = buildReceiptMessage(payment.receipt_number, payment.tenant_name, formatMonth(payment.payment_month));
    openWhatsApp(payment.tenant_phone, msg);
    // Also share PDF
    await sharePDF();
  };

  const printReceipt = async () => {
    const html = buildReceiptHTML(payment);
    await Print.printAsync({ html });
  };

  if (!payment) return <View style={styles.loading}><Text>Loading...</Text></View>;

  const total = payment.amount_due + payment.electricity + payment.water + payment.other_charges;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Receipt Card */}
      <View style={styles.receiptCard}>
        <View style={styles.rcpHeader}>
          <Text style={styles.rcpTitle}>🏠 RentEase</Text>
          <Text style={styles.rcpSub}>Rent Receipt</Text>
          <Text style={styles.rcpNo}>{payment.receipt_number}</Text>
        </View>

        <Section title="TENANT">
          <Row label="Name" value={payment.tenant_name} />
          <Row label="Property" value={`${payment.building_name} · ${payment.unit_number}`} />
        </Section>

        <Section title="PAYMENT">
          <Row label="Period" value={formatMonth(payment.payment_month)} />
          <Row label="Rent" value={formatCurrency(payment.amount_due)} />
          {payment.electricity > 0 && <Row label="Electricity" value={formatCurrency(payment.electricity)} />}
          {payment.water > 0 && <Row label="Water" value={formatCurrency(payment.water)} />}
          {payment.other_charges > 0 && <Row label={payment.other_label || 'Other'} value={formatCurrency(payment.other_charges)} />}
        </Section>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Billed</Text>
          <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
        </View>

        <Section title="RECEIVED">
          <Row label="Amount Paid" value={formatCurrency(payment.amount_paid)} />
          {payment.outstanding > 0 && <Row label="Outstanding" value={formatCurrency(payment.outstanding)} isRed />}
          <Row label="Mode" value={payment.payment_mode ?? '—'} />
          <Row label="Date" value={formatDate(payment.payment_date)} />
        </Section>

        <View style={styles.statusRow}>
          <StatusBadge status={payment.status} />
        </View>

        {payment.notes ? <Text style={styles.notes}>Note: {payment.notes}</Text> : null}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <ActionBtn icon="share-outline" label="Share PDF" onPress={sharePDF} />
        <ActionBtn icon="logo-whatsapp" label="WhatsApp" onPress={sendWhatsApp} color="#25D366" />
        <ActionBtn icon="print-outline" label="Print" onPress={printReceipt} />
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const Section = ({ title, children }: any) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const Row = ({ label, value, isRed }: any) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={[styles.rowValue, isRed && { color: COLORS.danger }]}>{value}</Text>
  </View>
);

const ActionBtn = ({ icon, label, onPress, color = COLORS.primary }: any) => (
  <TouchableOpacity style={styles.actionBtn} onPress={onPress}>
    <View style={[styles.actionIcon, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon} size={22} color={color} />
    </View>
    <Text style={[styles.actionLabel, { color }]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  receiptCard: {
    backgroundColor: COLORS.white, borderRadius: 16, margin: 16,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 4, overflow: 'hidden',
  },
  rcpHeader: { backgroundColor: COLORS.primary, padding: 20, alignItems: 'center' },
  rcpTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  rcpSub: { fontSize: 13, color: '#BFDBFE', marginTop: 2 },
  rcpNo: { fontSize: 14, fontWeight: '600', color: '#fff', marginTop: 6, backgroundColor: '#1D4ED8', paddingHorizontal: 12, paddingVertical: 3, borderRadius: 10 },
  section: { padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sectionTitle: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 1, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  rowLabel: { fontSize: 13, color: COLORS.muted },
  rowValue: { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderTopWidth: 2, borderTopColor: COLORS.primary, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  totalLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  totalValue: { fontSize: 18, fontWeight: '700', color: COLORS.primary },
  statusRow: { padding: 16 },
  notes: { paddingHorizontal: 16, paddingBottom: 16, fontSize: 13, color: COLORS.muted },
  actions: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: COLORS.white, borderRadius: 16, margin: 16, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  actionBtn: { alignItems: 'center', gap: 8 },
  actionIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 12, fontWeight: '500' },
});
