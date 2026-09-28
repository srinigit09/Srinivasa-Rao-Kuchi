import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, RefreshControl, TextInput, Modal, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants';
import { formatDate } from '../../utils';
import { AppStackParamList } from '../../navigation/RootNavigator';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';
import { ConstructionStage, CONSTRUCTION_STAGE_NAMES } from '../../types';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList>;
  route: RouteProp<AppStackParamList, 'ConstructionStages'>;
};

export default function ConstructionStagesScreen({ navigation, route }: Props) {
  const { unitId, unitNumber } = route.params;
  const { user } = useAuth();
  const [stages, setStages] = useState<ConstructionStage[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [editStage, setEditStage] = useState<ConstructionStage | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('construction_stages')
      .select('*')
      .eq('unit_id', unitId)
      .eq('owner_id', user.id)
      .order('stage_order');
    setStages((data ?? []) as ConstructionStage[]);
  }, [user, unitId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const completedCount = stages.filter(s => s.completed).length;
  const progress = stages.length ? Math.round((completedCount / stages.length) * 100) : 0;

  const toggleComplete = async (stage: ConstructionStage) => {
    const newCompleted = !stage.completed;
    const updates: Partial<ConstructionStage> = {
      completed: newCompleted,
      completed_at: newCompleted ? new Date().toISOString() : null,
    };
    await supabase.from('construction_stages').update(updates).eq('id', stage.id);
    load();
  };

  const openEdit = (stage: ConstructionStage) => {
    setEditStage(stage);
    setEditNotes(stage.notes ?? '');
  };

  const saveNotes = async () => {
    if (!editStage) return;
    setSaving(true);
    await supabase
      .from('construction_stages')
      .update({ notes: editNotes.trim() || null })
      .eq('id', editStage.id);
    setSaving(false);
    setEditStage(null);
    load();
  };

  return (
    <View style={styles.container}>
      <BlueBannerHeader
        title={`Unit ${unitNumber}`}
        subtitle="Construction Stages"
        onBack={() => navigation.goBack()}
      />

      {/* Progress bar */}
      <View style={styles.progressBox}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Overall Progress</Text>
          <Text style={styles.progressPct}>{progress}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.progressSub}>{completedCount} of {stages.length} stages completed</Text>
      </View>

      <FlatList
        data={stages}
        keyExtractor={s => s.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🏗️</Text>
            <Text style={styles.emptyTitle}>No stages found</Text>
            <Text style={styles.emptyText}>
              Construction stages are created automatically when you add a unit of type Flat, House, or Villa.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const isFirst = index === 0;
          const prevCompleted = index === 0 || stages[index - 1]?.completed;
          const canToggle = item.completed || prevCompleted; // must complete in order

          return (
            <View style={[styles.stageCard, item.completed && styles.stageCardDone]}>
              {/* Stage connector line */}
              <View style={styles.timelineCol}>
                <View style={[
                  styles.circle,
                  item.completed ? styles.circleDone : canToggle ? styles.circleReady : styles.circleLocked,
                ]}>
                  {item.completed
                    ? <Ionicons name="checkmark" size={14} color="#fff" />
                    : <Text style={styles.circleNum}>{index + 1}</Text>
                  }
                </View>
                {index < stages.length - 1 && (
                  <View style={[styles.line, item.completed && styles.lineDone]} />
                )}
              </View>

              {/* Content */}
              <View style={styles.stageContent}>
                <View style={styles.stageRow}>
                  <Text style={[styles.stageName, item.completed && styles.stageNameDone]}>
                    {item.stage_name}
                  </Text>
                  <View style={styles.stageActions}>
                    <TouchableOpacity onPress={() => openEdit(item)} style={styles.actionBtn}>
                      <Ionicons name="document-text-outline" size={15} color={COLORS.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => canToggle ? toggleComplete(item) : Alert.alert(
                        'Complete previous stage first',
                        `Please complete "${stages[index - 1]?.stage_name}" before marking this stage.`
                      )}
                      style={styles.actionBtn}
                    >
                      <Ionicons
                        name={item.completed ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={item.completed ? COLORS.success : canToggle ? COLORS.primary : COLORS.muted}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {item.completed && item.completed_at && (
                  <Text style={styles.completedDate}>
                    ✓ Completed on {formatDate(item.completed_at)}
                  </Text>
                )}
                {!item.completed && !canToggle && (
                  <Text style={styles.lockedText}>🔒 Complete previous stage first</Text>
                )}
                {item.notes ? (
                  <Text style={styles.notes}>{item.notes}</Text>
                ) : null}
              </View>
            </View>
          );
        }}
      />

      {/* Notes edit modal */}
      <Modal visible={!!editStage} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{editStage?.stage_name}</Text>
            <Text style={styles.modalLabel}>Notes (optional)</Text>
            <TextInput
              style={styles.notesInput}
              value={editNotes}
              onChangeText={setEditNotes}
              multiline
              numberOfLines={4}
              placeholder="Add notes, materials used, contractor info…"
              textAlignVertical="top"
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setEditStage(null)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={saveNotes}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: 16, paddingBottom: 40 },

  // Progress
  progressBox: {
    backgroundColor: COLORS.white, margin: 14, marginBottom: 4,
    borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  progressPct: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  progressTrack: {
    height: 8, backgroundColor: COLORS.border, borderRadius: 4, overflow: 'hidden',
  },
  progressFill: { height: 8, backgroundColor: COLORS.primary, borderRadius: 4 },
  progressSub: { fontSize: 11, color: COLORS.muted, marginTop: 6 },

  // Timeline cards
  stageCard: {
    flexDirection: 'row', backgroundColor: COLORS.white,
    borderRadius: 12, marginBottom: 4,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  stageCardDone: { backgroundColor: '#F0FDF4' },
  timelineCol: { alignItems: 'center', paddingTop: 16, paddingLeft: 14, width: 36 },
  circle: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  circleDone: { backgroundColor: COLORS.success },
  circleReady: { backgroundColor: COLORS.primary },
  circleLocked: { backgroundColor: COLORS.border },
  circleNum: { fontSize: 12, fontWeight: '700', color: COLORS.white },
  line: { width: 2, flex: 1, backgroundColor: COLORS.border, marginTop: 4 },
  lineDone: { backgroundColor: COLORS.success },

  stageContent: { flex: 1, padding: 14, paddingLeft: 10 },
  stageRow: { flexDirection: 'row', alignItems: 'center' },
  stageName: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text },
  stageNameDone: { color: COLORS.success },
  stageActions: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  actionBtn: { padding: 4 },
  completedDate: { fontSize: 11, color: COLORS.success, marginTop: 4 },
  lockedText: { fontSize: 11, color: COLORS.muted, marginTop: 4 },
  notes: {
    fontSize: 12, color: COLORS.muted, marginTop: 6,
    backgroundColor: COLORS.bg, borderRadius: 6, padding: 8,
    lineHeight: 17,
  },

  // Empty
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 13, color: COLORS.muted, textAlign: 'center', paddingHorizontal: 30 },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 36,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text, marginBottom: 14 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: COLORS.muted, marginBottom: 6 },
  notesInput: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    padding: 12, fontSize: 14, color: COLORS.text,
    minHeight: 100, backgroundColor: COLORS.surface,
  },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: COLORS.muted },
  saveBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 10,
    backgroundColor: COLORS.primary, alignItems: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.white },
});
