import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSubscription } from '../../hooks/useSubscription';
import { AppStackParamList } from '../../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export default function SubscriptionBanner() {
  const { daysLeft, isExpired, isWarning } = useSubscription();
  const navigation = useNavigation<Nav>();

  if (!isWarning && !isExpired) return null;

  const message = isExpired
    ? 'Your access period has ended. Tap here to reactivate.'
    : `🌟 Your free period ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Tap to continue enjoying RentEase.`;

  return (
    <TouchableOpacity
      style={[styles.banner, isExpired ? styles.expired : styles.warning]}
      onPress={() => navigation.navigate('Activate')}
      activeOpacity={0.85}
    >
      <Text style={[styles.text, isExpired ? styles.expiredText : styles.warningText]}>
        {message}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  warning: {
    backgroundColor: '#FFFBEB',
    borderBottomColor: '#FDE68A',
  },
  expired: {
    backgroundColor: '#FEF2F2',
    borderBottomColor: '#FECACA',
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    textAlign: 'center',
  },
  warningText: { color: '#92400E' },
  expiredText: { color: '#991B1B' },
});
