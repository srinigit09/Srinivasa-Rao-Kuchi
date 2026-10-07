import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { SelectedBuildingProvider } from './src/context/SelectedBuildingContext';
import RootNavigator from './src/navigation/RootNavigator';
import OfflineBanner from './src/components/common/OfflineBanner';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SelectedBuildingProvider>
          <StatusBar style="light" />
          <RootNavigator />
          <OfflineBanner />
        </SelectedBuildingProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
