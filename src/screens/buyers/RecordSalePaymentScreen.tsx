import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, PAYMENT_MODES } from '../../constants';
import { AppStackParamList } from '../../navigation/RootNavigator';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';
import FormField from '../../components/common/FormField';
import SelectField from '../../components/common/SelectField';
import Button from '../../components/common/Button';
import { formatCurrency } from '../../utils';
import { Buyer } from '../../types';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList>;
  route: RouteProp<AppStackParamList, 'RecordSalePayment'>;
};

export default function RecordSalePaymentScreen({ navigation, route }: Props) {
  const { buyerId } = route.params;
  const { user } = useAuth();
  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [existingCount, setExistingCount] = useState(0);

  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: b }, { count }] = await Promise.all([
        supabase
          .from('buyers')
          .select('*, units(unit_number, custom_type, unit_type, sale_price, buildings(name))')
          .eq('id', buyerId)
          .single(),
        supabase
          .from('sale_payments')
          .select('id', { count: 'exact', head: true })
          .eq('buyer_id', buyerId),
      ]);
      if (b) {
        const bd = b as any;
        setBuyer({
          ...bd,
          unit_number: bd.units?.unit_number,
          unit_type: bd.units?.custom_type ?? bd.units?.unit_type,
          building_name: bd.units?.buildings?.name,
          balance: (bd.units?.sale_price ?? bd.sale_price ?? 0) - (bd.amount_paid ?? 0),
        });
      }
      setExistingCount(count ?? 0);
    })();
  }, [buyerId]);

  const validate = () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      Alert.alert('Enter a valid payment amount'); return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate() || !user || !buyer) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('sale_payments')
        .insert({
          owner_id: user.id,
          buyer_id: buyerId,
          amount: Number(amount),
          payment_date: paymentDate,
          payment_mode: paymentMode || null,
          installment_no: existingCount + 1,
          notes: notes.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;
      navigation.replace('SaleReceipt', { paymentId: (data as any).id });
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  const balance = buyer?.balance ?? 0;
  const salePrice = (buyer as any)?.units?.sale_price ?? buyer?.sale_price ?? 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BlueBannerHeader
        title="Record Payment"
        subtitle={buyer ? `${buyer.full_name} · Unit ${buyer.unit_number}` : ''}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Balance card */}
        {buyer && (
          <View style={styles.balCard}>
            <View style={styles.balRow}>
              <View style={styles.balBox}>
                <Text style={styles.balVal}>{formatCurrency(salePrice)}</Text>
                <Text style={styles.balLbl}>Sale Price</Text>
              </View>
              <View style={[styles.balBox, { backgroundColor: '#DCFCE7' }]}>
                <Text style={[styles.balVal, { color: COLORS.success }]}>
                  {formatCurrency(buyer.amount_paid ?? 0)}
                </Text>
                <Text style={styles.balLbl}>Paid So Far</Text>
              </View>
              <View style={[styles.balBox, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[styles.balVal, { color: '#D97706' }]}>{formatCurrency(balance)}</Text>
                <Text style={styles.balLbl}>Balance</Text>
              </View>
            </View>
          </View>
        )}

        <Text style={styles.section}>Payment Details</Text>
        <FormField
          label={`Amount (₹) *${balance > 0 ? `  (Balance: ${formatCurrency(balance)})` : ''}`}
          value={amount}
          onChangeText={setAmount}
          placeholder="Amount received"
          keyboardType="numeric"
        />
        <FormField
          label="Payment Date"
          value={paymentDate}
          onChangeText={setPaymentDate}
          placeholder="YYYY-MM-DD"
        />
        <SelectField
          label="Payment Mode"
          value={paymentMode}
          onChange={setPaymentMode}
          options={[...PAYMENT_MODES]}
        />
        <FormField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Installment details, cheque no, etc. (optional)"
          multiline
          numberOfLines={3}
        />

        <Text style={styles.installInfo}>
          Installment #{existingCount + 1}
        </Text>

        <Button
          title={saving ? 'Saving…' : 'Record & View Receipt'}
          onPress={handleSave}
          disabled={saving}
          style={styles.saveBtn}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 48 },
  balCard: {
    backgroundColor: COLORS.white, borderRadius: 12,
    padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  balRow: { flexDirection: 'row', gap: 8 },
  balBox: {
    flex: 1, backgroundColor: COLORS.bg,
    borderRadius: 8, padding: 10, alignItems: 'center',
  },
  balVal: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  balLbl: { fontSize: 10, color: COLORS.muted, marginTop: 2 },
  section: {
    fontSize: 13, fontWeight: '700', color: COLORS.muted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 16, marginBottom: 8,
  },
  installInfo: {
    fontSize: 12, color: COLORS.muted, textAlign: 'center', marginTop: 8,
  },
  saveBtn: { marginTop: 16 },
});
