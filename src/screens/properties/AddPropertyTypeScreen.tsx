import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppStackParamList } from '../../navigation/RootNavigator';
import { BuildingType, BUILDING_TYPE_LABEL } from '../../types';
import { COLORS } from '../../constants';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList, 'AddPropertyType'> };

interface TypeCard {
  type: BuildingType;
  icon: string;
  title: string;
  subtitle: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const TYPE_CARDS: TypeCard[] = [
  {
    type: 'residential',
    icon: '🏠',
    title: 'Rental Building',
    subtitle: 'Flats, Rooms, Shops, Offices\nMonthly rent per unit',
    color: '#1D4ED8',
    bgColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  {
    type: 'pg',
    icon: '🏨',
    title: 'PG / Hostel',
    subtitle: 'Rooms with individual beds\nRent per bed (Single to 5-Sharing)',
    color: '#7C3AED',
    bgColor: '#F5F3FF',
    borderColor: '#DDD6FE',
  },
  {
    type: 'open_plots',
    icon: '🌳',
    title: 'Open Plots',
    subtitle: 'Land plots with area & facing\nTrack buyers & sale installments',
    color: '#15803D',
    bgColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  {
    type: 'housing_villa',
    icon: '🏗',
    title: 'Housing / Villa',
    subtitle: 'Flats, Houses, Villas — mixed\nConstruction stage tracking',
    color: '#D97706',
    bgColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  {
    type: 'farm_land',
    icon: '🌾',
    title: 'Farm Land',
    subtitle: 'Agricultural land parcels\nTrack buyers & sale installments',
    color: '#0F766E',
    bgColor: '#F0FDFA',
    borderColor: '#99F6E4',
  },
];

export default function AddPropertyTypeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  const handleSelect = (type: BuildingType) => {
    navigation.navigate('AddEditBuilding', { preselectedType: type });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Add new Property</Text>
          <Text style={styles.headerSub}>Choose the type of property to add</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {TYPE_CARDS.map(card => (
          <TouchableOpacity
            key={card.type}
            style={[styles.card, { backgroundColor: card.bgColor, borderColor: card.borderColor }]}
            onPress={() => handleSelect(card.type)}
            activeOpacity={0.75}
          >
            <Text style={styles.cardIcon}>{card.icon}</Text>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: card.color }]}>{card.title}</Text>
              <Text style={styles.cardSub}>{card.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={card.color} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const HEADER_BLUE = '#1D4ED8';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: HEADER_BLUE },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 16,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  list: {
    padding: 14, gap: 12, paddingBottom: 40,
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    minHeight: '100%',
  },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1.5, borderRadius: 14,
    padding: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  cardIcon: { fontSize: 36 },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 3 },
  cardSub: { fontSize: 12, color: COLORS.muted, lineHeight: 17 },
});
