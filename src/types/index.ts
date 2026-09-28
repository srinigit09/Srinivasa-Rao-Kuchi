// ── Existing types (unchanged) ────────────────────────────────────────────────

export type BuildingType =
  | 'residential'
  | 'pg'
  | 'open_plots'
  | 'housing_villa'
  | 'farm_land';

/** Whether a building type belongs to the Rental/PG module or Real Estate module */
export const isRentalType = (t: BuildingType) => t === 'residential' || t === 'pg';
export const isRealEstateType = (t: BuildingType) =>
  t === 'open_plots' || t === 'housing_villa' || t === 'farm_land';

/** Human-readable label for each building/project type */
export const BUILDING_TYPE_LABEL: Record<BuildingType, string> = {
  residential:   'Rental Building',
  pg:            'PG / Hostel',
  open_plots:    'Open Plots',
  housing_villa: 'Housing / Villa',
  farm_land:     'Farm Land',
};

/** Emoji icon for each type */
export const BUILDING_TYPE_ICON: Record<BuildingType, string> = {
  residential:   '🏠',
  pg:            '🏨',
  open_plots:    '🌳',
  housing_villa: '🏗',
  farm_land:     '🌾',
};

// ── Rental unit types (extended) ──────────────────────────────────────────────
export type ResidentialUnitType =
  | 'Room' | '1RK' | '1BHK' | '2BHK' | '3BHK' | '4BHK'
  | 'Villa' | 'Shop' | 'Office' | 'Entire Building';

export type PGUnitType =
  | 'Single' | '2-Sharing' | '3-Sharing' | '4-Sharing' | '5-Sharing';

export type UnitType = ResidentialUnitType | PGUnitType | string; // string for custom RE types

/** Number of beds for each PG sharing type */
export const PG_SHARING_BEDS: Record<PGUnitType, number> = {
  'Single':    1,
  '2-Sharing': 2,
  '3-Sharing': 3,
  '4-Sharing': 4,
  '5-Sharing': 5,
};

// ── Real Estate types ──────────────────────────────────────────────────────────
export type PlotStatus =
  | 'available'
  | 'booked'
  | 'under_construction'
  | 'ready'
  | 'sold';

export type PlotFacing = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';

export type AreaUnit = 'sq.ft' | 'sq.yd' | 'acres';

/** Suggested unit types for real estate — owner can also type custom */
export const RE_UNIT_TYPES = ['Open Plot', 'Flat', 'House', 'Villa', 'Farm Land'] as const;
export type REUnitType = typeof RE_UNIT_TYPES[number] | string;

/** Which RE unit types get construction stages */
export const HAS_CONSTRUCTION_STAGES = ['Flat', 'House', 'Villa'];

export const PLOT_STATUS_LABEL: Record<PlotStatus, string> = {
  available:          'Available',
  booked:             'Booked',
  under_construction: 'Under Construction',
  ready:              'Ready',
  sold:               'Sold',
};

export const PLOT_STATUS_COLOR: Record<PlotStatus, string> = {
  available:          '#16A34A',
  booked:             '#D97706',
  under_construction: '#2563EB',
  ready:              '#7C3AED',
  sold:               '#DC2626',
};

export const PLOT_STATUS_BG: Record<PlotStatus, string> = {
  available:          '#DCFCE7',
  booked:             '#FEF3C7',
  under_construction: '#DBEAFE',
  ready:              '#F3E8FF',
  sold:               '#FEE2E2',
};

export const PLOT_FACINGS: PlotFacing[] = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];

/** Fixed construction stage names in order */
export const CONSTRUCTION_STAGE_NAMES = [
  'Foundation',
  'Structure / Framing',
  'Roofing',
  'Plastering',
  'Finishing',
  'Handover',
] as const;
export type ConstructionStageName = typeof CONSTRUCTION_STAGE_NAMES[number];

// ── Shared types (unchanged) ──────────────────────────────────────────────────
export type PaymentMode = 'Cash' | 'UPI' | 'Bank Transfer' | 'Cheque';
export type PaymentStatus = 'Paid' | 'Partial' | 'Pending';
export type IDType = 'Aadhaar' | 'PAN' | 'Passport' | 'Driving License';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  full_name: string | null;
  email?: string | null;
  phone: string | null;
  dob?: string | null;
  role?: 'admin' | 'client';
  is_active?: boolean;
  valid_until?: string | null;
  upi_id: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_ifsc: string | null;
  created_at: string;
  // PropEase additions
  last_property_id?: string | null;
  last_property_type?: BuildingType | null;
}

