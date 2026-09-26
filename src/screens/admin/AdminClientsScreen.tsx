import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, ScrollView, RefreshControl, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { Profile } from '../../types';
import { COLORS } from '../../constants';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import Card from '../../components/common/Card';
import { formatDate, showAlert } from '../../utils';

export default function AdminClientsScreen() {
  const [clients, setClients] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Edit / Details Modal
  const [selectedClient, setSelectedClient] = useState<Profile | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editValidityDays, setEditValidityDays] = useState('30');
  const [editIsActive, setEditIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // OTP Settings
  const [defaultOtp, setDefaultOtp] = useState('123456');
  const [useSupabaseOtp, setUseSupabaseOtp] = useState(false);
  const [otpSaving, setOtpSaving] = useState(false);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    setLoading(false);
    if (error) {
      showAlert('Error', error.message);
    } else if (data) {
      setClients(data as Profile[]);
    }
  }, []);

  const fetchOtpSettings = useCallback(async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['default_otp', 'use_supabase_otp']);
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((r: { key: string; value: string }) => { map[r.key] = r.value; });
      setDefaultOtp(map['default_otp'] ?? '123456');
      setUseSupabaseOtp(map['use_supabase_otp'] === 'true');
    }
  }, []);

  useEffect(() => {
    fetchClients();
    fetchOtpSettings();
  }, [fetchClients, fetchOtpSettings]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchClients(), fetchOtpSettings()]);
    setRefreshing(false);
  };

  const saveOtpSettings = async () => {
    if (!defaultOtp.trim() || defaultOtp.trim().length !== 6 || !/^\d{6}$/.test(defaultOtp.trim())) {
      showAlert('Invalid OTP', 'Default OTP must be exactly 6 digits.');
      return;
    }
    setOtpSaving(true);
    const updates = [
      supabase.from('app_settings').upsert({ key: 'default_otp', value: defaultOtp.trim(), updated_at: new Date().toISOString() }),
      supabase.from('app_settings').upsert({ key: 'use_supabase_otp', value: String(useSupabaseOtp), updated_at: new Date().toISOString() }),
    ];
    const results = await Promise.all(updates);
    setOtpSaving(false);
    const err = results.find(r => r.error)?.error;
    if (err) showAlert('Save Error', err.message);
    else showAlert('Saved', 'OTP settings updated successfully.');
  };

  const handleOpenEdit = (client: Profile) => {
    setSelectedClient(client);
    setEditName(client.full_name || '');
    setEditPhone(client.phone || '');
    setEditIsActive(client.is_active !== false);

    if (client.valid_until) {
      const remainingDays = Math.max(0, Math.ceil((new Date(client.valid_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      setEditValidityDays(String(remainingDays));
    } else {
      setEditValidityDays('30');
    }

    setModalVisible(true);
  };

  const handleSaveClient = async () => {
    if (!selectedClient) return;
    setSaving(true);

    const days = parseInt(editValidityDays, 10) || 30;
    const newValidUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: editName.trim() || null,
        phone: editPhone.trim() || null,
        is_active: editIsActive,
        valid_until: newValidUntil,
      })
      .eq('id', selectedClient.id);

    setSaving(false);

    if (error) {
      showAlert('Save Error', error.message);
    } else {
      showAlert('Success', 'Client updated successfully.');
      setModalVisible(false);
      fetchClients();
    }
  };

  const handleToggleStatus = async (client: Profile) => {
    const nextStatus = !(client.is_active !== false);
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: nextStatus })
      .eq('id', client.id);

    if (error) {
      showAlert('Error', error.message);
    } else {
      fetchClients();
    }
  };

  const handleDeleteClient = (client: Profile) => {
    showAlert(
      'Delete Client',
      `Are you sure you want to delete ${client.full_name || client.email}? This will remove all their data.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('profiles').delete().eq('id', client.id);
            if (error) showAlert('Delete Error', error.message);
            else {
              showAlert('Deleted', 'Client deleted.');
              fetchClients();
            }
          },
        },
      ]
    );
  };

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    return (
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q)
    );
  });

  const renderClientItem = ({ item }: { item: Profile }) => {
    const isActive = item.is_active !== false;
    const isExpired = item.valid_until ? new Date(item.valid_until) < new Date() : false;
    const isAdmin = item.role === 'admin';

    return (
      <View style={styles.clientCard}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.clientName}>{item.full_name || 'Unnamed Client'}</Text>
              {isAdmin && <Text style={styles.adminBadge}>ADMIN</Text>}
            </View>
            <Text style={styles.clientSub}>✉️ {item.email || 'No email'}</Text>
            {item.phone ? <Text style={styles.clientSub}>📞 {item.phone}</Text> : null}
            {item.dob ? <Text style={styles.clientSub}>🎂 DOB: {item.dob}</Text> : null}
            <Text style={styles.clientSub}>
              ⏳ Validity: {item.valid_until ? formatDate(item.valid_until) : '30 days'} {isExpired ? '(EXPIRED)' : ''}
            </Text>
          </View>

          <View style={styles.statusCol}>
            <TouchableOpacity
              style={[styles.statusBadge, isActive ? styles.activeBadge : styles.inactiveBadge]}
              onPress={() => !isAdmin && handleToggleStatus(item)}
              disabled={isAdmin}
            >
              <Text style={[styles.statusText, isActive ? styles.activeText : styles.inactiveText]}>
                {isActive ? 'Active' : 'Disabled'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleOpenEdit(item)}>
            <Ionicons name="create-outline" size={16} color={COLORS.primary} />
            <Text style={styles.actionBtnText}>Edit / Validity</Text>
          </TouchableOpacity>

          {!isAdmin && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleDeleteClient(item)}>
              <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
              <Text style={[styles.actionBtnText, { color: COLORS.danger }]}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Clients Management</Text>
        <Text style={styles.subTitle}>Total Clients: {clients.length}</Text>
      </View>

      {/* OTP Settings Card */}
      <Card title="🔐 OTP Settings">
        <View style={styles.otpSettingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.otpSettingLabel}>Use Supabase Email OTP</Text>
            <Text style={styles.otpSettingHint}>
              {useSupabaseOtp
                ? 'Real OTP sent via Supabase email — users must enter code from email.'
                : 'Default OTP active — users log in with the code below.'}
            </Text>
          </View>
          <Switch
            value={useSupabaseOtp}
            onValueChange={setUseSupabaseOtp}
            trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
            thumbColor={useSupabaseOtp ? COLORS.primary : '#f4f3f4'}
          />
        </View>

        {!useSupabaseOtp && (
          <FormField
            label="Default OTP (6 digits)"
            value={defaultOtp}
            onChangeText={setDefaultOtp}
            placeholder="123456"
            keyboardType="number-pad"
            maxLength={6}
          />
        )}

        <Button
          title="Save OTP Settings"
          onPress={saveOtpSettings}
          loading={otpSaving}
          style={{ marginTop: 4 }}
        />
      </Card>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={COLORS.muted} />
        <FormField
          label=""
          placeholder="Search client by name, email, phone"
          value={search}
          onChangeText={setSearch}
          style={{ flex: 1, marginBottom: 0 }}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderClientItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>{loading ? 'Loading clients...' : 'No clients found'}</Text>
          </View>
        }
      />

      {/* Edit Client Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Edit Client Profile</Text>
              <Text style={styles.modalSub}>{selectedClient?.email}</Text>

              <FormField
                label="Full Name"
                value={editName}
                onChangeText={setEditName}
                placeholder="Client Name"
              />

              <FormField
                label="Mobile Number"
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="10-digit mobile"
                keyboardType="phone-pad"
              />

              <FormField
                label="Validity Days (from now)"
                value={editValidityDays}
                onChangeText={setEditValidityDays}
                placeholder="e.g. 30"
                keyboardType="numeric"
              />

              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Client Account Status</Text>
                <TouchableOpacity
                  style={[styles.statusBadge, editIsActive ? styles.activeBadge : styles.inactiveBadge]}
                  onPress={() => setEditIsActive(!editIsActive)}
                >
                  <Text style={[styles.statusText, editIsActive ? styles.activeText : styles.inactiveText]}>
                    {editIsActive ? 'Active' : 'Disabled'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalBtns}>
                <Button title="Cancel" variant="ghost" onPress={() => setModalVisible(false)} style={{ flex: 1 }} />
                <Button title="Save Changes" onPress={handleSaveClient} loading={saving} style={{ flex: 1 }} />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topBar: { padding: 16, backgroundColor: COLORS.white, borderBottomWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  subTitle: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    margin: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  list: { padding: 12, gap: 10 },
  clientCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clientName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  adminBadge: {
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: '#FEF3C7',
    color: '#D97706',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  clientSub: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  statusCol: { alignItems: 'flex-end' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  activeBadge: { backgroundColor: COLORS.successLight },
  inactiveBadge: { backgroundColor: COLORS.dangerLight },
  statusText: { fontSize: 12, fontWeight: '600' },
  activeText: { color: COLORS.success },
  inactiveText: { color: COLORS.danger },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  emptyWrap: { alignItems: 'center', padding: 32 },
  emptyText: { color: COLORS.muted },
  otpSettingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  otpSettingLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  otpSettingHint: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalBox: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  modalSub: { fontSize: 13, color: COLORS.muted, marginBottom: 16, marginTop: 2 },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 12,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
