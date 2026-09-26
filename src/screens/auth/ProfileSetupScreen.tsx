import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { AuthStackParamList } from '../../navigation/RootNavigator';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import { COLORS } from '../../constants';
import { showAlert } from '../../utils';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'ProfileSetup'>;
  route: RouteProp<AuthStackParamList, 'ProfileSetup'>;
};

export default function ProfileSetupScreen({ navigation, route }: Props) {
  const { refreshProfile } = useAuth();
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [upi, setUpi] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  useEffect(() => {
    // Always try to fill email/phone from the active session.
    // route.params?.email may be undefined when this screen is mounted
    // directly by RootNavigator (needsProfileSetup path) rather than via
    // a navigate() call, so we always fall back to the live session.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) setEmail(session.user.email);
      else if (session?.user?.phone && !phone) setPhone(session.user.phone);
    });
  }, []);

  const save = async () => {
    setFeedbackError(null);

    if (!name.trim()) {
      setFeedbackError('Please enter your full name.');
      showAlert('Required', 'Please enter your full name.');
      return;
    }
    if (!phone.trim()) {
      setFeedbackError('Please enter your mobile number.');
      showAlert('Required', 'Please enter your mobile number.');
      return;
    }

    setLoading(true);

    // getSession() can return null briefly right after signInWithPassword while
    // onAuthStateChange hasn't propagated yet. Retry a few times with a short
    // delay to give the session time to settle before reporting a hard error.
    let session = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user?.id) { session = data.session; break; }
      await new Promise((r) => setTimeout(r, 400));
    }
    const userId = session?.user?.id;

    if (!userId) {
      setLoading(false);
      const msg = 'Session not found. Please go back and log in again.';
      setFeedbackError(msg);
      showAlert('Session Error', msg);
      return;
    }

    const { error } = await supabase.from('profiles').upsert({
      id: userId,
      full_name: name.trim(),
      email: email.trim() || session?.user?.email || null,
      phone: phone.trim() || session?.user?.phone || null,
      dob: dob.trim() || null,
      upi_id: upi.trim() || null,
      role: 'client',
      is_active: true,
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    setLoading(false);
    if (error) {
      setFeedbackError(error.message);
      showAlert('Error', error.message);
    } else {
      // refreshProfile reads `session` from AuthContext state which may be stale
      // if onAuthStateChange hasn't fired yet (e.g. test-bypass signUp path).
      // Call it anyway — it will no-op if session is null in context, but the
      // RootNavigator will re-evaluate once onAuthStateChange fires.
      // As a safety net, also directly fetch and set the profile here.
      await refreshProfile();
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Client Profile Setup</Text>
        <Text style={styles.sub}>Complete your profile to start managing properties</Text>

        {feedbackError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {feedbackError}</Text>
          </View>
        ) : null}

        <FormField
          label="Email Address"
          value={email}
          placeholder="your.email@example.com"
          editable={false}
        />

        <FormField
          label="Full Name"
          required
          placeholder="Enter your full name"
          value={name}
          onChangeText={(t) => { setName(t); setFeedbackError(null); }}
        />

        <FormField
          label="Mobile Number"
          required
          placeholder="10-digit mobile number"
          keyboardType="phone-pad"
          maxLength={10}
          value={phone}
          onChangeText={(t) => { setPhone(t); setFeedbackError(null); }}
        />

        <FormField
          label="Date of Birth (YYYY-MM-DD)"
          placeholder="e.g. 1990-05-15"
          value={dob}
          onChangeText={(t) => { setDob(t); setFeedbackError(null); }}
        />

        <FormField
          label="UPI ID (Optional for rent collection)"
          placeholder="e.g. name@upi"
          value={upi}
          onChangeText={setUpi}
        />

        <Button title="Save Profile & Continue" onPress={save} loading={loading} style={{ marginTop: 12 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.white },
  container: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 50, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  sub: { fontSize: 14, color: COLORS.muted, marginBottom: 24 },
  errorBox: {
    backgroundColor: COLORS.dangerLight,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '500',
  },
});
