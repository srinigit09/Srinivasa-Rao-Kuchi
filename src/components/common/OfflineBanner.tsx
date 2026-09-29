import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

/**
 * Renders a persistent red banner at the very top of the screen
 * when the device has no internet connection.
 * Slides in smoothly when offline, slides out when back online.
 * Place this once inside App.tsx — it covers all screens automatically.
 */
export default function OfflineBanner() {
  const { isOffline } = useNetworkStatus();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-80)).current;
  // Track whether the banner has ever been shown — avoid rendering DOM at all
  // until we know we're offline (eliminates the red-sliver-on-startup bug).
  const [hasBeenOffline, setHasBeenOffline] = React.useState(false);

  useEffect(() => {
    if (isOffline) setHasBeenOffline(true);
    Animated.timing(slideAnim, {
      toValue: isOffline ? 0 : -80,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isOffline, slideAnim]);

  // Don't render anything until the device has actually gone offline at least once.
  // This prevents the red background from painting at app start.
  if (!hasBeenOffline) return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        { paddingTop: insets.top + 6, transform: [{ translateY: slideAnim }] },
      ]}
      pointerEvents="none"
    >
      <View style={styles.inner}>
        <Ionicons name="wifi-outline" size={16} color="#fff" />
        <Text style={styles.text}>No internet connection</Text>
        <Text style={styles.sub}>Data may not load until you're back online</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: '#DC2626',
    paddingBottom: 10,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 10,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  text: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    flex: 1,
  },
  sub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    width: '100%',
    marginTop: 1,
  },
});
