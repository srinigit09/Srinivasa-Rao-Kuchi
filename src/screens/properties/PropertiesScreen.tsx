import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useProperty } from '../../context/PropertyContext';
import { COLORS } from '../../constants';
import {
  PropertySummary, BuildingType,
  BUILDING_TYPE_LABEL, BUILDING_TYPE_ICON,
  isRealEstateType, PLOT_STATUS_COLOR,
} from '../../types';
import { formatCurrency } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList> };

const SECTION_ORDER: BuildingType[] = [
  'residential', 'pg', 'open_plots', 'housing_villa', 'farm_land',
];

export default function PropertiesScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { allProperties, loadProperties, setActiveProperty } = useProperty();
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => { loadProperties(); }, [loadProperties]));
  const onRefresh = async () => {
    setRefreshing(true);
    await loadProperties();
    setRefreshing(false);
  };

  const deleteProperty = async (id: string, name: string) => {
    Alert.alert(
      'Delete Property',
      `Delete "${name}"? This will also delete all units, tenants/buyers and payments.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            await supabase.from('buildings').delete().eq('id', id);
            loadProperties();
          },
        },
      ],
    );
  };

  // Group by type
  const grouped: { type: BuildingType; items: PropertySummary[] }[] = SECTION_ORDER
    .map(t => ({ type: t, items: allProperties.filter(p => p.building_type === t) }))
    .filter(g => g.items.length > 0);

  const totalProperties = allProperties.length;
  const subtitle = `${totalProperties} propert${totalProperties !== 1 ? 'ies' : 'y'}`;

  return (
    <View style={styles.container}>
      <BlueBannerHeader title="Properties" subtitle={subtitle} />

      <FlatList
        data={grouped}
        keyExtractor={g => g.type}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate('AddPropertyType')}
          >
            <Ionicons name="add-circle" size={22} color={COLORS.primary} />
            <Text style={styles.addText}>Add new Property</Text>
          </TouchableOpacity>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🏢</Text>
            <Text style={styles.emptyTitle}>No properties yet</Text>
            <Text style={styles.emptyText}>Tap "Add new Property" to get started.</Text>
          </View>
        }
        renderItem={({ item: group }) => (
          <View style={styles.group}>
            {/* Section header */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>{BUILDING_TYPE_ICON[group.type]}</Text>
              <Text style={styles.sectionTitle}>{BUILDING_TYPE_LABEL[group.type]}</Text>
              <Text style={styles.sectionCount}>{group.items.length}</Text>
            </View>

            {/* Property cards */}
            {group.items.map(item => (
              <PropertyCard
                key={item.id}
                item={item}
                onPress={() => {
                  setActiveProperty({ id: item.id, name: item.name, building_type: item.building_type });
                  if (isRealEstateType(item.building_type)) {
                    navigation.navigate('Plots', { buildingId: item.id });
                  } else {
                    navigation.navigate('BuildingDetail', { buildingId: item.id });
                  }
                }}
                onEdit={() => navigation.navigate('AddEditBuilding', { buildingId: item.id })}
                onDelete={() => deleteProperty(item.id, item.name)}
              />
            ))}
          </View>
        )}
      />
    </View>
  );
}

// ── Property Card ─────────────────────────────────────────────────────────────

function PropertyCard({
  item, onPress, onEdit, onDelete,
}: {
  item: PropertySummary;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isRE = isRealEstateType(item.building_type);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardLeft}>
        <Text style={styles.cardName}>{item.name}</Text>

        {/* Stats row */}
        {isRE ? (
          <View style={styles.statsRow}>
            <StatChip label="Total" value={item.total_units} color={COLORS.primary} />
            <StatChip label="Available" value={item.vacant_units} color={PLOT_STATUS_COLOR.available} />
            <StatChip label="Booked" value={item.booked_units ?? 0} color={PLOT_STATUS_COLOR.booked} />
            <StatChip label="Sold" value={item.sold_units ?? 0} color={PLOT_STATUS_COLOR.sold} />
          </View>
        ) : (
          <View style={styles.statsRow}>
            <StatChip label="Units" value={item.total_units} color={COLORS.primary} />
            <StatChip
              label="Occupied"
              value={item.total_units - item.vacant_units}
              color={COLORS.success}
            />
            <StatChip label="Vacant" value={item.vacant_units} color={COLORS.warning} />
          </View>
        )}

        {/* Sale value for RE */}
        {isRE && (item.total_sale_value ?? 0) > 0 && (
          <Text style={styles.saleValue}>
            Total Value: {formatCurrency(item.total_sale_value ?? 0)}
          </Text>
        )}
      </View>

      <View style={styles.cardRight}>
        <TouchableOpacity onPress={onEdit} style={styles.iconBtn}>
          <Ionicons name="pencil-outline" size={18} color={COLORS.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.iconBtn}>
          <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.statChip, { borderColor: color + '40' }]}>
      <Text style={[styles.statVal, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: 14, gap: 14, paddingBottom: 32 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.primaryLight, padding: 15,
    borderRadius: 12, marginBottom: 2,
  },
  addText: { color: COLORS.primary, fontWeight: '700', fontSize: 15 },

  group: { gap: 8 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 4, paddingBottom: 2,
  },
  sectionIcon: { fontSize: 16 },
  sectionTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  sectionCount: {
    fontSize: 11, fontWeight: '700', color: COLORS.white,
    backgroundColor: COLORS.muted, borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2,
  },

  card: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'flex-start',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardLeft: { flex: 1, gap: 8 },
  cardName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  statsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statChip: {
    alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1, backgroundColor: COLORS.bg,
    minWidth: 56,
  },
  statVal: { fontSize: 17, fontWeight: '800' },
  statLabel: { fontSize: 10, color: COLORS.muted, marginTop: 1 },
  saleValue: { fontSize: 12, color: COLORS.muted, fontWeight: '600' },
  cardRight: { gap: 8, paddingLeft: 8 },
  iconBtn: { padding: 6 },

  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.muted },
});
