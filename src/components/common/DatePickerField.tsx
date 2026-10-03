import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';

interface Props {
  label: string;
  value: string;        // YYYY-MM-DD
  onChange: (date: string) => void;
  required?: boolean;
  minimumDate?: Date;
  maximumDate?: Date;
}

function parseDate(s: string): Date {
  if (!s) return new Date();
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? new Date() : dt;
}

function formatYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function DatePickerField({ label, value, onChange, required, minimumDate, maximumDate }: Props) {
  const [show, setShow] = useState(false);
  const date = parseDate(value);

  const displayValue = value
    ? date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Tap to select date';

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>
          {label}{required ? <Text style={styles.required}> *</Text> : null}
        </Text>
        <TouchableOpacity style={styles.trigger} onPress={() => setShow(true)} activeOpacity={0.7}>
          <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
          <Text style={[styles.triggerText, !value && { color: COLORS.muted }]}>{displayValue}</Text>
          <Ionicons name="chevron-down" size={16} color={COLORS.muted} />
        </TouchableOpacity>

        <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{label}</Text>
                <TouchableOpacity onPress={() => setShow(false)}>
                  <Text style={styles.doneBtn}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={date}
                mode="date"
                display="spinner"
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                onChange={(_, selected) => {
                  if (selected) onChange(formatYMD(selected));
                }}
              />
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // Android: inline picker (shows natively)
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}{required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TouchableOpacity style={styles.trigger} onPress={() => setShow(true)} activeOpacity={0.7}>
        <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
        <Text style={[styles.triggerText, !value && { color: COLORS.muted }]}>{displayValue}</Text>
        <Ionicons name="chevron-down" size={16} color={COLORS.muted} />
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={date}
          mode="date"
          display="default"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={(_, selected) => {
            setShow(false);
            if (selected) onChange(formatYMD(selected));
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  required: { color: COLORS.danger },
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.white, borderRadius: 10, padding: 13,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  triggerText: { flex: 1, fontSize: 15, color: COLORS.text, fontWeight: '500' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  modalTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  doneBtn: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
});
