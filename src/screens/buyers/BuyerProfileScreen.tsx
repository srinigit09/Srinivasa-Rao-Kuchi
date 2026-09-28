import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import { formatCurrency, formatDate } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';
import { Buyer, SalePayment, PLOT_STATUS_LABEL, PLOT_STATUS_COLOR, PLOT_STATUS_BG, PlotStatus } from '../../types';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList>;
  route: RouteProp<AppStackParamList, 'BuyerProfile'>;
};

export default function BuyerProfileScreen({ navigation, route }: Props) {
  const { buyerId } = route.params;
  const { user } = useAuth();
  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [payments, setPayments] = useState<SalePayment[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: buyerData }, { data: payData }] = await Promise.all([
      supabase
        .from('buyers')
        .select('*, units(unit_number, unit_type, custom_type, plot_status, sale_price, area_sqft, area_acres, buildings(name, building_type))')
        .eq('id', buyerId)
        .single(),
      supabase
        .from('sale_payments')
        .select('*')
        .eq('buyer_id', buyerId)
        .order('payment_date', { ascending: false }),
    ]);

    if (buyerData) {
      const b = buyerData as any;
      setBuyer({
        ...b,
        unit_number: b.units?.unit_number,
        unit_type: b.units?.custom_type ?? b.units?.unit_type,
        plot_status: b.units?.plot_status,
        building_name: b.units?.buildings?.name,
        building_type: b.units?.buildings?.building_type,
        balance: (b.units?.sale_price ?? b.sale_price ?? 0) - (b.amount_paid ?? 0),
      });
    }
    setPayments((payData ?? []) as SalePayment[]);
  }, [user, buyerId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const deactivateBuyer = () => {
    Alert.alert(
      'Remove Buyer?',
      'This will mark the buyer as inactive and reset the plot to Available.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            if (!buyer) return;
            await supabase.from('buyers').update({ is_active: false }).eq('id', buyer.id);
            await supabase.from('units').update({ plot_status: 'available' }).eq('id', buyer.unit_id);
            navigation.goBack();
          },
        },
      ]
    );
  };

  if (!buyer) return null;

  const salePrice = (buyer as any)?.units?.sale_price ?? buyer.sale_price ?? 0;
  const amtPaid   = buyer.amount_paid ?? 0;
  const balance   = salePrice - amtPaid;
  const paidPct   = salePrice ? Math.min(100, Math.round((amtPaid / salePrice) * 100)) : 0;
  const status    = (buyer.plot_status ?? 'booked') as PlotStatus;

  return (
    <View style={styles.container}>
      <BlueBannerHeader
        title={buyer.full_name}
        subtitle={`Unit ${buyer.unit_number} · ${buyer.building_name ?? ''}`}
        onBack={() => navigation.goBack()}
        rightAction={{
          icon: 'trash-outline',
          color: COLORS.danger,
          onPress: deactivateBuyer,
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Status + unit info */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Unit {buyer.unit_number}</Text>
              <Text style={styles.cardSub}>
                {buyer.unit_type}  {buyer.building_name ? `· ${buyer.building_name}` : ''}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: PLOT_STATUS_BG[status] }]}>
              <Text style={[styles.badgeText, { color: PLOT_STATUS_COLOR[status] }]}>
                {PLOT_STATUS_LABEL[status]}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
          <Text style={styles.infoRow}>📞  {buyer.phone}</Text>
          {buyer.email ? <Text style={styles.infoRow}>✉️  {buyer.email}</Text> : null}
          {buyer.id_type ? (
            <Text style={styles.infoRow}>🪪  {buyer.id_type}: {buyer.id_number ?? '—'}</Text>
          ) : null}
          <Text style={styles.infoRow}>📅  Booked on {formatDate(buyer.booking_date)}</Text>
          {buyer.notes ? <Text style={styles.infoRow}>📝  {buyer.notes}</Text> : null}
        </View>

        {/* Payment progress */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Payment Summary</Text>
          <View style={styles.amtGrid}>
            <View style={styles.amtBox}>
              <Text style={styles.amtVal}>{formatCurrency(salePrice)}</Text>
              <Text style={styles.amtLbl}>Sale Price</Text>
            </View>
            <View style={[styles.amtBox, { backgroundColor: '#DCFCE7' }]}>
              <Text style={[styles.amtVal, { color: COLORS.success }]}>{formatCurrency(amtPaid)}</Text>
              <Text style={styles.amtLbl}>Collected</Text>
            </View>
            <View style={[styles.amtBox, { backgroundColor: '#FEF3C7' }]}>
              <Text style={[styles.amtVal, { color: '#D97706' }]}>{formatCurrency(balance)}</Text>
              <Text style={styles.amtLbl}>Balance</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.progRow}>
            <View style={styles.progTrack}>
              <View style={[styles.progFill, { width: `${paidPct}%` }]} />
            </View>
            <Text style={styles.progPct}>{paidPct}%</Text>
          </View>
        </View>

        {/* Record Payment button */}
        <TouchableOpacity
          style={styles.recordBtn}
          onPress={() => navigation.navigate('RecordSalePayment', { buyerId: buyer.id })}
        >
          <Ionicons name="add-circle" size={20} color={COLORS.white} />
          <Text style={styles.recordBtnText}>Record Payment</Text>
        </TouchableOpacity>

        {/* Payments list */}
        <Text style={styles.listHeader}>
          Payment History ({payments.length})
        </Text>
        {payments.length === 0 && (
          <View style={styles.emptyPay}>
            <Text style={styles.emptyPayText}>No payments recorded yet.</Text>
          </View>
        )}
        {payments.map((p, i) => (
          <TouchableOpacity
            key={p.id}
            style={styles.payRow}
            onPress={() => navigation.navigate('SaleReceipt', { paymentId: p.id })}
            activeOpacity={0.8}
          >
            <View style={styles.payLeft}>
              <Text style={styles.payNum}>#{p.installment_no ?? i + 1}</Text>
              <View>
                <Text style={styles.payAmt}>{formatCurrency(p.amount)}</Text>
                <Text style={styles.payMeta}>
                  {formatDate(p.payment_date)}  {p.payment_mode ? `· ${p.payment_mode}` : ''}
                </Text>
                {p.notes ? <Text style={styles.payNotes}>{p.notes}</Text> : null}
              </View>
            </View>
            <Ionicons name="receipt-outline" size={16} color={COLORS.primary} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 14, paddingBottom: 48, gap: 12 },

  card: {
    backgroundColor: COLORS.white, borderRadius: 12,
    padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  cardSub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 12 },
  infoRow: { fontSize: 13, color: COLORS.text, marginBottom: 6, lineHeight: 20 },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.muted, marginBottom: 12 },
  amtGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  amtBox: {
    flex: 1, backgroundColor: COLORS.bg,
    borderRadius: 8, padding: 10, alignItems: 'center',
  },
  amtVal: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  amtLbl: { fontSize: 10, color: COLORS.muted, marginTop: 2 },

  progRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progTrack: { flex: 1, height: 8, backgroundColor: COLORS.border, borderRadius: 4, overflow: 'hidden' },
  progFill: { height: 8, backgroundColor: COLORS.primary, borderRadius: 4 },
  progPct: { fontSize: 12, fontWeight: '800', color: COLORS.primary, width: 38, textAlign: 'right' },

  recordBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
  },
  recordBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },

  listHeader: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginTop: 4 },
  emptyPay: { alignItems: 'center', paddingVertical: 20 },
  emptyPayText: { fontSize: 13, color: COLORS.muted },

  payRow: {
    backgroundColor: COLORS.white, borderRadius: 10, padding: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  payLeft: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', flex: 1 },
  payNum: {
    fontSize: 12, fontWeight: '800', color: COLORS.white,
    backgroundColor: COLORS.primary, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start',
  },
  payAmt: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  payMeta: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  payNotes: { fontSize: 11, color: COLORS.muted, marginTop: 2, fontStyle: 'italic' },
});
