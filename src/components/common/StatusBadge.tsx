import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { STATUS_BG, STATUS_COLOR } from '../../constants';

interface Props {
  status: string;
}

export default function StatusBadge({ status }: Props) {
  return (
    <View style={[styles.badge, { backgroundColor: STATUS_BG[status] ?? '#F3F4F6' }]}>
      <Text style={[styles.text, { color: STATUS_COLOR[status] ?? '#374151' }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 12, fontWeight: '600' },
});
