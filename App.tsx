import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { PropertyProvider } from './src/context/PropertyContext';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PropertyProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </PropertyProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
