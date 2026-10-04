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

const buildReceiptHTML = (payment: Payment & { tenant_name: string; building_name: string; unit_number: string }) => {
  const totalBilled = payment.amount_due + payment.electricity + payment.water + payment.other_charges;
  const advancePaid = payment.advance_paid ?? 0;
  const totalReceived = payment.amount_paid + advancePaid;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 28px; color: #111827; font-size: 15px; }
    .header { text-align: center; border-bottom: 2px solid #2563EB; padding-bottom: 20px; margin-bottom: 20px; }
    .app-name { font-size: 26px; font-weight: 800; color: #2563EB; }
    .building-name { font-size: 17px; font-weight: 700; color: #111827; margin-top: 6px; }
    .receipt-title { font-size: 15px; color: #6B7280; margin-top: 4px; }
    .receipt-no { display: inline-block; font-size: 14px; font-weight: 700; color: #fff; margin-top: 10px;
                  background: #2563EB; padding: 4px 16px; border-radius: 20px; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 13px; color: #6B7280; font-weight: 700; margin-bottom: 10px;
                     text-transform: uppercase; letter-spacing: 0.8px; }
    .row { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #F3F4F6; }
    .row-label { color: #6B7280; font-size: 14px; }
    .row-value { color: #111827; font-size: 14px; font-weight: 600; text-align: right; }
    .paid-box { background: #F0FDF4; border: 2px solid #16A34A; border-radius: 10px;
                display: flex; justify-content: space-between; align-items: center;
                padding: 14px 16px; margin: 16px 0; }
    .paid-label { font-size: 16px; font-weight: 700; color: #111827; }
    .paid-value { font-size: 24px; font-weight: 800; color: #16A34A; }
    .summary-row { display: flex; justify-content: space-between; padding: 5px 0; }
    .summary-label { font-size: 13px; color: #6B7280; }
    .summary-value { font-size: 13px; font-weight: 600; color: #374151; }
    .outstanding-value { color: #DC2626; }
    .status { display: inline-block; padding: 5px 16px; border-radius: 20px; font-size: 14px; font-weight: 700; margin-top: 4px; }
    .status-Paid { background: #DCFCE7; color: #16A34A; }
    .status-Partial { background: #FEF3C7; color: #D97706; }
    .status-Pending { background: #FEE2E2; color: #DC2626; }
    .footer { text-align: center; margin-top: 32px; color: #9CA3AF; font-size: 12px;
              border-top: 1px solid #E5E7EB; padding-top: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="app-name">🏠 RentEase</div>
    <div class="building-name">${payment.building_name}</div>
    <div class="receipt-title">Rent Receipt</div>
    <div class="receipt-no">${payment.receipt_number}</div>
  </div>
  <div class="section">
    <div class="section-title">Tenant Details</div>
    <div class="row"><span class="row-label">Tenant Name</span><span class="row-value">${payment.tenant_name}</span></div>
    <div class="row"><span class="row-label">Property</span><span class="row-value">${payment.building_name}</span></div>
    <div class="row"><span class="row-label">Unit / Flat</span><span class="row-value">${payment.unit_number}</span></div>
    <div class="row"><span class="row-label">Period</span><span class="row-value">${formatMonth(payment.payment_month)}</span></div>
  </div>
  <div class="section">
    <div class="section-title">Charges</div>
    <div class="row"><span class="row-label">Rent</span><span class="row-value">${formatCurrency(payment.amount_due)}</span></div>
    ${payment.electricity > 0 ? `<div class="row"><span class="row-label">Electricity</span><span class="row-value">${formatCurrency(payment.electricity)}</span></div>` : ''}
    ${payment.water > 0 ? `<div class="row"><span class="row-label">Water</span><span class="row-value">${formatCurrency(payment.water)}</span></div>` : ''}
    ${payment.other_charges > 0 ? `<div class="row"><span class="row-label">${payment.other_label || 'Other'}</span><span class="row-value">${formatCurrency(payment.other_charges)}</span></div>` : ''}
    <div class="row"><span class="row-label">Total Billed</span><span class="row-value">${formatCurrency(totalBilled)}</span></div>
  </div>
  <div class="paid-box">
    <span class="paid-label">${advancePaid > 0 ? 'Rent Paid' : 'Amount Paid'}</span>
    <span class="paid-value">${formatCurrency(payment.amount_paid)}</span>
  </div>
  ${advancePaid > 0 ? `
  <div class="paid-box" style="background:#F5F3FF;border-color:#7C3AED;margin-top:8px;">
    <span class="paid-label" style="color:#5B21B6;">Advance / Deposit</span>
    <span class="paid-value" style="color:#7C3AED;">${formatCurrency(advancePaid)}</span>
  </div>
  <div class="summary-row" style="margin-top:4px;">
    <span class="summary-label">Total Received</span>
    <span class="summary-value">${formatCurrency(totalReceived)}</span>
  </div>` : ''}
  <div class="summary-row">
    <span class="summary-label">Payment Mode</span>
    <span class="summary-value">${payment.payment_mode ?? '—'}</span>
  </div>
  <div class="summary-row">
    <span class="summary-label">Payment Date</span>
    <span class="summary-value">${formatDate(payment.payment_date)}</span>
  </div>
  ${payment.outstanding > 0 ? `
  <div class="summary-row" style="margin-top:8px;">
    <span class="summary-label">Outstanding Balance</span>
    <span class="summary-value outstanding-value">${formatCurrency(payment.outstanding)}</span>
  </div>` : ''}
  <div style="margin-top:14px;">
    <div class="status status-${payment.status}">${payment.status}</div>
  </div>
  ${payment.notes ? `<p style="margin-top:16px;font-size:14px;color:#6B7280;line-height:1.5;">Note: ${payment.notes}</p>` : ''}
  <div class="footer">Generated by RentEase · ${new Date().toLocaleDateString('en-IN')}</div>
</body>
</html>
`};

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
        const fileName = `Receipt_${payment.building_name}_${payment.tenant_name}_${payment.unit_number}_${payment.receipt_number}`
          .replace(/[^a-zA-Z0-9_]/g, '_');
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: fileName });
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

  const totalBilled = payment.amount_due + payment.electricity + payment.water + payment.other_charges;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Receipt Card */}
      <View style={styles.receiptCard}>
        {/* Header */}
        <View style={styles.rcpHeader}>
          <Text style={styles.rcpTitle}>🏠 RentEase</Text>
          <Text style={styles.rcpBuilding}>{payment.building_name}</Text>
          <Text style={styles.rcpSub}>Rent Receipt</Text>
          <Text style={styles.rcpNo}>{payment.receipt_number}</Text>
        </View>

        {/* Tenant */}
        <Section title="TENANT DETAILS">
          <Row label="Tenant Name" value={payment.tenant_name} />
          <Row label="Property" value={payment.building_name} />
          <Row label="Unit / Flat" value={payment.unit_number} />
          <Row label="Period" value={formatMonth(payment.payment_month)} />
        </Section>

        {/* Charges */}
        <Section title="CHARGES">
          <Row label="Rent" value={formatCurrency(payment.amount_due)} />
          {payment.electricity > 0 && <Row label="Electricity" value={formatCurrency(payment.electricity)} />}
          {payment.water > 0 && <Row label="Water" value={formatCurrency(payment.water)} />}
          {payment.other_charges > 0 && <Row label={payment.other_label || 'Other'} value={formatCurrency(payment.other_charges)} />}
          <Row label="Total Billed" value={formatCurrency(totalBilled)} isBold />
        </Section>

        {/* Amount Paid — prominent */}
        <View style={styles.paidBox}>
          <Text style={styles.paidLabel}>{(payment.advance_paid ?? 0) > 0 ? 'Rent Paid' : 'Amount Paid'}</Text>
          <Text style={styles.paidValue}>{formatCurrency(payment.amount_paid)}</Text>
        </View>
        {(payment.advance_paid ?? 0) > 0 && (
          <View style={[styles.paidBox, styles.advanceBox]}>
            <Text style={[styles.paidLabel, { color: '#5B21B6' }]}>Advance / Deposit</Text>
            <Text style={[styles.paidValue, { color: '#7C3AED' }]}>{formatCurrency(payment.advance_paid)}</Text>
          </View>
        )}

        {/* Payment info */}
        <Section title="PAYMENT INFO">
          <Row label="Mode" value={payment.payment_mode ?? '—'} />
          <Row label="Date" value={formatDate(payment.payment_date)} />
          {payment.outstanding > 0 && <Row label="Outstanding Balance" value={formatCurrency(payment.outstanding)} isRed />}
        </Section>

        <View style={styles.statusRow}>
          <StatusBadge status={payment.status} />
        </View>

        {payment.notes ? <Text style={styles.notes}>Note: {payment.notes}</Text> : null}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <ActionBtn icon="share-outline" label="Share PDF" onPress={sharePDF} />
        <ActionBtn icon="create-outline" label="Edit Entry" onPress={() => navigation.navigate('RecordPayment', { tenantId: payment.tenant_id, paymentId: payment.id })} color="#7C3AED" />
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

const Row = ({ label, value, isRed, isBold }: any) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={[styles.rowValue, isRed && { color: COLORS.danger }, isBold && { color: COLORS.text, fontWeight: '700' }]}>{value}</Text>
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
  rcpHeader: { backgroundColor: COLORS.primary, paddingVertical: 28, paddingHorizontal: 24, alignItems: 'center' },
  rcpTitle: { fontSize: 26, fontWeight: '800', color: '#fff' },
  rcpBuilding: { fontSize: 17, fontWeight: '700', color: '#BFDBFE', marginTop: 6 },
  rcpSub: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  rcpNo: { fontSize: 14, fontWeight: '700', color: '#fff', marginTop: 10, backgroundColor: '#1D4ED8', paddingHorizontal: 16, paddingVertical: 5, borderRadius: 10 },
  section: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.muted, letterSpacing: 1.2, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
  rowLabel: { fontSize: 15, color: COLORS.muted },
  rowValue: { fontSize: 15, color: COLORS.text, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  paidBox: {
    marginHorizontal: 20, marginVertical: 4,
    backgroundColor: COLORS.successLight, borderWidth: 2, borderColor: COLORS.success,
    borderRadius: 12, paddingHorizontal: 20, paddingVertical: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  paidLabel: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  paidValue: { fontSize: 26, fontWeight: '800', color: COLORS.success },
  advanceBox: { backgroundColor: '#F5F3FF', borderColor: '#7C3AED', marginTop: 8 },
  statusRow: { paddingHorizontal: 20, paddingVertical: 16 },
  notes: { paddingHorizontal: 20, paddingBottom: 18, fontSize: 14, color: COLORS.muted, lineHeight: 20 },
  actions: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: COLORS.white, borderRadius: 16, margin: 16, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  actionBtn: { alignItems: 'center', gap: 8 },
  actionIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 13, fontWeight: '600' },
});
