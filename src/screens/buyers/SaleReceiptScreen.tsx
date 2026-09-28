import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Share, Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import { formatCurrency, formatDate } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList>;
  route: RouteProp<AppStackParamList, 'SaleReceipt'>;
};

export default function SaleReceiptScreen({ navigation, route }: Props) {
  const { paymentId } = route.params;
  const { user, profile } = useAuth();
  const [payment, setPayment] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('sale_payments')
        .select(`
          *,
          buyers(full_name, phone, amount_paid, sale_price,
            units(unit_number, custom_type, unit_type, area_sqft, area_acres,
              buildings(name, address)))
        `)
        .eq('id', paymentId)
        .single();
      setPayment(data);
    })();
  }, [paymentId]);

  const share = async () => {
    if (!payment) return;
    const b = payment.buyers;
    const u = b?.units;
    const bldg = u?.buildings;
    const msg = [
      `🏠 PropEase — Sale Payment Receipt`,
      `Receipt #: ${payment.receipt_number ?? payment.id.slice(-8).toUpperCase()}`,
      `Installment: #${payment.installment_no ?? '—'}`,
      ``,
      `Buyer: ${b?.full_name}`,
      `Phone: ${b?.phone}`,
      `Unit: ${u?.unit_number} (${u?.custom_type ?? u?.unit_type})`,
      `Project: ${bldg?.name ?? '—'}`,
      ``,
      `Amount Paid: ${formatCurrency(payment.amount)}`,
      `Payment Date: ${formatDate(payment.payment_date)}`,
      `Mode: ${payment.payment_mode ?? '—'}`,
      `Total Paid: ${formatCurrency(b?.amount_paid ?? 0)} / ${formatCurrency(b?.sale_price ?? 0)}`,
      `Balance: ${formatCurrency((b?.sale_price ?? 0) - (b?.amount_paid ?? 0))}`,
      payment.notes ? `Notes: ${payment.notes}` : null,
      ``,
      `— ${profile?.full_name ?? 'Owner'}`,
    ].filter(Boolean).join('\n');

    await Share.share({ message: msg });
  };

  if (!payment) return null;

  const b   = payment.buyers;
  const u   = b?.units;
  const bldg = u?.buildings;
  const receiptNo = payment.receipt_number ?? payment.id.slice(-8).toUpperCase();
  const totalPaid = b?.amount_paid ?? 0;
  const salePrice = b?.sale_price ?? 0;
  const balance   = salePrice - totalPaid;

  return (
    <View style={styles.container}>
      <BlueBannerHeader
        title="Sale Receipt"
        subtitle={`Installment #${payment.installment_no ?? '—'}`}
        onBack={() => navigation.navigate('BuyerProfile', { buyerId: b?.id ?? '' })}
        rightAction={{ icon: 'share-outline', onPress: share }}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Receipt card */}
        <View style={styles.receiptCard}>
          {/* Header */}
          <View style={styles.receiptHeader}>
            <Text style={styles.receiptTitle}>PropEase</Text>
            <Text style={styles.receiptSub}>Sale Payment Receipt</Text>
            {profile?.full_name && (
              <Text style={styles.ownerName}>{profile.full_name}</Text>
            )}
          </View>

          <View style={styles.divider} />

          <View style={styles.receiptRow}>
            <Text style={styles.receiptLbl}>Receipt #</Text>
            <Text style={styles.receiptVal}>{receiptNo}</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLbl}>Installment</Text>
            <Text style={styles.receiptVal}>#{payment.installment_no ?? '—'}</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLbl}>Date</Text>
            <Text style={styles.receiptVal}>{formatDate(payment.payment_date)}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.receiptRow}>
            <Text style={styles.receiptLbl}>Buyer</Text>
            <Text style={styles.receiptVal}>{b?.full_name}</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLbl}>Phone</Text>
            <Text style={styles.receiptVal}>{b?.phone}</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLbl}>Unit</Text>
            <Text style={styles.receiptVal}>
              {u?.unit_number} ({u?.custom_type ?? u?.unit_type})
            </Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLbl}>Project</Text>
            <Text style={styles.receiptVal}>{bldg?.name ?? '—'}</Text>
          </View>
          {bldg?.address ? (
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLbl}>Address</Text>
              <Text style={[styles.receiptVal, { flex: 1, textAlign: 'right' }]}>{bldg.address}</Text>
            </View>
          ) : null}

          <View style={styles.divider} />

          <View style={styles.receiptRow}>
            <Text style={styles.receiptLbl}>Mode</Text>
            <Text style={styles.receiptVal}>{payment.payment_mode ?? '—'}</Text>
          </View>
          {payment.notes ? (
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLbl}>Notes</Text>
              <Text style={[styles.receiptVal, { flex: 1, textAlign: 'right', color: COLORS.muted }]}>
                {payment.notes}
              </Text>
            </View>
          ) : null}

          <View style={[styles.divider, { marginVertical: 12 }]} />

          {/* Amount highlight */}
          <View style={styles.amtHighlight}>
            <Text style={styles.amtLabel}>Amount Received</Text>
            <Text style={styles.amtValue}>{formatCurrency(payment.amount)}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.receiptRow}>
            <Text style={styles.receiptLbl}>Total Sale Price</Text>
            <Text style={styles.receiptVal}>{formatCurrency(salePrice)}</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLbl}>Total Paid</Text>
            <Text style={[styles.receiptVal, { color: COLORS.success }]}>{formatCurrency(totalPaid)}</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLbl}>Balance Due</Text>
            <Text style={[styles.receiptVal, { color: '#D97706', fontWeight: '800' }]}>
              {formatCurrency(balance)}
            </Text>
          </View>

          <View style={styles.thankYou}>
            <Text style={styles.thankYouText}>Thank you for your payment!</Text>
          </View>
        </View>

        {/* Share button */}
        <TouchableOpacity style={styles.shareBtn} onPress={share}>
          <Ionicons name="share-outline" size={20} color={COLORS.white} />
          <Text style={styles.shareBtnText}>Share Receipt</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 16, paddingBottom: 48 },

  receiptCard: {
    backgroundColor: COLORS.white, borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
    overflow: 'hidden',
  },
  receiptHeader: {
    backgroundColor: '#1D4ED8', padding: 24, alignItems: 'center',
  },
  receiptTitle: { fontSize: 22, fontWeight: '900', color: COLORS.white, letterSpacing: 1 },
  receiptSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  ownerName: { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 8, fontWeight: '600' },

  divider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: 16 },

  receiptRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 9,
  },
  receiptLbl: { fontSize: 13, color: COLORS.muted },
  receiptVal: { fontSize: 13, fontWeight: '700', color: COLORS.text },

  amtHighlight: {
    backgroundColor: COLORS.primaryLight, margin: 16,
    borderRadius: 12, padding: 16, alignItems: 'center',
  },
  amtLabel: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  amtValue: { fontSize: 28, fontWeight: '900', color: COLORS.primary, marginTop: 4 },

  thankYou: { padding: 16, alignItems: 'center' },
  thankYouText: { fontSize: 13, color: COLORS.muted, fontStyle: 'italic' },

  shareBtn: {
    marginTop: 16, backgroundColor: COLORS.primary, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
  },
  shareBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
});
