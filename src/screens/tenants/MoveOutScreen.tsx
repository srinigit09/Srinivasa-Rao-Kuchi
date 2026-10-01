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
  const [noticeVacateDate, setNoticeVacateDate] = useState('');
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
          if (data.expected_vacate_date) setNoticeVacateDate(data.expected_vacate_date);
        }
      });
  }, [tenantId]);

  const setNoticePeriod = async () => {
    if (!noticeVacateDate) {
      Alert.alert('Required', 'Please enter the expected vacating date.');
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    const isFuture = noticeVacateDate > today;

    const { error } = await supabase.from('tenants').update({
      notice_date: today,
      expected_vacate_date: noticeVacateDate,
    }).eq('id', tenantId);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Notice Period Saved', `${tenant.full_name} is marked on notice until ${noticeVacateDate}. The unit will remain occupied until actual move-out.`);
      navigation.goBack();
    }
  };

  const confirm = () => {
    if (submitting.current) return;
    const today = new Date().toISOString().split('T')[0];
    const isFuture = moveOutDate > today;

    if (isFuture) {
      Alert.alert(
        'Future Move-Out Date Detected',
        `The date ${moveOutDate} is in the future. Would you like to record this as a Notice Period instead (keeps unit occupied until actual move-out), or immediately move-out?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save as Notice Period',
            onPress: () => {
              setNoticeVacateDate(moveOutDate);
              setNoticePeriod();
            },
          },
          { text: 'Move Out Now', style: 'destructive', onPress: processMovOut },
        ]
      );
      return;
    }

    Alert.alert(
      'Confirm Move-Out',
      `Move out ${tenant?.full_name}?\n\nThis will complete move-out, free the unit as vacant, and record deposit refund.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: 'destructive', onPress: processMovOut },
      ]
    );
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
      // Mark unit vacant if it has available beds or no active occupants remain
      const { data: unitInfo } = await supabase
        .from('units')
        .select('total_beds, buildings(building_type)')
        .eq('id', tenant.unit_id)
        .single();
      const { count: remainingActiveCount } = await supabase
        .from('tenants')
        .select('id', { count: 'exact', head: true })
        .eq('unit_id', tenant.unit_id)
        .eq('is_active', true);
      const totalBeds = unitInfo?.total_beds ?? 1;
      const bType = (unitInfo as any)?.buildings?.building_type;

      const isUnitNowVacant = bType === 'pg'
        ? (remainingActiveCount ?? 0) < totalBeds
        : (remainingActiveCount ?? 0) === 0;

      if (isUnitNowVacant) {
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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 20}
    >
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

        <Card title="Notice Period / Expected Vacating">
          <Text style={{ fontSize: 13, color: COLORS.muted, marginBottom: 8 }}>
            If the resident is currently serving notice period, set their expected vacating date here. The unit stays Occupied until final move-out.
          </Text>
          <FormField
            label="Expected Vacating Date (Notice Period)"
            placeholder="YYYY-MM-DD"
            value={noticeVacateDate}
            onChangeText={setNoticeVacateDate}
            keyboardType="numeric"
          />
          <Button
            title="⏳ Save Notice Period Only"
            onPress={setNoticePeriod}
            variant="secondary"
            style={{ marginTop: 4, marginBottom: 8 }}
          />
        </Card>

        <Card title="Immediate Final Move-Out">
          <FormField
            label="Actual Move-Out Date"
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
          <Button title="🚪 Complete Final Move-Out" onPress={confirm} loading={loading} variant="danger" style={{ marginTop: 12 }} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 16, paddingBottom: 100 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tenantName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  tenantMeta: { fontSize: 13, color: COLORS.muted, marginTop: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 12 },
  rowLabel: { fontSize: 13, color: COLORS.muted },
  rowValue: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  deductText: { fontSize: 13, fontWeight: '600', marginTop: -8, marginBottom: 8 },
});
