/**
 * PeopleScreen — context-aware wrapper:
 * • Rental / PG → shows TenantsScreen
 * • Real Estate (open_plots, housing_villa, farm_land) → shows BuyersScreen
 * • All Properties → shows both sections
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useProperty } from '../../context/PropertyContext';
import { COLORS } from '../../constants';
import { AppStackParamList } from '../../navigation/RootNavigator';
import TenantsScreen from '../tenants/TenantsScreen';
import BuyersScreen from '../buyers/BuyersScreen';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList> };

export default function PeopleScreen({ navigation }: Props) {
  const { activeProperty, isRental, isPG, isRealEstate, isAllProperties } = useProperty();

  const isRentalOrPG = isRental || isPG;

  // Single-type context: delegate directly
  if (isRentalOrPG) {
    return <TenantsScreen navigation={navigation} />;
  }
  if (isRealEstate) {
    return <BuyersScreen navigation={navigation} />;
  }

  // All Properties: show quick-access tiles to both sections
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>People</Text>
        <Text style={styles.headerSub}>Manage tenants and buyers across all properties</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Tenants tile */}
        <TouchableOpacity
          style={[styles.tile, { borderLeftColor: COLORS.primary }]}
          onPress={() => navigation.navigate('Tenants')}
          activeOpacity={0.8}
        >
          <View style={[styles.tileIcon, { backgroundColor: COLORS.primaryLight }]}>
            <Ionicons name="people" size={28} color={COLORS.primary} />
          </View>
          <View style={styles.tileText}>
            <Text style={styles.tileName}>Tenants</Text>
            <Text style={styles.tileSub}>Rental & PG tenants, rent records</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.muted} />
        </TouchableOpacity>

        {/* Buyers tile */}
        <TouchableOpacity
          style={[styles.tile, { borderLeftColor: '#16A34A' }]}
          onPress={() => navigation.navigate('Buyers')}
          activeOpacity={0.8}
        >
          <View style={[styles.tileIcon, { backgroundColor: '#DCFCE7' }]}>
            <Ionicons name="person-add" size={28} color="#16A34A" />
          </View>
          <View style={styles.tileText}>
            <Text style={styles.tileName}>Buyers</Text>
            <Text style={styles.tileSub}>Plot & unit buyers, sale payments</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.muted} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    backgroundColor: '#1D4ED8', paddingTop: 56, paddingBottom: 18, paddingHorizontal: 20,
  },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#fff' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  scroll: { padding: 16, gap: 12 },
  tile: {
    backgroundColor: '#fff', borderRadius: 14,
    flexDirection: 'row', alignItems: 'center',
    padding: 16, gap: 14,
    borderLeftWidth: 4,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  tileIcon: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  tileText: { flex: 1 },
  tileName: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  tileSub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
});
