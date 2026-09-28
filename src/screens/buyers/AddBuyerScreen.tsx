import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, ID_TYPES, PAYMENT_MODES } from '../../constants';
import { AppStackParamList } from '../../navigation/RootNavigator';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';
import FormField from '../../components/common/FormField';
import SelectField from '../../components/common/SelectField';
import Button from '../../components/common/Button';
import { formatCurrency } from '../../utils';
import { Unit, PlotStatus, PLOT_STATUS_LABEL } from '../../types';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList>;
  route: RouteProp<AppStackParamList, 'AddBuyer'>;
};

const STATUSES: PlotStatus[] = ['booked', 'under_construction', 'ready', 'sold'];

export default function AddBuyerScreen({ navigation, route }: Props) {
  const { unitId } = route.params;
  const { user } = useAuth();

  const [unit, setUnit] = useState<Unit | null>(null);

  // Form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [idType, setIdType] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0]);
  const [salePrice, setSalePrice] = useState('');
  const [initialPayment, setInitialPayment] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [plotStatus, setPlotStatus] = useState<PlotStatus>('booked');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('units')
        .select('*, buildings(name, building_type)')
        .eq('id', unitId)
        .single();
      setUnit(data as any);
      if ((data as any)?.sale_price) setSalePrice(String((data as any).sale_price));
    })();
  }, [unitId]);

  const validate = () => {
    if (!fullName.trim()) { Alert.alert('Name required'); return false; }
    if (!phone.trim())    { Alert.alert('Phone required'); return false; }
    if (!salePrice || isNaN(Number(salePrice)) || Number(salePrice) <= 0) {
      Alert.alert('Valid sale price required'); return false;
    }
    if (initialPayment && (isNaN(Number(initialPayment)) || Number(initialPayment) < 0)) {
      Alert.alert('Invalid initial payment amount'); return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate() || !user) return;
    setSaving(true);
    try {
      // 1. Create buyer
      const { data: buyer, error: buyerErr } = await supabase
        .from('buyers')
        .insert({
          owner_id: user.id,
          unit_id: unitId,
          full_name: fullName.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          id_type: idType || null,
          id_number: idNumber.trim() || null,
          booking_date: bookingDate,
          sale_price: Number(salePrice),
          amount_paid: 0,
          notes: notes.trim() || null,
          is_active: true,
        })
        .select()
        .single();

      if (buyerErr) throw buyerErr;

      // 2. Record initial payment if provided
      const initAmt = Number(initialPayment);
      if (initAmt > 0 && buyer) {
        await supabase.from('sale_payments').insert({
          owner_id: user.id,
          buyer_id: buyer.id,
          amount: initAmt,
          payment_date: bookingDate,
          payment_mode: paymentMode || null,
          installment_no: 1,
          notes: 'Booking / initial payment',
        });
      }

      // 3. Update unit plot_status
      await supabase.from('units').update({ plot_status: plotStatus }).eq('id', unitId);

      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to add buyer');
    } finally {
      setSaving(false);
    }
  };

  const buildingName = (unit as any)?.buildings?.name ?? '';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BlueBannerHeader
        title="Add Buyer"
        subtitle={unit ? `Unit ${unit.unit_number} · ${buildingName}` : ''}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Unit info card */}
        {unit && (
          <View style={styles.unitCard}>
            <Text style={styles.unitTitle}>
              {unit.unit_number}  ·  {(unit as any).custom_type ?? unit.unit_type}
            </Text>
            {unit.area_sqft ? (
              <Text style={styles.unitMeta}>Area: {unit.area_sqft} sq.ft</Text>
            ) : null}
            {unit.area_acres ? (
              <Text style={styles.unitMeta}>Area: {unit.area_acres} acres</Text>
            ) : null}
            {unit.sale_price ? (
              <Text style={styles.unitMeta}>Listed price: {formatCurrency(unit.sale_price)}</Text>
            ) : null}
          </View>
        )}

        <Text style={styles.section}>Buyer Details</Text>
        <FormField label="Full Name *" value={fullName} onChangeText={setFullName} placeholder="Buyer's full name" />
        <FormField label="Phone *" value={phone} onChangeText={setPhone} placeholder="Mobile number" keyboardType="phone-pad" />
        <FormField label="Email" value={email} onChangeText={setEmail} placeholder="Email (optional)" keyboardType="email-address" autoCapitalize="none" />
        <SelectField label="ID Type" value={idType} onChange={setIdType} options={['', ...ID_TYPES]} />
        {idType ? <FormField label="ID Number" value={idNumber} onChangeText={setIdNumber} placeholder={`${idType} number`} /> : null}

        <Text style={styles.section}>Sale Details</Text>
        <FormField
          label="Sale Price (₹) *"
          value={salePrice}
          onChangeText={setSalePrice}
          placeholder="Agreed sale price"
          keyboardType="numeric"
        />
        <FormField
          label="Booking Date"
          value={bookingDate}
          onChangeText={setBookingDate}
          placeholder="YYYY-MM-DD"
        />
        <SelectField
          label="Plot Status"
          value={plotStatus}
          onChange={v => setPlotStatus(v as PlotStatus)}
          options={STATUSES}
          displayValue={v => PLOT_STATUS_LABEL[v as PlotStatus] ?? v}
        />

        <Text style={styles.section}>Initial Payment (Optional)</Text>
        <FormField
          label="Amount Paid Now (₹)"
          value={initialPayment}
          onChangeText={setInitialPayment}
          placeholder="0"
          keyboardType="numeric"
        />
        {Number(initialPayment) > 0 && (
          <SelectField
            label="Payment Mode"
            value={paymentMode}
            onChange={setPaymentMode}
            options={[...PAYMENT_MODES]}
          />
        )}

        <FormField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Additional notes (optional)"
          multiline
          numberOfLines={3}
        />

        <Button
          title={saving ? 'Saving…' : 'Add Buyer'}
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
  section: {
    fontSize: 13, fontWeight: '700', color: COLORS.muted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 20, marginBottom: 8,
  },
  unitCard: {
    backgroundColor: COLORS.primaryLight, borderRadius: 12,
    padding: 14, marginBottom: 12,
  },
  unitTitle: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  unitMeta: { fontSize: 12, color: COLORS.primary, marginTop: 2 },
  saveBtn: { marginTop: 24 },
});
