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
import { formatCurrency, formatMonth, currentMonthDate } from '../../utils';
import Card from '../../components/common/Card';

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
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [electricity, setElectricity] = useState('');
  const [water, setWater] = useState('');
  const [otherCharges, setOtherCharges] = useState('');
  const [otherLabel, setOtherLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('tenants')
      .select('full_name, rent_override, units(rent_per_bed, unit_number, buildings(name))')
      .eq('id', tenantId).single()
      .then(({ data }) => {
        if (data) {
          setTenant(data);
          const rent = data.rent_override ?? (data as any).units?.rent_per_bed ?? 0;
          setAmountDue(String(rent));
        }
      });
    if (paymentId) {
      supabase.from('payments').select('*').eq('id', paymentId).single().then(({ data }) => {
        if (data) {
          setPaymentMonth(data.payment_month);
          setAmountDue(String(data.amount_due));
          setAmountPaid(String(data.amount_paid));
          setPaymentDate(data.payment_date ?? '');
          setPaymentMode(data.payment_mode ?? 'Cash');
          setElectricity(String(data.electricity ?? ''));
          setWater(String(data.water ?? ''));
          setOtherCharges(String(data.other_charges ?? ''));
          setOtherLabel(data.other_label ?? '');
          setNotes(data.notes ?? '');
        }
      });
    }
  }, [tenantId, paymentId]);

  const totalBill = (parseFloat(amountDue) || 0)
    + (parseFloat(electricity) || 0)
    + (parseFloat(water) || 0)
    + (parseFloat(otherCharges) || 0);

  const save = async () => {
    if (!amountPaid) { Alert.alert('Required', 'Please enter amount paid.'); return; }
    setLoading(true);

    // Generate receipt number via RPC
    const { data: rcpNo } = await supabase.rpc('next_receipt_number', { p_owner_id: user!.id });

    const payload = {
      owner_id: user!.id,
      tenant_id: tenantId,
      payment_month: paymentMonth,
      amount_due: parseFloat(amountDue) || 0,
      amount_paid: parseFloat(amountPaid) || 0,
      payment_date: paymentDate || null,
      payment_mode: paymentMode,
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

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {tenant && (
          <View style={styles.tenantBanner}>
            <Text style={styles.tenantName}>{tenant.full_name}</Text>
            <Text style={styles.tenantMeta}>{(tenant as any).units?.buildings?.name} · {(tenant as any).units?.unit_number}</Text>
          </View>
        )}

        <FormField
          label="Payment Month (YYYY-MM-DD)"
          required
          placeholder="2024-06-01"
          value={paymentMonth}
          onChangeText={setPaymentMonth}
          keyboardType="numeric"
        />
        <FormField label="Rent Due (₹)" required placeholder="Amount due" keyboardType="decimal-pad" value={amountDue} onChangeText={setAmountDue} />
        <FormField label="Electricity Charges (₹)" placeholder="0" keyboardType="decimal-pad" value={electricity} onChangeText={setElectricity} />
        <FormField label="Water Charges (₹)" placeholder="0" keyboardType="decimal-pad" value={water} onChangeText={setWater} />
        <FormField label="Other Charges (₹)" placeholder="0" keyboardType="decimal-pad" value={otherCharges} onChangeText={setOtherCharges} />
        {parseFloat(otherCharges) > 0 && (
          <FormField label="Other Charges Label" placeholder="e.g. Parking, Internet" value={otherLabel} onChangeText={setOtherLabel} />
        )}

        <Card>
          <Text style={styles.totalLabel}>Total Bill</Text>
          <Text style={styles.totalValue}>{formatCurrency(totalBill)}</Text>
        </Card>

        <FormField label="Amount Paid (₹)" required placeholder="Amount paid" keyboardType="decimal-pad" value={amountPaid} onChangeText={setAmountPaid} />
        <SelectField label="Payment Mode" options={[...PAYMENT_MODES]} value={paymentMode} onChange={setPaymentMode} />
        <FormField label="Payment Date" placeholder="YYYY-MM-DD" value={paymentDate} onChangeText={setPaymentDate} keyboardType="numeric" />
        <FormField label="Notes" placeholder="Optional notes" multiline numberOfLines={2} value={notes} onChangeText={setNotes} />

        <Button title="💾 Save & Generate Receipt" onPress={save} loading={loading} style={{ marginTop: 16 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.white },
  container: { padding: 20, paddingBottom: 40 },
  tenantBanner: { backgroundColor: COLORS.primaryLight, borderRadius: 8, padding: 12, marginBottom: 16 },
  tenantName: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  tenantMeta: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  totalLabel: { fontSize: 12, color: COLORS.muted },
  totalValue: { fontSize: 22, fontWeight: '700', color: COLORS.text, marginTop: 4 },
});
