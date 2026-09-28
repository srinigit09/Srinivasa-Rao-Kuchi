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
import PropertiesScreen from '../screens/properties/PropertiesScreen';
import AddPropertyTypeScreen from '../screens/properties/AddPropertyTypeScreen';
import PlotsScreen from '../screens/properties/PlotsScreen';
import ConstructionStagesScreen from '../screens/properties/ConstructionStagesScreen';
import BuildingsScreen from '../screens/buildings/BuildingsScreen';
import AddEditBuildingScreen from '../screens/buildings/AddEditBuildingScreen';
import BuildingDetailScreen from '../screens/buildings/BuildingDetailScreen';
import AddEditUnitScreen from '../screens/units/AddEditUnitScreen';
import PeopleScreen from '../screens/people/PeopleScreen';
import TenantsScreen from '../screens/tenants/TenantsScreen';
import AddTenantStep1Screen from '../screens/tenants/AddTenantStep1Screen';
import AddTenantStep2Screen from '../screens/tenants/AddTenantStep2Screen';
import AddTenantStep3Screen from '../screens/tenants/AddTenantStep3Screen';
import TenantProfileScreen from '../screens/tenants/TenantProfileScreen';
import RecordPaymentScreen from '../screens/payments/RecordPaymentScreen';
import PaymentHistoryScreen from '../screens/payments/PaymentHistoryScreen';
import ReceiptScreen from '../screens/payments/ReceiptScreen';
import VacantUnitsScreen from '../screens/dashboard/VacantUnitsScreen';
import AllUnitsScreen from '../screens/units/AllUnitsScreen';
import OccupiedTenantsScreen from '../screens/tenants/OccupiedTenantsScreen';
import CollectedPaymentsScreen from '../screens/payments/CollectedPaymentsScreen';
import OutstandingScreen from '../screens/payments/OutstandingScreen';
import ReportsScreen from '../screens/reports/ReportsScreen';
import LandReportsScreen from '../screens/reports/LandReportsScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import MoveOutScreen from '../screens/tenants/MoveOutScreen';
import AdminClientsScreen from '../screens/admin/AdminClientsScreen';
import BuyersScreen from '../screens/buyers/BuyersScreen';
import AddBuyerScreen from '../screens/buyers/AddBuyerScreen';
import BuyerProfileScreen from '../screens/buyers/BuyerProfileScreen';
import RecordSalePaymentScreen from '../screens/buyers/RecordSalePaymentScreen';
import SaleReceiptScreen from '../screens/buyers/SaleReceiptScreen';

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
  Properties: undefined;
  Tenants: undefined;
  Reports: undefined;
  AdminClients?: undefined;
  Settings: undefined;
  // standalone tab aliases used from PeopleScreen tiles
  Buyers?: undefined;
};

export type AppStackParamList = {
  Tabs: undefined;
  AddPropertyType: undefined;
  AddEditBuilding: { buildingId?: string; preselectedType?: string };
  BuildingDetail: { buildingId: string };
  AddEditUnit: { buildingId: string; unitId?: string };
  Plots: { buildingId: string };
  ConstructionStages: { unitId: string; unitNumber: string };
  Buyers: undefined;
  AddBuyer: { unitId: string };
  BuyerProfile: { buyerId: string };
  RecordSalePayment: { buyerId: string };
  SaleReceipt: { paymentId: string };
  LandReports: undefined;
  AddTenantStep1: undefined;
  AddTenantStep2: { buildingId: string; unitId: string; buildingType: 'residential' | 'pg' };
  AddTenantStep3: { buildingId: string; unitId: string; buildingType: 'residential' | 'pg'; tenantData: Record<string, unknown> };
  TenantProfile: { tenantId: string };
  RecordPayment: { tenantId: string; paymentId?: string };
  PaymentHistory: { tenantId: string };
  Receipt: { paymentId: string };
  VacantUnits: { buildingId?: string; buildingName?: string };
  AllUnits: { buildingId?: string; buildingName?: string };
  OccupiedTenants: { buildingId?: string; buildingName?: string };
  CollectedPayments: { buildingId?: string; buildingName?: string };
  Outstanding: { buildingId?: string; buildingName?: string };
  MoveOut: { tenantId: string };
  AdminClients: undefined;
  Tenants: undefined;
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
                Properties: 'business-outline',
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
      <Tab.Screen name="Properties" component={PropertiesScreen} />
      <Tab.Screen name="Tenants" component={PeopleScreen} />
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

const HEADER_BLUE = '#1D4ED8';

const AppNavigator = () => (
  <AppStack.Navigator
    screenOptions={{
      headerStyle: { backgroundColor: HEADER_BLUE },
      headerTintColor: '#FFFFFF',
      headerTitleStyle: { fontWeight: '700', fontSize: 17 },
      contentStyle: { backgroundColor: COLORS.bg },
    }}
  >
    <AppStack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
    <AppStack.Screen name="AddPropertyType" component={AddPropertyTypeScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="AddEditBuilding" component={AddEditBuildingScreen} options={{ title: 'Property' }} />
    <AppStack.Screen name="BuildingDetail" component={BuildingDetailScreen} options={{ title: 'Building Details' }} />
    <AppStack.Screen name="AddEditUnit" component={AddEditUnitScreen} options={{ title: 'Unit' }} />
    <AppStack.Screen name="Plots" component={PlotsScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="ConstructionStages" component={ConstructionStagesScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="Buyers" component={BuyersScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="AddBuyer" component={AddBuyerScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="BuyerProfile" component={BuyerProfileScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="RecordSalePayment" component={RecordSalePaymentScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="SaleReceipt" component={SaleReceiptScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="LandReports" component={LandReportsScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="Tenants" component={TenantsScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="AddTenantStep1" component={AddTenantStep1Screen} options={{ title: 'Add Tenant (1/3)' }} />
    <AppStack.Screen name="AddTenantStep2" component={AddTenantStep2Screen} options={{ title: 'Add Tenant (2/3)' }} />
    <AppStack.Screen name="AddTenantStep3" component={AddTenantStep3Screen} options={{ title: 'Add Tenant (3/3)' }} />
    <AppStack.Screen name="TenantProfile" component={TenantProfileScreen} options={{ title: 'Tenant Profile' }} />
    <AppStack.Screen name="RecordPayment" component={RecordPaymentScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="PaymentHistory" component={PaymentHistoryScreen} options={{ title: 'Payment History' }} />
    <AppStack.Screen name="Receipt" component={ReceiptScreen} options={{ title: 'Receipt' }} />
    <AppStack.Screen name="VacantUnits" component={VacantUnitsScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="AllUnits" component={AllUnitsScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="OccupiedTenants" component={OccupiedTenantsScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="CollectedPayments" component={CollectedPaymentsScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="Outstanding" component={OutstandingScreen} options={{ headerShown: false }} />
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
