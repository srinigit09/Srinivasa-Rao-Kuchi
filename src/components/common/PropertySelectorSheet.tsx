import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  FlatList, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useProperty } from '../../context/PropertyContext';
import { COLORS } from '../../constants';
import {
  BuildingType, PropertySummary,
  BUILDING_TYPE_LABEL, BUILDING_TYPE_ICON,
  isRentalType, isRealEstateType,
} from '../../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onAddProperty: () => void;
}

const SECTION_RENTAL = 'Rental & PG';
const SECTION_RE     = 'Real Estate';

export default function PropertySelectorSheet({ visible, onClose, onAddProperty }: Props) {
  const { allProperties, activeProperty, setActiveProperty, propertiesLoading } = useProperty();

  const rentalProps = allProperties.filter(p => isRentalType(p.building_type));
  const reProps     = allProperties.filter(p => isRealEstateType(p.building_type));

  const handleSelect = (p: PropertySummary | null) => {
    if (p) {
      setActiveProperty({ id: p.id, name: p.name, building_type: p.building_type });
    } else {
      setActiveProperty(null);
    }
    onClose();
  };

  const renderItem = (item: PropertySummary) => {
    const isActive = activeProperty?.id === item.id;
    const icon = BUILDING_TYPE_ICON[item.building_type];
    const label = BUILDING_TYPE_LABEL[item.building_type];
    const isRE = isRealEstateType(item.building_type);

    const subLine = isRE
      ? `${item.total_units} units · ${item.vacant_units} available · ${item.sold_units ?? 0} sold`
      : `${item.total_units} units · ${item.vacant_units} vacant`;

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.item, isActive && styles.itemActive]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.7}
      >
        <Text style={styles.itemIcon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.itemName, isActive && { color: COLORS.primary }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.itemSub}>{label} · {subLine}</Text>
        </View>
        {isActive && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>

          {/* Handle bar */}
          <View style={styles.handle} />

          <Text style={styles.sheetTitle}>Select Property</Text>

          {propertiesLoading ? (
            <ActivityIndicator color={COLORS.primary} style={{ margin: 24 }} />
          ) : (
            <FlatList
              data={[]}
              renderItem={null}
              ListHeaderComponent={
                <>
                  {/* All Properties option */}
                  <TouchableOpacity
                    style={[styles.item, !activeProperty && styles.itemActive]}
                    onPress={() => handleSelect(null)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.itemIcon}>🏢</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemName, !activeProperty && { color: COLORS.primary }]}>
                        All Properties
                      </Text>
                      <Text style={styles.itemSub}>
                        {allProperties.length} propert{allProperties.length !== 1 ? 'ies' : 'y'} · overview
                      </Text>
                    </View>
                    {!activeProperty && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
                  </TouchableOpacity>

                  {/* Rental & PG section */}
                  {rentalProps.length > 0 && (
                    <>
                      <Text style={styles.sectionHeader}>{SECTION_RENTAL}</Text>
                      {rentalProps.map(renderItem)}
                    </>
                  )}

                  {/* Real Estate section */}
                  {reProps.length > 0 && (
                    <>
                      <Text style={styles.sectionHeader}>{SECTION_RE}</Text>
                      {reProps.map(renderItem)}
                    </>
                  )}
                </>
              }
              style={{ maxHeight: 420 }}
              keyExtractor={() => 'header'}
            />
          )}

          {/* Add new Property */}
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => { onClose(); onAddProperty(); }}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle" size={20} color={COLORS.primary} />
            <Text style={styles.addText}>Add new Property</Text>
          </TouchableOpacity>

        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, elevation: 20,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 15, fontWeight: '800', color: COLORS.text,
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  sectionHeader: {
    fontSize: 11, fontWeight: '700', color: COLORS.muted,
    textTransform: 'uppercase', letterSpacing: 0.6,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4,
    backgroundColor: COLORS.bg,
  },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  itemActive: { backgroundColor: COLORS.primaryLight },
  itemIcon: { fontSize: 22 },
  itemName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  itemSub:  { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    margin: 16, marginTop: 12,
    backgroundColor: COLORS.primaryLight,
    padding: 14, borderRadius: 12,
  },
  addText: { color: COLORS.primary, fontWeight: '700', fontSize: 15 },
});
