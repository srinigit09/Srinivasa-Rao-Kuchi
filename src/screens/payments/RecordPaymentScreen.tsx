import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { AppStackParamList } from '../../navigation/RootNavigator';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import SelectField from '../../components/common/SelectField';
import { COLORS, PAYMENT_MODES } from '../../constants';
import { formatCurrency, currentMonthDate } from '../../utils';
import Card from '../../components/common/Card';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, 'RecordPayment'>;
  route: RouteProp<AppStackParamList, 'RecordPayment'>;
};

export default function RecordPaymentScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { tenantId, paymentId } = route.params;
  const [tenant, setTenant] = useState<any>(null);
  const [paymentMonth, setPaymentMonth] = useState(currentMonthDate());
  const [amountDue, setAmountDue] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [advancePaid, setAdvancePaid] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [maintenanceCharge, setMaintenanceCharge] = useState('');
  const [electricity, setElectricity] = useState('');
  const [water, setWater] = useState('');
  const [otherCharges, setOtherCharges] = useState('');
  const [otherLabel, setOtherLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('tenants')
      .select('full_name, resident_type, rent_override, units(rent_per_bed, monthly_maintenance, unit_number, buildings(name, monthly_maintenance_charge))')
      .eq('id', tenantId).single()
      .then(({ data }) => {
        if (data) {
          setTenant(data);
          const isOwner = data.resident_type === 'owner_occupant';
          const rent = isOwner ? 0 : (data.rent_override ?? (data as any).units?.rent_per_bed ?? 0);
          const maint = (data as any).units?.monthly_maintenance ?? (data as any).units?.buildings?.monthly_maintenance_charge ?? 0;
          setAmountDue(String(rent));
          if (maint > 0) setMaintenanceCharge(String(maint));
        }
      });
    if (paymentId) {
      supabase.from('payments').select('*').eq('id', paymentId).single().then(({ data }) => {
        if (data) {
          setPaymentMonth(data.payment_month);
          setAmountDue(String(data.amount_due));
          setAmountPaid(String(data.amount_paid));
          setAdvancePaid(String(data.advance_paid ?? ''));
          setPaymentDate(data.payment_date ?? '');
          setPaymentMode(data.payment_mode ?? 'Cash');
          setMaintenanceCharge(String(data.maintenance_charge ?? ''));
          setElectricity(String(data.electricity ?? ''));
          setWater(String(data.water ?? ''));
          setOtherCharges(String(data.other_charges ?? ''));
          setOtherLabel(data.other_label ?? '');
          setNotes(data.notes ?? '');
        }
      });
    }
  }, [tenantId, paymentId]);

  const rentTotal = (parseFloat(amountDue) || 0)
    + (parseFloat(maintenanceCharge) || 0)
    + (parseFloat(electricity) || 0)
    + (parseFloat(water) || 0)
    + (parseFloat(otherCharges) || 0);

  const totalPaying = (parseFloat(amountPaid) || 0) + (parseFloat(advancePaid) || 0);
  const balance = rentTotal - totalPaying;

  const save = async () => {
    if (!amountPaid && !advancePaid) {
      Alert.alert('Required', 'Please enter at least an amount paid or advance paid.');
      return;
    }
    setLoading(true);

    const { data: rcpNo } = await supabase.rpc('next_receipt_number', { p_owner_id: user!.id });

    const payload = {
      owner_id: user!.id,
      tenant_id: tenantId,
      payment_month: paymentMonth,
      amount_due: parseFloat(amountDue) || 0,
      amount_paid: parseFloat(amountPaid) || 0,
      advance_paid: parseFloat(advancePaid) || 0,
      payment_date: paymentDate || null,
      payment_mode: paymentMode,
      maintenance_charge: parseFloat(maintenanceCharge) || 0,
      electricity: parseFloat(electricity) || 0,
      water: parseFloat(water) || 0,
      other_charges: parseFloat(otherCharges) || 0,
      other_label: otherLabel || null,
      notes: notes || null,
      receipt_number: rcpNo,
    };

    const { data: savedPayment, error } = paymentId
      ? await supabase.from('payments').update(payload).eq('id', paymentId).select().single()
      : await supabase.from('payments').insert(payload).select().single();

    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    navigation.replace('Receipt', { paymentId: savedPayment.id });
  };

  const isOwner = tenant?.resident_type === 'owner_occupant';
  const subtitle = tenant
    ? `${isOwner ? '👑 ' : '👤 '}${tenant.full_name}  ·  ${(tenant as any).units?.buildings?.name ?? ''} ${(tenant as any).units?.unit_number ?? ''}`
    : 'Loading…';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 20}
    >
      <BlueBannerHeader
        title={isOwner ? 'Record Maintenance Dues' : 'Record Rent & Dues'}
        subtitle={subtitle}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <FormField
          label="Payment Month (YYYY-MM-DD)"
          required
          placeholder="2025-01-01"
          value={paymentMonth}
          onChangeText={setPaymentMonth}
          keyboardType="numeric"
        />

        {!isOwner && (
          <FormField
            label="Base Rent Due (₹)"
            required
            placeholder="Amount due"
            keyboardType="decimal-pad"
            value={amountDue}
            onChangeText={setAmountDue}
          />
        )}

        <FormField
          label="Society Maintenance Charges (₹)"
          placeholder="0"
          keyboardType="decimal-pad"
          value={maintenanceCharge}
          onChangeText={setMaintenanceCharge}
        />

        <FormField
          label="Electricity Charges (₹)"
          placeholder="0"
          keyboardType="decimal-pad"
          value={electricity}
          onChangeText={setElectricity}
        />

        <FormField
          label="Water / Sinking Fund (₹)"
          placeholder="0"
          keyboardType="decimal-pad"
          value={water}
          onChangeText={setWater}
        />

        <FormField
          label="Other Dues / Parking (₹)"
          placeholder="0"
          keyboardType="decimal-pad"
          value={otherCharges}
          onChangeText={setOtherCharges}
        />
        {parseFloat(otherCharges) > 0 && (
          <FormField
            label="Other Charges Label"
            placeholder="e.g. Club House, Festival Contribution, Parking"
            value={otherLabel}
            onChangeText={setOtherLabel}
          />
        )}

        {/* Total bill summary */}
        <Card>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Total Bill / Total Dues</Text>
            <Text style={styles.billValue}>{formatCurrency(rentTotal)}</Text>
          </View>
        </Card>

        {/* Divider */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>💰 Payment Received</Text>
        </View>

        <FormField
          label="Amount Paid Now (₹)"
          required
          placeholder="Amount collected"
          keyboardType="decimal-pad"
          value={amountPaid}
          onChangeText={setAmountPaid}
        />
        <FormField
          label="Advance / Buffer Paid (₹)"
          placeholder="0  — extra amount collected in advance"
          keyboardType="decimal-pad"
          value={advancePaid}
          onChangeText={setAdvancePaid}
        />

        {/* Running balance */}
        <Card>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Total Received</Text>
            <Text style={[styles.billValue, { color: COLORS.success }]}>{formatCurrency(totalPaying)}</Text>
          </View>
          <View style={[styles.billRow, { marginTop: 6 }]}>
            <Text style={styles.billLabel}>Balance Outstanding</Text>
            <Text style={[styles.billValue, { color: balance > 0 ? '#D97706' : COLORS.success }]}>
              {balance > 0 ? formatCurrency(balance) : '✓ Fully Paid'}
            </Text>
          </View>
        </Card>

        <SelectField label="Payment Mode" options={[...PAYMENT_MODES]} value={paymentMode} onChange={setPaymentMode} />
        <FormField label="Payment Date" placeholder="YYYY-MM-DD" value={paymentDate} onChangeText={setPaymentDate} keyboardType="numeric" />
        <FormField label="Notes" placeholder="Optional notes e.g. Transaction ID / Cheque No." multiline numberOfLines={2} value={notes} onChangeText={setNotes} />

        <Button title="💾 Save & Generate Receipt" onPress={save} loading={loading} style={{ marginTop: 16 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.white },
  container: { padding: 20, paddingBottom: 100 },
  sectionHeader: {
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    marginTop: 4,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  billLabel: { fontSize: 13, color: COLORS.muted },
  billValue: { fontSize: 20, fontWeight: '700', color: COLORS.text },
});
