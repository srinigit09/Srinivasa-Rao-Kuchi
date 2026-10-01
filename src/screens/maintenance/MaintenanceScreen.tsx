import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, STATUS_COLOR, STATUS_BG } from '../../constants';
import { MaintenanceRequest, MaintenanceStatus } from '../../types';
import { AppStackParamList } from '../../navigation/RootNavigator';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, any>;
  route: RouteProp<AppStackParamList, any>;
};

const STATUS_FILTERS: (MaintenanceStatus | 'All')[] = [
  'All',
  'Reported',
  'In Progress',
  'Scheduled',
  'Resolved',
];

export default function MaintenanceScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const filterBuildingId = (route.params as any)?.buildingId;
  const buildingName = (route.params as any)?.buildingName;

  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<MaintenanceStatus | 'All'>('All');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    let query = supabase
      .from('maintenance_requests')
      .select('*, buildings(name), units(unit_number), tenants(full_name)')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });

    if (filterBuildingId) {
      query = query.eq('building_id', filterBuildingId);
    }

    const { data } = await query;
    const enriched = (data ?? []).map((r: any) => ({
      ...r,
      building_name: r.buildings?.name ?? 'Property',
      unit_number: r.units?.unit_number ?? 'General / Common Area',
      tenant_name: r.tenants?.full_name ?? r.reported_by ?? 'Owner/Resident',
    }));
    setRequests(enriched);
  }, [user, filterBuildingId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const deleteRequest = async (id: string) => {
    Alert.alert('Delete Request', 'Are you sure you want to remove this service request?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('maintenance_requests').delete().eq('id', id);
          load();
        },
      },
    ]);
  };

  const filtered = requests.filter(r =>
    selectedStatus === 'All' ? true : r.status === selectedStatus
  );

  const openCount = requests.filter(r => r.status !== 'Resolved' && r.status !== 'Cancelled').length;

  return (
    <View style={styles.container}>
      <BlueBannerHeader
        title={buildingName ? `${buildingName} - Services` : 'Services & Maintenance'}
        subtitle={`${openCount} active request${openCount !== 1 ? 's' : ''}  ·  ${requests.length} total`}
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      />

      <View style={styles.toolbar}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => navigation.navigate('AddEditMaintenanceRequest' as any, { buildingId: filterBuildingId })}
        >
          <Ionicons name="add-circle" size={18} color={COLORS.primary} />
          <Text style={styles.actionBtnText}>New Request</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.vendorBtn}
          onPress={() => navigation.navigate('VendorsDirectory' as any, {})}
        >
          <Ionicons name="people-outline" size={18} color={COLORS.secondary} />
          <Text style={[styles.actionBtnText, { color: COLORS.secondary }]}>Technicians & Directory</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.noticesBtn}
          onPress={() => navigation.navigate('SocietyNotices' as any, { buildingId: filterBuildingId, buildingName })}
        >
          <Ionicons name="megaphone-outline" size={18} color={COLORS.accent} />
          <Text style={[styles.actionBtnText, { color: COLORS.accent }]}>Notices</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterWrap}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={STATUS_FILTERS}
          keyExtractor={item => item}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => {
            const isSelected = selectedStatus === item;
            return (
              <TouchableOpacity
                style={[styles.filterChip, isSelected && styles.filterChipSelected]}
                onPress={() => setSelectedStatus(item)}
              >
                <Text style={[styles.filterChipText, isSelected && styles.filterChipTextSelected]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🛠️</Text>
            <Text style={styles.emptyTitle}>No service requests</Text>
            <Text style={styles.emptyText}>Create a new request for plumbing, electrical, repairs, or society issues.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const statusColor = STATUS_COLOR[item.status] ?? COLORS.primary;
          const statusBg = STATUS_BG[item.status] ?? COLORS.primaryLight;
          const isHighPriority = item.priority === 'High' || item.priority === 'Emergency';

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('AddEditMaintenanceRequest' as any, { requestId: item.id })}
              activeOpacity={0.8}
            >
              <View style={styles.cardTop}>
                <View style={styles.titleWrap}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.locationText}>
                    📍 {item.building_name} · {item.unit_number}
                  </Text>
                </View>

                <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
                </View>
              </View>

              <Text style={styles.cardDesc} numberOfLines={2}>
                {item.description}
              </Text>

              <View style={styles.cardMeta}>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Category:</Text>
                  <Text style={styles.metaValue}>{item.category}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Priority:</Text>
                  <Text style={[styles.metaValue, isHighPriority && { color: COLORS.danger, fontWeight: '700' }]}>
                    {item.priority}
                  </Text>
                </View>
                {item.vendor_name ? (
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Vendor:</Text>
                    <Text style={styles.metaValue}>🔧 {item.vendor_name}</Text>
                  </View>
                ) : null}
                {item.actual_cost != null && item.actual_cost > 0 ? (
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Cost:</Text>
                    <Text style={[styles.metaValue, { color: COLORS.accent, fontWeight: '700' }]}>
                      ₹{item.actual_cost}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.dateText}>
                  Reported: {new Date(item.created_at).toLocaleDateString()}
                </Text>
                <TouchableOpacity onPress={() => deleteRequest(item.id)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  toolbar: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
    gap: 4,
  },
  vendorBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.secondary,
    gap: 4,
  },
  noticesBtn: {
    flex: 0.8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.accent,
    gap: 4,
  },
  actionBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  filterWrap: { marginTop: 10 },
  filterList: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: { fontSize: 12, fontWeight: '600', color: COLORS.muted },
  filterChipTextSelected: { color: COLORS.white },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  titleWrap: { flex: 1, marginRight: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  locationText: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardDesc: { fontSize: 13, color: COLORS.text, marginTop: 8, lineHeight: 18 },
  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaLabel: { fontSize: 11, color: COLORS.muted },
  metaValue: { fontSize: 11, fontWeight: '600', color: COLORS.text },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 6,
  },
  dateText: { fontSize: 11, color: COLORS.muted },
  deleteBtn: { padding: 4 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 20 },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  emptyText: { fontSize: 13, color: COLORS.muted, textAlign: 'center', lineHeight: 18 },
});
