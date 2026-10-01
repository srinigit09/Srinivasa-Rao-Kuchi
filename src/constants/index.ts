import { BuildingType } from '../types';

export const COLORS = {
  primary: '#2563EB',      // blue-600
  primaryLight: '#DBEAFE', // blue-100
  primaryDark: '#1D4ED8',
  secondary: '#7C3AED',    // purple-600
  secondaryLight: '#EDE9FE',
  accent: '#0D9488',       // teal-600
  accentLight: '#CCFBF1',
  success: '#16A34A',      // green-600
  successLight: '#DCFCE7',
  warning: '#D97706',      // amber-600
  warningLight: '#FEF3C7',
  danger: '#DC2626',       // red-600
  dangerLight: '#FEE2E2',
  surface: '#F9FAFB',
  surfaceCard: '#FFFFFF',
  border: '#E5E7EB',
  text: '#111827',
  muted: '#6B7280',
  white: '#FFFFFF',
  bg: '#F3F4F6',
};

export const PROPERTY_TYPES: { id: BuildingType; label: string; icon: string; subtitle: string; badge: string }[] = [
  {
    id: 'individual_house',
    label: 'Individual House',
    icon: 'home',
    subtitle: 'Independent Villa, Bungalow, Row House',
    badge: '🏡 House',
  },
  {
    id: 'residential',
    label: 'Multi-storied (Flats)',
    icon: 'business',
    subtitle: 'Multi-floor flat building / floors',
    badge: '🏢 Multi-story',
  },
  {
    id: 'commercial',
    label: 'Commercial Property',
    icon: 'briefcase',
    subtitle: 'Shops, Offices, Showrooms, Warehouses, Complexes',
    badge: '💼 Commercial',
  },
  {
    id: 'pg',
    label: 'PG / Hostel',
    icon: 'bed',
    subtitle: 'Bed & Room sharing for students/workers',
    badge: '🏨 PG/Hostel',
  },
  {
    id: 'apartment',
    label: 'Standalone Apartment',
    icon: 'layers',
    subtitle: 'Mixed Owners & Tenants with basic maintenance',
    badge: '🏬 Apartment',
  },
  {
    id: 'gated_community',
    label: 'Gated Community / Society',
    icon: 'shield-checkmark',
    subtitle: 'Association, Amenities, Security, Society dues',
    badge: '🏰 Community',
  },
];

export const RESIDENTIAL_UNIT_TYPES = [
  'Room',
  '1RK',
  '1BHK',
  '2BHK',
  '3BHK',
  '4BHK',
  '5BHK',
  'Villa',
  'Duplex',
  'Penthouse',
  'Entire Floor',
  'Entire Building',
] as const;

export const COMMERCIAL_UNIT_TYPES = [
  'Shop / Retail Store',
  'Office Space',
  'Showroom',
  'Warehouse / Godown',
  'Co-working Desk',
  'Commercial Floor',
  'Entire Building / Complex',
  'Restaurant / Cafe',
  'Clinic / Pharmacy',
  'Industrial Shed',
] as const;

export const PG_UNIT_TYPES = ['Single', '2-Sharing', '3-Sharing', '4-Sharing', '5-Sharing'] as const;
export const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque'] as const;
export const ID_TYPES = ['Aadhaar', 'PAN', 'Passport', 'Driving License'] as const;

export const RESIDENT_TYPES = [
  { id: 'tenant', label: 'Tenant (Rent Payer)' },
  { id: 'owner_occupant', label: 'Owner Resident (Maintenance Payer)' },
] as const;

export const MAINTENANCE_CATEGORIES = [
  'Plumbing',
  'Electrical',
  'Carpentry',
  'Painting',
  'Appliance',
  'Cleaning',
  'Pest Control',
  'Security/Gate',
  'Lift/Elevator',
  'Society General',
  'Other',
] as const;

export const MAINTENANCE_PRIORITIES = ['Low', 'Medium', 'High', 'Emergency'] as const;
export const MAINTENANCE_STATUSES = ['Reported', 'In Progress', 'Scheduled', 'Resolved', 'Cancelled'] as const;

export const SOCIETY_NOTICE_CATEGORIES = [
  'General',
  'Maintenance',
  'Emergency',
  'Meeting',
  'Festival/Event',
  'Rules',
] as const;

export const STATUS_COLOR: Record<string, string> = {
  Paid: '#16A34A',
  Partial: '#D97706',
  Pending: '#DC2626',
  Reported: '#2563EB',
  'In Progress': '#D97706',
  Scheduled: '#7C3AED',
  Resolved: '#16A34A',
  Cancelled: '#6B7280',
};

export const STATUS_BG: Record<string, string> = {
  Paid: '#DCFCE7',
  Partial: '#FEF3C7',
  Pending: '#FEE2E2',
  Reported: '#DBEAFE',
  'In Progress': '#FEF3C7',
  Scheduled: '#EDE9FE',
  Resolved: '#DCFCE7',
  Cancelled: '#F3F4F6',
};

export const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