export interface Building {
  id: string;
  owner_id: string;
  name: string;
  address: string | null;
  building_type: BuildingType;
  created_at: string;
  // aggregated
  total_units?: number;
  vacant_units?: number;
}

export interface Unit {
  id: string;
  building_id: string;
  owner_id: string;
  unit_number: string;
  unit_type: UnitType;
  total_beds: number;
  rent_per_bed: number;
  is_vacant: boolean;
  created_at: string;
  // real estate fields
  area_sqft?: number | null;
  area_acres?: number | null;
  facing?: PlotFacing | null;
  plot_status?: PlotStatus | null;
  sale_price?: number | null;
  custom_type?: string | null;
  // joined
  building_name?: string;
  building_type?: BuildingType;
}

export interface Bed {
  id: string;
  unit_id: string;
  owner_id: string;
  bed_label: string;   // e.g. "5A", "5B"
  is_vacant: boolean;
  created_at: string;
  // joined
  unit_number?: string;
  building_name?: string;
}

export interface Tenant {
  id: string;
  owner_id: string;
  unit_id: string;
  bed_id?: string | null;   // null for rental, set for PG
  full_name: string;
  phone: string;
  email: string | null;
  id_type: IDType | null;
  id_number: string | null;
  move_in_date: string;
  move_out_date: string | null;
  rent_override: number | null;
  deposit_amount: number;
  deposit_returned: number;
  emergency_name: string | null;
  emergency_phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  // joined
  unit_number?: string;
  bed_label?: string;
  building_name?: string;
  building_id?: string;
  building_type?: BuildingType;
  rent_per_bed?: number;
}

export interface Buyer {
  id: string;
  owner_id: string;
  unit_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  id_type: IDType | null;
  id_number: string | null;
  booking_date: string;
  sale_price: number;
  amount_paid: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  // joined
  unit_number?: string;
  unit_type?: string;
  plot_status?: PlotStatus;
  building_name?: string;
  building_id?: string;
  building_type?: BuildingType;
  // derived
  balance?: number;
}

export interface SalePayment {
  id: string;
  owner_id: string;
  buyer_id: string;
  amount: number;
  payment_date: string;
  payment_mode: PaymentMode | null;
  installment_no: number | null;
  notes: string | null;
  receipt_number: string | null;
  created_at: string;
  // joined
  buyer_name?: string;
  unit_number?: string;
  building_name?: string;
}

export interface ConstructionStage {
  id: string;
  owner_id: string;
  unit_id: string;
  stage_name: ConstructionStageName;
  stage_order: number;
  completed: boolean;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  owner_id: string;
  tenant_id: string;
  payment_month: string;
  amount_due: number;
  amount_paid: number;
  advance_paid: number;
  payment_date: string | null;
  payment_mode: PaymentMode | null;
  electricity: number;
  water: number;
  other_charges: number;
  other_label: string | null;
  outstanding: number;
  status: PaymentStatus;
  notes: string | null;
  receipt_number: string | null;
  created_at: string;
  // joined
  tenant_name?: string;
  tenant_phone?: string;
  unit_number?: string;
  building_name?: string;
}

export interface MonthlySummary {
  month: string;
  total_due: number;
  total_collected: number;
  total_outstanding: number;
  paid_count: number;
  partial_count: number;
  pending_count: number;
}

export interface VacantUnit {
  id: string;
  unit_number: string;
  unit_type: string;
  rent_per_bed: number;
  total_beds: number;
  building_name: string;
  building_type: BuildingType;
  building_id: string;
  owner_id: string;
  // real estate fields
  area_sqft?: number | null;
  area_acres?: number | null;
  facing?: PlotFacing | null;
  sale_price?: number | null;
  plot_status?: PlotStatus | null;
  custom_type?: string | null;
}

/** Unified property summary used in the property selector and Properties tab */
export interface PropertySummary {
  id: string;
  name: string;
  address: string | null;
  building_type: BuildingType;
  total_units: number;
  vacant_units: number;       // rental/PG: is_vacant count; RE: available count
  booked_units?: number;      // real estate only
  sold_units?: number;        // real estate only
  total_sale_value?: number;  // real estate only
  collected_value?: number;   // real estate only
}
