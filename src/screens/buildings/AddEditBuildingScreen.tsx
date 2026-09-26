import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { AppStackParamList } from '../../navigation/RootNavigator';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import SelectField from '../../components/common/SelectField';
import { COLORS } from '../../constants';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, 'AddEditBuilding'>;
  route: RouteProp<AppStackParamList, 'AddEditBuilding'>;
};

export default function AddEditBuildingScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const editId = route.params?.buildingId;
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState<'residential' | 'pg'>('residential');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (editId) {
      supabase.from('buildings').select('*').eq('id', editId).single().then(({ data }) => {
        if (data) { setName(data.name); setAddress(data.address ?? ''); setType(data.building_type); }
      });
    }
  }, [editId]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Building name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setLoading(true);
    const payload = { name: name.trim(), address: address.trim() || null, building_type: type, owner_id: user!.id };
    const { error } = editId
      ? await supabase.from('buildings').update(payload).eq('id', editId)
      : await supabase.from('buildings').insert(payload);
    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <FormField label="Building Name" required placeholder="e.g. Sunrise Apartments" value={name} onChangeText={setName} error={errors.name} />
        <FormField label="Address" placeholder="Street, City, State" value={address} onChangeText={setAddress} multiline numberOfLines={3} />
        <SelectField
          label="Building Type" required
          options={['residential', 'pg']}
          value={type}
          onChange={(v) => setType(v as any)}
        />
        <Text style={styles.hint}>
          {type === 'residential' ? '🏠 Residential — Flats (1RK, 1BHK, 2BHK, 3BHK, Villa)' : '🏨 PG/Hostel — Rooms (Single, 2-Sharing …)'}
        </Text>
        <Button title={editId ? 'Update Building' : 'Add Building'} onPress={save} loading={loading} style={{ marginTop: 24 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.white },
  container: { padding: 20, paddingBottom: 40 },
  hint: { fontSize: 13, color: COLORS.muted, marginTop: -8, marginBottom: 8, lineHeight: 18 },
});
