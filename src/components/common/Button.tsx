import React from 'react';
import {
  TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle,
} from 'react-native';
import { COLORS } from '../../constants';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

export default function Button({
  title, onPress, variant = 'primary', loading, disabled, style, textStyle, fullWidth = true,
}: Props) {
  const btnStyle = [
    styles.base,
    variant === 'primary' && styles.primary,
    variant === 'secondary' && styles.secondary,
    variant === 'danger' && styles.danger,
    variant === 'ghost' && styles.ghost,
    fullWidth && { alignSelf: 'stretch' as const },
    (disabled || loading) && styles.disabled,
    style,
  ];

  const txtStyle = [
    styles.text,
    variant === 'secondary' && styles.textSecondary,
    variant === 'ghost' && styles.textGhost,
    variant === 'danger' && styles.textWhite,
    textStyle,
  ];

  return (
    <TouchableOpacity style={btnStyle} onPress={onPress} disabled={disabled || loading} activeOpacity={0.8}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={txtStyle}>{title}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: COLORS.primary },
  secondary: { backgroundColor: COLORS.primaryLight, borderWidth: 1, borderColor: COLORS.primary },
  danger: { backgroundColor: COLORS.danger },
  ghost: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.5 },
  text: { color: '#fff', fontWeight: '600', fontSize: 16 },
  textSecondary: { color: COLORS.primary },
  textGhost: { color: COLORS.primary },
  textWhite: { color: '#fff' },
});
