import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, ScrollView, RefreshControl, Switch, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { Profile } from '../../types';
import { COLORS } from '../../constants';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import Card from '../../components/common/Card';
import BlueBannerHeader from '../../components/common/BlueBannerHeader';
import DatePickerField from '../../components/common/DatePickerField';
import { formatDate, showAlert } from '../../utils';

// ── Types ────────────────────────────────────────────────────────────────────
type SubscriptionPlan = {
  id: string;
  name: string;
  label: string;
  days: number | null;
  price_per_tenant: number;
  price_per_property: number;
};

type ClientWithSub = Profile & {
  subscription_plan?: string | null;
  subscription_expires_at?: string | null;
};

const PLAN_OPTIONS = ['unlimited', '30days', '1year', 'custom'] as const;
type PlanName = typeof PLAN_OPTIONS[number];
type LoginMode = 'bypass' | 'email' | 'phone';

export default function AdminClientsScreen() {
  const navigation = useNavigation();
  const [clients, setClients] = useState<ClientWithSub[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Edit / Details Modal
  const [selectedClient, setSelectedClient] = useState<ClientWithSub | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editValidityDays, setEditValidityDays] = useState('30');
  const [editIsActive, setEditIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Subscription fields in modal
  const [editSubPlan, setEditSubPlan] = useState<PlanName>('unlimited');
  const [editSubCustomDays, setEditSubCustomDays] = useState('');
  const [editSubFrom, setEditSubFrom] = useState('');
  const [editSubTo, setEditSubTo] = useState('');

  // OTP Settings
  const [defaultOtp, setDefaultOtp] = useState('123456');
  const [useSupabaseOtp, setUseSupabaseOtp] = useState(false);
  const [otpSaving, setOtpSaving] = useState(false);
  const [loginMode, setLoginMode] = useState<LoginMode>('bypass');

  // Apply-to-all
  const [applyAllPlan, setApplyAllPlan] = useState<PlanName>('unlimited');
  const [applyAllCustomDays, setApplyAllCustomDays] = useState('');
  const [applyAllLoading, setApplyAllLoading] = useState(false);

  // Pricing card
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [pricingEdits, setPricingEdits] = useState<Record<string, { price_per_tenant: string; price_per_property: string }>>({});
  const [pricingSaving, setPricingSaving] = useState(false);
  const [subscriptionModel, setSubscriptionModel] = useState<'free' | 'paid'>('free');
  const [subModelSaving, setSubModelSaving] = useState(false);

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
      setClients(data as ClientWithSub[]);
    }
  }, []);

  const fetchOtpSettings = useCallback(async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['default_otp', 'use_supabase_otp', 'login_mode', 'subscription_model']);
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((r: { key: string; value: string }) => { map[r.key] = r.value; });
      setDefaultOtp(map['default_otp'] ?? '123456');
      setUseSupabaseOtp(map['use_supabase_otp'] === 'true');
      setLoginMode((map['login_mode'] as LoginMode) || 'bypass');
      setSubscriptionModel((map['subscription_model'] as 'free' | 'paid') || 'free');
    }
  }, []);

  const fetchPlans = useCallback(async () => {
    const { data } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('created_at');
    if (data) {
      setPlans(data as SubscriptionPlan[]);
      const edits: Record<string, { price_per_tenant: string; price_per_property: string }> = {};
      (data as SubscriptionPlan[]).forEach(p => {
        edits[p.id] = {
          price_per_tenant: String(p.price_per_tenant),
          price_per_property: String(p.price_per_property),
        };
      });
      setPricingEdits(edits);
    }
  }, []);

  useEffect(() => {
    fetchClients();
    fetchOtpSettings();
    fetchPlans();
  }, [fetchClients, fetchOtpSettings, fetchPlans]);

  // Reset search on every focus
  useFocusEffect(useCallback(() => {
    setSearch('');
  }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchClients(), fetchOtpSettings(), fetchPlans()]);
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
      supabase.from('app_settings').upsert({ key: 'login_mode', value: loginMode, updated_at: new Date().toISOString() }),
    ];
    const results = await Promise.all(updates);
    setOtpSaving(false);
    const err = results.find(r => r.error)?.error;
    if (err) showAlert('Save Error', err.message);
    else showAlert('Saved', 'OTP settings updated successfully.');
  };

  const saveSubscriptionModel = async (model: 'free' | 'paid') => {
    setSubModelSaving(true);
    setSubscriptionModel(model);
    await supabase.from('app_settings').upsert(
      { key: 'subscription_model', value: model },
      { onConflict: 'key' }
    );
    setSubModelSaving(false);
    showAlert('Saved', `Subscription model set to "${model}".`);
  };

  // ── Compute expires_at from plan + customDays ─────────────────────────────
  const computeExpiresAt = (planName: PlanName, customDays: string): string | null => {
    if (planName === 'unlimited') return null;
    let days = 0;
    if (planName === '30days') days = 30;
    else if (planName === '1year') days = 365;
    else if (planName === 'custom') days = parseInt(customDays, 10) || 30;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  };

  const handleOpenEdit = (client: ClientWithSub) => {
    setSelectedClient(client);
    setEditName(client.full_name || '');
    setEditPhone(client.phone || '');
    setEditIsActive(client.is_active !== false);
    setEditSubPlan((client.subscription_plan as PlanName) || 'unlimited');
    setEditSubCustomDays('');
    setEditSubFrom((client as any).subscription_starts_at?.split('T')[0] ?? '');
    setEditSubTo(client.subscription_expires_at?.split('T')[0] ?? '');

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
    const newExpiresAt = editSubTo || computeExpiresAt(editSubPlan, editSubCustomDays);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: editName.trim() || null,
        phone: editPhone.trim() || null,
        is_active: editIsActive,
        valid_until: newValidUntil,
        subscription_plan: editSubPlan,
        subscription_expires_at: newExpiresAt || null,
        subscription_starts_at: editSubFrom || null,
      } as any)
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

  const handleToggleStatus = async (client: ClientWithSub) => {
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

  const handleDeleteClient = (client: ClientWithSub) => {
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

  // ── Apply-to-all subscription ─────────────────────────────────────────────
  const handleApplyToAll = async () => {
    if (applyAllPlan === 'custom' && (!applyAllCustomDays || isNaN(parseInt(applyAllCustomDays, 10)))) {
      showAlert('Invalid', 'Please enter a valid number of days for Custom plan.');
      return;
    }
    showAlert(
      'Apply to All',
      `Set "${applyAllPlan}" plan for all ${clients.filter(c => c.role !== 'admin').length} clients?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply',
          onPress: async () => {
            setApplyAllLoading(true);
            const newExpiresAt = computeExpiresAt(applyAllPlan, applyAllCustomDays);
            const ids = clients.filter(c => c.role !== 'admin').map(c => c.id);
            const { error } = await supabase
              .from('profiles')
              .update({
                subscription_plan: applyAllPlan,
                subscription_expires_at: newExpiresAt,
              })
              .in('id', ids);
            setApplyAllLoading(false);
            if (error) showAlert('Error', error.message);
            else {
              showAlert('Done', 'Subscription applied to all clients.');
              fetchClients();
            }
          },
        },
      ]
    );
  };

  // ── Save pricing ──────────────────────────────────────────────────────────
  const handleSavePricing = async () => {
    setPricingSaving(true);
    const updates = plans.map(p => {
      const edit = pricingEdits[p.id];
      return supabase
        .from('subscription_plans')
        .update({
          price_per_tenant: parseFloat(edit?.price_per_tenant ?? '0') || 0,
          price_per_property: parseFloat(edit?.price_per_property ?? '0') || 0,
        })
        .eq('id', p.id);
    });
    const results = await Promise.all(updates);
    setPricingSaving(false);
    const err = results.find(r => r.error)?.error;
    if (err) showAlert('Save Error', err.message);
    else {
      showAlert('Saved', 'Pricing updated successfully.');
      fetchPlans();
    }
  };

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    return (
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q)
    );
  });

  const renderClientItem = ({ item }: { item: ClientWithSub }) => {
    const isActive = item.is_active !== false;
    const isExpired = item.valid_until ? new Date(item.valid_until) < new Date() : false;
    const isAdminRole = item.role === 'admin';
    const subPlan = item.subscription_plan || 'unlimited';
    const subExpiry = item.subscription_expires_at;
    const subExpired = subExpiry ? new Date(subExpiry) < new Date() : false;

    return (
      <View style={styles.clientCard}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.clientName}>{item.full_name || 'Unnamed Client'}</Text>
              {isAdminRole && <Text style={styles.adminBadge}>ADMIN</Text>}
            </View>
            <Text style={styles.clientSub}>✉️ {item.email || 'No email'}</Text>
            {item.phone ? <Text style={styles.clientSub}>📞 {item.phone}</Text> : null}
            {item.dob ? <Text style={styles.clientSub}>🎂 DOB: {item.dob}</Text> : null}
            <Text style={styles.clientSub}>
              ⏳ Validity: {item.valid_until ? formatDate(item.valid_until) : '30 days'} {isExpired ? '(EXPIRED)' : ''}
            </Text>
            <Text style={styles.clientSub}>
              📋 Plan: {subPlan}{subExpiry ? ` · expires ${formatDate(subExpiry)}${subExpired ? ' (EXPIRED)' : ''}` : ''}
            </Text>
          </View>

          <View style={styles.statusCol}>
            <TouchableOpacity
              style={[styles.statusBadge, isActive ? styles.activeBadge : styles.inactiveBadge]}
              onPress={() => !isAdminRole && handleToggleStatus(item)}
              disabled={isAdminRole}
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
            <Text style={styles.actionBtnText}>Edit / Subscription</Text>
          </TouchableOpacity>

          {!isAdminRole && (
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
      <BlueBannerHeader
        title="Client Management"
        subtitle={`${clients.filter(c => c.role !== 'admin').length} clients registered`}
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

      {/* OTP Settings Card */}
      <Card title="🔐 OTP Settings">
        {/* Login Mode */}
        <Text style={styles.otpSettingLabel}>Login Mode</Text>
        <View style={styles.planRow}>
          {(['bypass', 'email', 'phone'] as LoginMode[]).map((mode) => {
            const labels: Record<LoginMode, string> = {
              bypass: 'Bypass (No OTP)',
              email: 'Email OTP',
              phone: 'SMS OTP',
            };
            return (
              <TouchableOpacity
                key={mode}
                style={[styles.planChip, loginMode === mode && styles.planChipActive]}
                onPress={() => setLoginMode(mode)}
              >
                <Text style={[styles.planChipText, loginMode === mode && styles.planChipTextActive]}>
                  {labels[mode]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

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

      {/* Apply-to-all subscription card */}
      <Card title="📦 Apply Subscription to All Clients">
        <Text style={styles.cardHint}>Set one subscription plan for all non-admin clients at once.</Text>
        <View style={styles.planRow}>
          {PLAN_OPTIONS.map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.planChip, applyAllPlan === p && styles.planChipActive]}
              onPress={() => setApplyAllPlan(p)}
            >
              <Text style={[styles.planChipText, applyAllPlan === p && styles.planChipTextActive]}>
                {p === 'unlimited' ? '∞ Unlimited' : p === '30days' ? '30 Days' : p === '1year' ? '1 Year' : 'Custom'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {applyAllPlan === 'custom' && (
          <FormField
            label="Custom Days"
            value={applyAllCustomDays}
            onChangeText={setApplyAllCustomDays}
            placeholder="e.g. 90"
            keyboardType="numeric"
          />
        )}
        <Button
          title="Apply to All Clients"
          onPress={handleApplyToAll}
          loading={applyAllLoading}
          style={{ marginTop: 4 }}
        />
      </Card>

      {/* Subscription Pricing card */}
      {plans.length > 0 && (
        <Card title="💰 Subscription Pricing">
          <Text style={styles.cardHint}>Set pricing shown to clients on the Activate screen.</Text>

          {/* Subscription Model toggle */}
          <Text style={[styles.otpSettingLabel, { marginBottom: 6 }]}>Subscription Model</Text>
          <View style={[styles.planRow, { marginBottom: 12 }]}>
            {(['free', 'paid'] as const).map((model) => (
              <TouchableOpacity
                key={model}
                style={[styles.planChip, subscriptionModel === model && styles.planChipActive]}
                onPress={() => !subModelSaving && saveSubscriptionModel(model)}
              >
                <Text style={[styles.planChipText, subscriptionModel === model && styles.planChipTextActive]}>
                  {model === 'free' ? 'Free (Unlimited)' : 'Paid'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {subscriptionModel === 'free' ? (
            <Text style={styles.cardHint}>
              All clients have unlimited access. Switch to Paid to configure pricing.
            </Text>
          ) : (
            <>
              {plans.filter(plan => plan.name !== 'unlimited').map(plan => (
                <View key={plan.id} style={styles.pricingRow}>
                  <Text style={styles.pricingLabel}>{plan.label}</Text>
                  <View style={styles.pricingInputs}>
                    <View style={styles.pricingField}>
                      <Text style={styles.pricingFieldLabel}>Per Tenant (₹)</Text>
                      <TextInput
                        style={styles.pricingInput}
                        value={pricingEdits[plan.id]?.price_per_tenant ?? ''}
                        onChangeText={v => setPricingEdits(prev => ({ ...prev, [plan.id]: { ...prev[plan.id], price_per_tenant: v } }))}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={COLORS.muted}
                      />
                    </View>
                    <View style={styles.pricingField}>
                      <Text style={styles.pricingFieldLabel}>Per Property (₹)</Text>
                      <TextInput
                        style={styles.pricingInput}
                        value={pricingEdits[plan.id]?.price_per_property ?? ''}
                        onChangeText={v => setPricingEdits(prev => ({ ...prev, [plan.id]: { ...prev[plan.id], price_per_property: v } }))}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={COLORS.muted}
                      />
                    </View>
                  </View>
                </View>
              ))}
              <Button
                title="Save Pricing"
                onPress={handleSavePricing}
                loading={pricingSaving}
                style={{ marginTop: 8 }}
              />
            </>
          )}
        </Card>
      )}

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={COLORS.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search client by name, email, phone"
          placeholderTextColor={COLORS.muted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={{ paddingRight: 4 }}>
            <Ionicons name="close-circle" size={18} color={COLORS.muted} />
          </TouchableOpacity>
        )}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>{loading ? 'Loading clients...' : 'No clients found'}</Text>
        </View>
      ) : (
        filtered.map(item => (
          <View key={item.id} style={styles.listPad}>
            {renderClientItem({ item })}
          </View>
        ))
      )}

      </ScrollView>

      {/* Pull to refresh */}
      <FlatList
        data={[]}
        keyExtractor={() => 'empty'}
        renderItem={null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        style={{ height: 0 }}
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

              {/* Subscription plan picker */}
              <Text style={styles.subPlanLabel}>Subscription Plan</Text>
              <View style={styles.planRow}>
                {PLAN_OPTIONS.map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.planChip, editSubPlan === p && styles.planChipActive]}
                    onPress={() => setEditSubPlan(p)}
                  >
                    <Text style={[styles.planChipText, editSubPlan === p && styles.planChipTextActive]}>
                      {p === 'unlimited' ? '∞ Unlimited' : p === '30days' ? '30 Days' : p === '1year' ? '1 Year' : 'Custom'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {editSubPlan === 'custom' && (
                <FormField
                  label="Custom Days"
                  value={editSubCustomDays}
                  onChangeText={setEditSubCustomDays}
                  placeholder="e.g. 90"
                  keyboardType="numeric"
                />
              )}

              <DatePickerField
                label="Subscription From"
                value={editSubFrom}
                onChange={setEditSubFrom}
              />
              <DatePickerField
                label="Subscription To"
                value={editSubTo}
                onChange={setEditSubTo}
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
  scrollContent: { paddingBottom: 40 },
  listPad: { paddingHorizontal: 12, paddingBottom: 8 },
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
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
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
  cardHint: { fontSize: 12, color: COLORS.muted, marginBottom: 10 },
  planRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  planChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  planChipActive: { borderColor: COLORS.primary, backgroundColor: '#EEF2FF' },
  planChipText: { fontSize: 13, color: COLORS.muted, fontWeight: '500' },
  planChipTextActive: { color: COLORS.primary, fontWeight: '700' },
  subPlanLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 8, marginTop: 4 },
  pricingRow: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  pricingLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  pricingInputs: { flexDirection: 'row', gap: 10 },
  pricingField: { flex: 1 },
  pricingFieldLabel: { fontSize: 11, color: COLORS.muted, marginBottom: 4 },
  pricingInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
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
    maxHeight: '90%',
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
