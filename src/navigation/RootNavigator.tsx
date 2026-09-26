import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants';

// Auth
import LoginScreen from '../screens/auth/LoginScreen';
import OTPScreen from '../screens/auth/OTPScreen';
import ProfileSetupScreen from '../screens/auth/ProfileSetupScreen';

// Main
import DashboardScreen from '../screens/dashboard/DashboardScreen';
import BuildingsScreen from '../screens/buildings/BuildingsScreen';
import AddEditBuildingScreen from '../screens/buildings/AddEditBuildingScreen';
import BuildingDetailScreen from '../screens/buildings/BuildingDetailScreen';
import AddEditUnitScreen from '../screens/units/AddEditUnitScreen';
import TenantsScreen from '../screens/tenants/TenantsScreen';
import AddTenantStep1Screen from '../screens/tenants/AddTenantStep1Screen';
import AddTenantStep2Screen from '../screens/tenants/AddTenantStep2Screen';
import AddTenantStep3Screen from '../screens/tenants/AddTenantStep3Screen';
import TenantProfileScreen from '../screens/tenants/TenantProfileScreen';
import RecordPaymentScreen from '../screens/payments/RecordPaymentScreen';
import PaymentHistoryScreen from '../screens/payments/PaymentHistoryScreen';
import ReceiptScreen from '../screens/payments/ReceiptScreen';
import VacantUnitsScreen from '../screens/dashboard/VacantUnitsScreen';
import ReportsScreen from '../screens/reports/ReportsScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import MoveOutScreen from '../screens/tenants/MoveOutScreen';
import AdminClientsScreen from '../screens/admin/AdminClientsScreen';

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  OTP: { email?: string; phone?: string };
  ProfileSetup: { email?: string };
};

export type MainTabParamList = {
  Dashboard: undefined;
  Buildings: undefined;
  Tenants: undefined;
  Reports: undefined;
  AdminClients?: undefined;
  Settings: undefined;
};

export type AppStackParamList = {
  Tabs: undefined;
  AddEditBuilding: { buildingId?: string };
  BuildingDetail: { buildingId: string };
  AddEditUnit: { buildingId: string; unitId?: string };
  AddTenantStep1: undefined;
  AddTenantStep2: { buildingId: string; unitId: string; buildingType: 'residential' | 'pg' };
  AddTenantStep3: { buildingId: string; unitId: string; buildingType: 'residential' | 'pg'; tenantData: Record<string, unknown> };
  TenantProfile: { tenantId: string };
  RecordPayment: { tenantId: string; paymentId?: string };
  PaymentHistory: { tenantId: string };
  Receipt: { paymentId: string };
  VacantUnits: undefined;
  MoveOut: { tenantId: string };
  AdminClients: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const MainTabs = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarStyle: { paddingBottom: 4 },
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, string> = {
            Dashboard: 'grid-outline',
            Buildings: 'business-outline',
            Tenants: 'people-outline',
            Reports: 'bar-chart-outline',
            AdminClients: 'shield-checkmark-outline',
            Settings: 'settings-outline',
          };
          return <Ionicons name={icons[route.name] as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Buildings" component={BuildingsScreen} />
      <Tab.Screen name="Tenants" component={TenantsScreen} />
      <Tab.Screen name="Reports" component={ReportsScreen} />
      {isAdmin && (
        <Tab.Screen
          name="AdminClients"
          component={AdminClientsScreen}
          options={{ title: 'Clients (Admin)' }}
        />
      )}
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
};

const AppNavigator = () => (
  <AppStack.Navigator screenOptions={{ headerTintColor: COLORS.primary }}>
    <AppStack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
    <AppStack.Screen name="AddEditBuilding" component={AddEditBuildingScreen} options={{ title: 'Building' }} />
    <AppStack.Screen name="BuildingDetail" component={BuildingDetailScreen} options={{ title: 'Building Details' }} />
    <AppStack.Screen name="AddEditUnit" component={AddEditUnitScreen} options={{ title: 'Unit' }} />
    <AppStack.Screen name="AddTenantStep1" component={AddTenantStep1Screen} options={{ title: 'Add Tenant (1/3)' }} />
    <AppStack.Screen name="AddTenantStep2" component={AddTenantStep2Screen} options={{ title: 'Add Tenant (2/3)' }} />
    <AppStack.Screen name="AddTenantStep3" component={AddTenantStep3Screen} options={{ title: 'Add Tenant (3/3)' }} />
    <AppStack.Screen name="TenantProfile" component={TenantProfileScreen} options={{ title: 'Tenant Profile' }} />
    <AppStack.Screen name="RecordPayment" component={RecordPaymentScreen} options={{ title: 'Record Payment' }} />
    <AppStack.Screen name="PaymentHistory" component={PaymentHistoryScreen} options={{ title: 'Payment History' }} />
    <AppStack.Screen name="Receipt" component={ReceiptScreen} options={{ title: 'Receipt' }} />
    <AppStack.Screen name="VacantUnits" component={VacantUnitsScreen} options={{ title: 'Vacant Units' }} />
    <AppStack.Screen name="MoveOut" component={MoveOutScreen} options={{ title: 'Move Out' }} />
    <AppStack.Screen name="AdminClients" component={AdminClientsScreen} options={{ title: 'Admin Clients' }} />
  </AppStack.Navigator>
);

const AuthNavigator = () => (
  <AuthStack.Navigator screenOptions={{ headerShown: false }}>
    <AuthStack.Screen name="Login" component={LoginScreen} />
    <AuthStack.Screen name="OTP" component={OTPScreen} />
    <AuthStack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
  </AuthStack.Navigator>
);

export default function RootNavigator() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Session exists but profile setup not complete → stay in auth flow for ProfileSetup
  const needsProfileSetup = !!session && !profile?.full_name;

  return (
    <NavigationContainer>
      {session && !needsProfileSetup ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
