import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { AppStackParamList } from '../../navigation/RootNavigator';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import SelectField from '../../components/common/SelectField';
import { COLORS, SOCIETY_NOTICE_CATEGORIES } from '../../constants';
import { SocietyNoticeCategory, SocietyNoticePriority } from '../../types';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, any>;
  route: RouteProp<AppStackParamList, any>;
};

const PRIORITIES: SocietyNoticePriority[] = ['Normal', 'Important', 'Urgent'];

export default function AddEditNoticeScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const initialBuildingId = (route.params as any)?.buildingId;

  const [buildings, setBuildings] = useState<{ id: string; name: string }[]>([]);
  const [buildingId, setBuildingId] = useState(initialBuildingId ?? '');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<SocietyNoticeCategory>('General');
  const [priority, setPriority] = useState<SocietyNoticePriority>('Normal');
  const [expiryDate, setExpiryDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    supabase.from('buildings').select('id, name').eq('owner_id', user.id).then(({ data }) => {
      if (data) {
        setBuildings(data);
        if (!buildingId && data.length > 0) setBuildingId(data[0].id);
      }
    });
  }, [user]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!buildingId) e.buildingId = 'Please select a property or society';
    if (!title.trim()) e.title = 'Notice title is required';
    if (!content.trim()) e.content = 'Notice announcement content is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setLoading(true);
    const payload = {
      owner_id: user!.id,
      building_id: buildingId,
      title: title.trim(),
      content: content.trim(),
      category,
      priority,
      publish_date: new Date().toISOString().split('T')[0],
      expiry_date: expiryDate.trim() || null,
    };

    const { error } = await supabase.from('society_notices').insert(payload);
    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {buildings.length > 0 && (
          <SelectField
            label="Target Property / Society"
            required
            options={buildings.map(b => b.name)}
            value={buildings.find(b => b.id === buildingId)?.name ?? ''}
            onChange={(name) => {
              const b = buildings.find(x => x.name === name);
              if (b) setBuildingId(b.id);
            }}
            error={errors.buildingId}
          />
        )}

        <FormField
          label="Notice Title"
          required
          placeholder="e.g. Water Tank Cleaning on Sunday, AGM Notice"
          value={title}
          onChangeText={setTitle}
          error={errors.title}
        />

        <FormField
          label="Notice Message / Announcement Details"
          required
          placeholder="Write the complete announcement or guidelines for residents..."
          value={content}
          onChangeText={setContent}
          multiline
          numberOfLines={4}
          error={errors.content}
        />

        <SelectField
          label="Category"
          required
          options={[...SOCIETY_NOTICE_CATEGORIES]}
          value={category}
          onChange={(v) => setCategory(v as any)}
        />

        <SelectField
          label="Priority"
          required
          options={[...PRIORITIES]}
          value={priority}
          onChange={(v) => setPriority(v as any)}
        />

        <FormField
          label="Expiry Date (YYYY-MM-DD, Optional)"
          placeholder="e.g. 2025-12-31"
          value={expiryDate}
          onChangeText={setExpiryDate}
        />

        <Button
          title="Publish Notice"
          onPress={save}
          loading={loading}
          style={{ marginTop: 24 }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.white },
  container: { padding: 18, paddingBottom: 40 },
});
