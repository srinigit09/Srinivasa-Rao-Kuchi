export type BuildingType = 'residential' | 'pg';

export type ResidentialUnitType = '1RK' | '1BHK' | '2BHK' | '3BHK' | 'Villa';
export type PGUnitType = 'Single' | '2-Sharing' | '3-Sharing' | '4-Sharing' | '5-Sharing';
export type UnitType = ResidentialUnitType | PGUnitType;

export type PaymentMode = 'Cash' | 'UPI' | 'Bank Transfer' | 'Cheque';
export type PaymentStatus = 'Paid' | 'Partial' | 'Pending';
export type IDType = 'Aadhaar' | 'PAN' | 'Passport' | 'Driving License';

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
  // joined
  building_name?: string;
  building_type?: BuildingType;
}

export interface Tenant {
  id: string;
  owner_id: string;
  unit_id: string;
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
  building_name?: string;
  building_id?: string;
  building_type?: BuildingType;
  rent_per_bed?: number;
}

export interface Payment {
  id: string;
  owner_id: string;
  tenant_id: string;
  payment_month: string;
  amount_due: number;
  amount_paid: number;
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
}
