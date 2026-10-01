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
import { COLORS } from '../../constants';
import { SocietyNotice } from '../../types';
import { AppStackParamList } from '../../navigation/RootNavigator';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, any>;
  route: RouteProp<AppStackParamList, any>;
};

export default function SocietyNoticesScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const filterBuildingId = (route.params as any)?.buildingId;
  const buildingName = (route.params as any)?.buildingName;

  const [notices, setNotices] = useState<SocietyNotice[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    let query = supabase
      .from('society_notices')
      .select('*, buildings(name)')
      .eq('owner_id', user.id)
      .order('publish_date', { ascending: false });

    if (filterBuildingId) {
      query = query.eq('building_id', filterBuildingId);
    }

    const { data } = await query;
    const enriched = (data ?? []).map((n: any) => ({
      ...n,
      building_name: n.buildings?.name ?? 'Property / Society',
    }));
    setNotices(enriched);
  }, [user, filterBuildingId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const deleteNotice = async (id: string) => {
    Alert.alert('Delete Notice', 'Are you sure you want to remove this announcement?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('society_notices').delete().eq('id', id);
          load();
        },
      },
    ]);
  };

  const getPriorityColor = (priority: string) => {
    if (priority === 'Urgent') return COLORS.danger;
    if (priority === 'Important') return COLORS.warning;
    return COLORS.primary;
  };

  return (
    <View style={styles.container}>
      <BlueBannerHeader
        title={buildingName ? `${buildingName} Notices` : 'Society Notices & Circulars'}
        subtitle={`${notices.length} active announcement${notices.length !== 1 ? 's' : ''}`}
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      />

      <FlatList
        data={notices}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate('AddEditNotice' as any, { buildingId: filterBuildingId })}
          >
            <Ionicons name="megaphone" size={18} color={COLORS.secondary} />
            <Text style={styles.addText}>Post New Society Notice / Circular</Text>
          </TouchableOpacity>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📢</Text>
            <Text style={styles.emptyTitle}>No notices published</Text>
            <Text style={styles.emptyText}>Broadcast water supply timings, maintenance schedules, AGM meetings, festival events, or community guidelines.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const pColor = getPriorityColor(item.priority);
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryText}>{item.category}</Text>
                </View>
                {item.priority !== 'Normal' && (
                  <View style={[styles.priorityBadge, { backgroundColor: pColor + '20' }]}>
                    <Text style={[styles.priorityText, { color: pColor }]}>⚠️ {item.priority}</Text>
                  </View>
                )}
              </View>

              <Text style={styles.noticeTitle}>{item.title}</Text>
              <Text style={styles.societySub}>🏛️ {item.building_name}</Text>

              <Text style={styles.noticeContent}>{item.content}</Text>

              <View style={styles.cardFooter}>
                <Text style={styles.dateText}>
                  Published: {new Date(item.publish_date).toLocaleDateString()}
                  {item.expiry_date ? ` · Valid till: ${new Date(item.expiry_date).toLocaleDateString()}` : ''}
                </Text>
                <TouchableOpacity onPress={() => deleteNotice(item.id)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
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
    borderColor: COLORS.secondary,
    borderStyle: 'dashed',
    marginBottom: 16,
    gap: 8,
  },
  addText: { fontSize: 14, fontWeight: '600', color: COLORS.secondary },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  categoryBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  priorityText: { fontSize: 11, fontWeight: '700' },
  noticeTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  societySub: { fontSize: 12, fontWeight: '500', color: COLORS.secondary, marginBottom: 8 },
  noticeContent: { fontSize: 13, color: COLORS.text, lineHeight: 19 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  dateText: { fontSize: 11, color: COLORS.muted },
  deleteBtn: { padding: 4 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 20 },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  emptyText: { fontSize: 13, color: COLORS.muted, textAlign: 'center', lineHeight: 18 },
});
