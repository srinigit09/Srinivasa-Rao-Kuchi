import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl, Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import { ServiceVendor, MaintenanceCategory } from '../../types';
import { AppStackParamList } from '../../navigation/RootNavigator';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, any>;
  route: RouteProp<AppStackParamList, any>;
};

export default function VendorsDirectoryScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [vendors, setVendors] = useState<ServiceVendor[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('service_vendors')
      .select('*')
      .eq('owner_id', user.id)
      .order('name');
    setVendors(data ?? []);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const deleteVendor = async (id: string) => {
    Alert.alert('Remove Vendor', 'Are you sure you want to delete this vendor contact?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('service_vendors').delete().eq('id', id);
          load();
        },
      },
    ]);
  };

  const callVendor = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  return (
    <View style={styles.container}>
      <BlueBannerHeader
        title="Vendors & Service Directory"
        subtitle={`${vendors.length} saved contact${vendors.length !== 1 ? 's' : ''}`}
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      />

      <FlatList
        data={vendors}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate('AddEditVendor' as any, {})}
          >
            <Ionicons name="person-add" size={18} color={COLORS.primary} />
            <Text style={styles.addText}>Add New Technician / Vendor</Text>
          </TouchableOpacity>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📇</Text>
            <Text style={styles.emptyTitle}>No service contacts yet</Text>
            <Text style={styles.emptyText}>Keep phone numbers of electricians, plumbers, carpenters, painters, and security staff handy.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardLeft}>
              <View style={styles.nameRow}>
                <Text style={styles.vendorName}>{item.name}</Text>
                <View style={styles.categoryChip}>
                  <Text style={styles.categoryText}>{item.category}</Text>
                </View>
              </View>

              <Text style={styles.phoneText}>📞 {item.phone}</Text>
              {item.notes ? <Text style={styles.notesText}>{item.notes}</Text> : null}
            </View>

            <View style={styles.cardRight}>
              <TouchableOpacity
                style={styles.callBtn}
                onPress={() => callVendor(item.phone)}
              >
                <Ionicons name="call" size={16} color={COLORS.white} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => navigation.navigate('AddEditVendor' as any, { vendorId: item.id })}
              >
                <Ionicons name="pencil-outline" size={16} color={COLORS.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => deleteVendor(item.id)}
              >
                <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: 16, paddingBottom: 32 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    marginBottom: 16,
    gap: 8,
  },
  addText: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeft: { flex: 1, marginRight: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  vendorName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  categoryChip: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryText: { fontSize: 11, fontWeight: '600', color: COLORS.primary },
  phoneText: { fontSize: 13, color: COLORS.text, marginTop: 2 },
  notesText: { fontSize: 12, color: COLORS.muted, marginTop: 4 },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  callBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
  },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 20 },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  emptyText: { fontSize: 13, color: COLORS.muted, textAlign: 'center', lineHeight: 18 },
});
