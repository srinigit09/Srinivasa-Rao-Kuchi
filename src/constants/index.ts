export const COLORS = {
  primary: '#2563EB',      // blue-600
  primaryLight: '#DBEAFE', // blue-100
  success: '#16A34A',      // green-600
  successLight: '#DCFCE7',
  warning: '#D97706',      // amber-600
  warningLight: '#FEF3C7',
  danger: '#DC2626',       // red-600
  dangerLight: '#FEE2E2',
  surface: '#F9FAFB',
  border: '#E5E7EB',
  text: '#111827',
  muted: '#6B7280',
  white: '#FFFFFF',
  bg: '#F3F4F6',
};

export const RESIDENTIAL_UNIT_TYPES = ['1RK', '1BHK', '2BHK', '3BHK', 'Villa'] as const;
export const PG_UNIT_TYPES = ['Single', '2-Sharing', '3-Sharing', '4-Sharing', '5-Sharing'] as const;
export const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque'] as const;
export const ID_TYPES = ['Aadhaar', 'PAN', 'Passport', 'Driving License'] as const;

export const STATUS_COLOR: Record<string, string> = {
  Paid: '#16A34A',
  Partial: '#D97706',
  Pending: '#DC2626',
};

export const STATUS_BG: Record<string, string> = {
  Paid: '#DCFCE7',
  Partial: '#FEF3C7',
  Pending: '#FEE2E2',
};

export const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
