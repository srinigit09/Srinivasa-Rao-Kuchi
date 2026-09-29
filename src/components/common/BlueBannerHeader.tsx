import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const HEADER_BLUE = '#1D4ED8';

interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}

export default function BlueBannerHeader({ title, subtitle, onBack }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BLUE} />
      <View style={[styles.banner, { paddingTop: insets.top + 10 }]}>
        <View style={styles.row}>
          {onBack ? (
            <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
          ) : <View style={styles.backPlaceholder} />}
          <View style={styles.textBlock}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: HEADER_BLUE,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPlaceholder: { width: 36, height: 36 },
  textBlock: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
});
