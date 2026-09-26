import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { COLORS } from '../../constants';

interface Props {
  label: string;
  options: string[];
  value: string;
  onChange: (val: string) => void;
  error?: string;
  required?: boolean;
}

export default function SelectField({ label, options, value, onChange, error, required }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        <View style={styles.row}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, value === opt && styles.chipActive]}
              onPress={() => onChange(opt)}
            >
              <Text style={[styles.chipText, value === opt && styles.chipTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontSize: 13, color: COLORS.muted, marginBottom: 8, fontWeight: '500' },
  required: { color: COLORS.danger },
  scroll: { flexGrow: 0 },
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 14, color: COLORS.muted },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  error: { color: COLORS.danger, fontSize: 12, marginTop: 4 },
});
