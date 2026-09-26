import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { COLORS } from '../../constants';

interface Props extends TextInputProps {
  label: string;
  error?: string;
  required?: boolean;
}

export default function FormField({ label, error, required, style, ...rest }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null, style as any]}
        placeholderTextColor={COLORS.muted}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontSize: 13, color: COLORS.muted, marginBottom: 6, fontWeight: '500' },
  required: { color: COLORS.danger },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  inputError: { borderColor: COLORS.danger },
  error: { color: COLORS.danger, fontSize: 12, marginTop: 4 },
});
