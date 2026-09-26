import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { COLORS } from '../../constants';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  title?: string;
}

export default function Card({ children, style, title }: Props) {
  return (
    <View style={[styles.card, style]}>
      {title && <Text style={styles.title}>{title}</Text>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
});
