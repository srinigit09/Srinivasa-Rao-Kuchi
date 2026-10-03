import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import Button from '../../components/common/Button';
import { showAlert } from '../../utils';

type SubscriptionPlan = {
  id: string;
  name: string;
  label: string;
  days: number | null;
  price_per_tenant: number;
  price_per_property: number;
};

export default function ActivateScreen() {
  const navigation = useNavigation();
  const { profile } = useAuth();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('created_at')
      .then(({ data }) => {
        if (data) setPlans(data as SubscriptionPlan[]);
      });
  }, []);

  const handleNotifyAdmin = async () => {
    if (!profile?.id) return;
    setLoading(true);
    const { error } = await supabase.from('app_settings').insert({
      key: `payment_request_${profile.id}_${Date.now()}`,
      value: JSON.stringify({
        user_id: profile.id,
        user_name: profile.full_name,
        user_email: profile.email,
        timestamp: new Date().toISOString(),
      }),
    });
    setLoading(false);
    if (error) {
      showAlert('Error', error.message);
    } else {
      setSubmitted(true);
    }
  };

  return (
    <View style={styles.flex}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Activate Account</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {submitted ? (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle" size={48} color={COLORS.success} />
            <Text style={styles.successTitle}>Thank you!</Text>
            <Text style={styles.successText}>
              Admin will activate your account within 24 hours. You'll be able to use the app normally once activated.
            </Text>
            <Button title="Go Back" onPress={() => navigation.goBack()} style={{ marginTop: 20 }} />
          </View>
        ) : (
          <>
            <Text style={styles.pageTitle}>Continue Your RentEase Journey</Text>
            <Text style={styles.pageSubtitle}>
              To keep using RentEase, please make a payment and notify the admin. Your access will be restored within 24 hours.
            </Text>

            {/* UPI Payment Details */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>💳 Payment Details</Text>
              <View style={styles.paymentRow}>
                <Ionicons name="phone-portrait-outline" size={18} color={COLORS.primary} />
                <Text style={styles.paymentLabel}>PhonePe / UPI</Text>
                <Text style={styles.paymentValue}>9000993305</Text>
              </View>
              <View style={styles.paymentRow}>
                <Ionicons name="link-outline" size={18} color={COLORS.primary} />
                <Text style={styles.paymentLabel}>UPI ID</Text>
                <Text style={styles.paymentValue}>9000993305@ybl</Text>
              </View>
              <Text style={styles.paymentNote}>
                Please use your registered mobile number or name as the payment remark so the admin can identify your payment.
              </Text>
            </View>

            {/* Pricing */}
            {plans.filter(p => p.price_per_tenant > 0 || p.price_per_property > 0).length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>📋 Current Pricing</Text>
                {plans.map(plan => {
                  if (plan.price_per_tenant === 0 && plan.price_per_property === 0) return null;
                  return (
                    <View key={plan.id} style={styles.pricingRow}>
                      <Text style={styles.planLabel}>{plan.label}</Text>
                      <View style={styles.pricingDetails}>
                        {plan.price_per_tenant > 0 && (
                          <Text style={styles.pricingItem}>₹{plan.price_per_tenant} / tenant</Text>
                        )}
                        {plan.price_per_property > 0 && (
                          <Text style={styles.pricingItem}>₹{plan.price_per_property} / property</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Notify button */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>✅ Already Paid?</Text>
              <Text style={styles.notifyText}>
                After making the payment, tap the button below to notify the admin. Your access will be restored within 24 hours.
              </Text>
              <Button
                title="I've Paid — Notify Admin"
                onPress={handleNotifyAdmin}
                loading={loading}
                style={{ marginTop: 12 }}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    backgroundColor: COLORS.primaryDark,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 16,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  container: { padding: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  pageSubtitle: { fontSize: 14, color: COLORS.muted, lineHeight: 20, marginBottom: 20 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  paymentLabel: { flex: 1, fontSize: 14, color: COLORS.muted },
  paymentValue: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  paymentNote: { fontSize: 12, color: COLORS.muted, marginTop: 10, lineHeight: 17 },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  planLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text, flex: 1 },
  pricingDetails: { alignItems: 'flex-end', gap: 2 },
  pricingItem: { fontSize: 13, color: COLORS.muted },
  notifyText: { fontSize: 13, color: COLORS.muted, lineHeight: 18 },
  successBox: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 16 },
  successTitle: { fontSize: 24, fontWeight: '700', color: COLORS.text, marginTop: 16, marginBottom: 8 },
  successText: { fontSize: 14, color: COLORS.muted, textAlign: 'center', lineHeight: 20 },
});
