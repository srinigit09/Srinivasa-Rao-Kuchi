import React, { useState, useEffect, useRef } from 'react';
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
import { COLORS } from '../../constants';
import { formatCurrency, formatDate } from '../../utils';
import Card from '../../components/common/Card';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, 'MoveOut'>;
  route: RouteProp<AppStackParamList, 'MoveOut'>;
};

export default function MoveOutScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { tenantId } = route.params;
  const [tenant, setTenant] = useState<any>(null);
  const [moveOutDate, setMoveOutDate] = useState(new Date().toISOString().split('T')[0]);
  const [depositReturned, setDepositReturned] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    supabase.from('tenants')
      .select('*, units(unit_number, buildings(name))')
      .eq('id', tenantId).single()
      .then(({ data }) => {
        if (data) {
          setTenant(data);
          setDepositReturned(String(data.deposit_amount));
        }
      });
  }, [tenantId]);

  const confirm = () => {
    if (submitting.current) return;
    // Use window.confirm on web (Alert.alert is a no-op on web)
    const ok = typeof window !== 'undefined'
      ? window.confirm(`Confirm Move-Out for ${tenant?.full_name}?\n\nThis will mark the unit as vacant. This cannot be undone.`)
      : true; // on native, skip confirm here — Alert below handles it
    if (!ok) return;
    processMovOut();
  };

  const processMovOut = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);

    const { error } = await supabase.from('tenants').update({
      is_active: false,
      move_out_date: moveOutDate,
      deposit_returned: parseFloat(depositReturned) || 0,
      notes: notes || tenant?.notes || null,
    }).eq('id', tenantId);

    if (!error) {
      // Mark unit vacant only if no other active tenants remain
      const { data: otherTenants } = await supabase
        .from('tenants')
        .select('id')
        .eq('unit_id', tenant.unit_id)
        .eq('is_active', true);
      if (!otherTenants || otherTenants.length === 0) {
        await supabase.from('units').update({ is_vacant: true }).eq('id', tenant.unit_id);
      }
    }

    setLoading(false);

    if (error) {
      submitting.current = false;
      Alert.alert('Error', error.message);
      return;
    }

    // Navigate immediately (Alert is non-blocking / no-op on web)
    navigation.popToTop();
    Alert.alert('✅ Move-Out Recorded', `${tenant?.full_name} has been moved out successfully.`);
  };

  if (!tenant) return <View style={styles.loading}><Text>Loading...</Text></View>;

  const outstanding = tenant.deposit_amount - (parseFloat(depositReturned) || 0);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Card title="Tenant">
          <Text style={styles.tenantName}>{tenant.full_name}</Text>
          <Text style={styles.tenantMeta}>
            {tenant.units?.buildings?.name} · {tenant.units?.unit_number}
          </Text>
          <Text style={styles.tenantMeta}>Move-in: {formatDate(tenant.move_in_date)}</Text>
        </Card>

        <Card title="Deposit Reconciliation">
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Deposit Collected</Text>
            <Text style={styles.rowValue}>{formatCurrency(tenant.deposit_amount)}</Text>
          </View>
          <FormField
            label="Deposit to Return (₹)"
            placeholder={String(tenant.deposit_amount)}
            keyboardType="decimal-pad"
            value={depositReturned}
            onChangeText={setDepositReturned}
          />
          {outstanding !== 0 && (
            <Text style={[styles.deductText, { color: outstanding > 0 ? COLORS.danger : COLORS.success }]}>
              {outstanding > 0
                ? `Deduction: ${formatCurrency(outstanding)} (damage / dues)`
                : `Extra refund: ${formatCurrency(Math.abs(outstanding))}`}
            </Text>
          )}
        </Card>

        <FormField
          label="Move-Out Date"
          required
          placeholder="YYYY-MM-DD"
          value={moveOutDate}
          onChangeText={setMoveOutDate}
          keyboardType="numeric"
        />
        <FormField
          label="Notes (optional)"
          placeholder="Condition of unit, final remarks"
          multiline
          numberOfLines={3}
          value={notes}
          onChangeText={setNotes}
        />

        <Button title="🚪 Confirm Move-Out" onPress={confirm} loading={loading} variant="danger" style={{ marginTop: 16 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 16, paddingBottom: 40 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tenantName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  tenantMeta: { fontSize: 13, color: COLORS.muted, marginTop: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 12 },
  rowLabel: { fontSize: 13, color: COLORS.muted },
  rowValue: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  deductText: { fontSize: 13, fontWeight: '600', marginTop: -8, marginBottom: 8 },
});
