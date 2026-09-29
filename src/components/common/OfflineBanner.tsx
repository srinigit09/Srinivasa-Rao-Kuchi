import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

/**
 * Bottom toast — appears only when the device is actually offline.
 * The 6-second startup delay in useNetworkStatus prevents false triggers
 * on app boot. Renders nothing when online.
 */
export default function OfflineBanner() {
  const { isOffline } = useNetworkStatus();
  const insets = useSafeAreaInsets();

  if (!isOffline) return null;

  return (
    <View style={[styles.toast, { bottom: insets.bottom + 56 }]}>
      <Ionicons name="cloud-offline-outline" size={15} color="#92400E" />
      <Text style={styles.text}>No internet — data may be unavailable</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    zIndex: 9999,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 6,
  },
  text: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
});
