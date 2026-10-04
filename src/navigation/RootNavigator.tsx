import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants';
import { BuildingType } from '../types';

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
import AllUnitsScreen from '../screens/units/AllUnitsScreen';
import OccupiedTenantsScreen from '../screens/tenants/OccupiedTenantsScreen';
import CollectedPaymentsScreen from '../screens/payments/CollectedPaymentsScreen';
import OutstandingScreen from '../screens/payments/OutstandingScreen';
import ReportsScreen from '../screens/reports/ReportsScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import MoveOutScreen from '../screens/tenants/MoveOutScreen';
import EditTenantScreen from '../screens/tenants/EditTenantScreen';
import AdminClientsScreen from '../screens/admin/AdminClientsScreen';
import AddNewTenantScreen from '../screens/tenants/AddNewTenantScreen';
import ActivateScreen from '../screens/settings/ActivateScreen';

// New Maintenance & Society Screens
import MaintenanceScreen from '../screens/maintenance/MaintenanceScreen';
import AddEditMaintenanceRequestScreen from '../screens/maintenance/AddEditMaintenanceRequestScreen';
import VendorsDirectoryScreen from '../screens/maintenance/VendorsDirectoryScreen';
import AddEditVendorScreen from '../screens/maintenance/AddEditVendorScreen';
import SocietyNoticesScreen from '../screens/society/SocietyNoticesScreen';
import AddEditNoticeScreen from '../screens/society/AddEditNoticeScreen';

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  OTP: { email?: string; phone?: string };
  ProfileSetup: { email?: string; phone?: string };
};

export type MainTabParamList = {
  Dashboard: undefined;
  Buildings: undefined;
  Tenants: { preselectedBuildingId?: string } | undefined;
  MaintenanceTab: undefined;
  Reports: undefined;
  AdminClients?: undefined;
  Settings: undefined;
};

export type AppStackParamList = {
  Tabs: undefined;
  AddEditBuilding: { buildingId?: string };
  BuildingDetail: { buildingId: string };
  AddEditUnit: { buildingId: string; unitId?: string };
  AddNewTenant: { preselectedBuildingId?: string } | undefined;
  AddTenantStep1: { buildingId?: string; unitId?: string } | undefined;
  AddTenantStep2: { buildingId: string; unitId: string; buildingType: BuildingType };
  AddTenantStep3: { buildingId: string; unitId: string; buildingType: BuildingType; tenantData: Record<string, unknown> };
  TenantProfile: { tenantId: string };
  RecordPayment: { tenantId: string; paymentId?: string };
  PaymentHistory: { tenantId: string };
  Receipt: { paymentId: string };
  VacantUnits: { buildingId?: string; buildingName?: string };
  AllUnits: { buildingId?: string; buildingName?: string };
  OccupiedTenants: { buildingId?: string; buildingName?: string };
  CollectedPayments: { buildingId?: string; buildingName?: string };
  Outstanding: { buildingId?: string; buildingName?: string };
  EditTenant: { tenantId: string };
  MoveOut: { tenantId: string };
  AdminClients: undefined;
  Activate: undefined;

  // Maintenance & Society routes
  Maintenance: { buildingId?: string; buildingName?: string };
  AddEditMaintenanceRequest: { requestId?: string; buildingId?: string };
  VendorsDirectory: undefined;
  AddEditVendor: { vendorId?: string };
  SocietyNotices: { buildingId?: string; buildingName?: string };
  AddEditNotice: { buildingId?: string };
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
            MaintenanceTab: 'construct-outline',
            Reports: 'bar-chart-outline',
            AdminClients: 'shield-checkmark-outline',
            Settings: 'settings-outline',
          };
          return <Ionicons name={icons[route.name] as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Tenants" component={TenantsScreen} options={{ title: 'Occupants' }} />
      <Tab.Screen name="Buildings" component={BuildingsScreen} options={{ title: 'Properties' }} />
      <Tab.Screen name="MaintenanceTab" component={MaintenanceScreen} options={{ title: 'Services' }} />
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
  <AppStack.Navigator
    screenOptions={{
      headerStyle: { backgroundColor: COLORS.primaryDark },
      headerTintColor: '#FFFFFF',
      headerTitleStyle: { fontWeight: '700', fontSize: 17 },
      contentStyle: { backgroundColor: COLORS.bg },
    }}
  >
    <AppStack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
    <AppStack.Screen name="AddEditBuilding" component={AddEditBuildingScreen} options={{ title: 'Property / Society' }} />
    <AppStack.Screen name="BuildingDetail" component={BuildingDetailScreen} options={{ title: 'Property Details' }} />
    <AppStack.Screen name="AddEditUnit" component={AddEditUnitScreen} options={{ title: 'Unit / Flat' }} />
    <AppStack.Screen name="AddNewTenant" component={AddNewTenantScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="AddTenantStep1" component={AddTenantStep1Screen} options={{ title: 'Add Occupant (1/3)' }} />
    <AppStack.Screen name="AddTenantStep2" component={AddTenantStep2Screen} options={{ title: 'Add Occupant (2/3)' }} />
    <AppStack.Screen name="AddTenantStep3" component={AddTenantStep3Screen} options={{ title: 'Add Occupant (3/3)' }} />
    <AppStack.Screen name="TenantProfile" component={TenantProfileScreen} options={{ title: 'Resident Profile' }} />
    <AppStack.Screen name="RecordPayment" component={RecordPaymentScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="PaymentHistory" component={PaymentHistoryScreen} options={{ title: 'Payment History' }} />
    <AppStack.Screen name="Receipt" component={ReceiptScreen} options={{ title: 'Receipt' }} />
    <AppStack.Screen name="VacantUnits" component={VacantUnitsScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="AllUnits" component={AllUnitsScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="OccupiedTenants" component={OccupiedTenantsScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="CollectedPayments" component={CollectedPaymentsScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="Outstanding" component={OutstandingScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="EditTenant" component={EditTenantScreen} options={{ title: 'Edit Resident Details' }} />
    <AppStack.Screen name="MoveOut" component={MoveOutScreen} options={{ title: 'Move Out' }} />
    <AppStack.Screen name="AdminClients" component={AdminClientsScreen} options={{ title: 'Admin Clients' }} />
    <AppStack.Screen name="Activate" component={ActivateScreen} options={{ headerShown: false }} />

    {/* Maintenance & Society Screens */}
    <AppStack.Screen name="Maintenance" component={MaintenanceScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="AddEditMaintenanceRequest" component={AddEditMaintenanceRequestScreen} options={{ title: 'Service Request' }} />
    <AppStack.Screen name="VendorsDirectory" component={VendorsDirectoryScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="AddEditVendor" component={AddEditVendorScreen} options={{ title: 'Technician Contact' }} />
    <AppStack.Screen name="SocietyNotices" component={SocietyNoticesScreen} options={{ headerShown: false }} />
    <AppStack.Screen name="AddEditNotice" component={AddEditNoticeScreen} options={{ title: 'Society Notice' }} />
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
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {session ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
