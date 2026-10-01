export type BuildingType =
  | 'residential'          // Multi-storied (Flats)
  | 'individual_house'     // Individual House / Independent Villa
  | 'pg'                   // PG / Hostel
  | 'apartment'            // Standalone Apartment (Owner + Tenant mixed)
  | 'gated_community';     // Gated Community / Society

export type ResidentType = 'tenant' | 'owner_occupant';

export type ResidentialUnitType = '1RK' | '1BHK' | '2BHK' | '3BHK' | '4BHK' | 'Villa' | 'Duplex' | 'Penthouse' | 'Plot';
export type PGUnitType = 'Single' | '2-Sharing' | '3-Sharing' | '4-Sharing' | '5-Sharing';
export type UnitType = ResidentialUnitType | PGUnitType;

export type PaymentMode = 'Cash' | 'UPI' | 'Bank Transfer' | 'Cheque';
export type PaymentStatus = 'Paid' | 'Partial' | 'Pending';
export type IDType = 'Aadhaar' | 'PAN' | 'Passport' | 'Driving License';

// Maintenance & Services
export type MaintenanceCategory =
  | 'Plumbing'
  | 'Electrical'
  | 'Carpentry'
  | 'Painting'
  | 'Appliance'
  | 'Cleaning'
  | 'Pest Control'
  | 'Security/Gate'
  | 'Lift/Elevator'
  | 'Society General'
  | 'Other';

export type MaintenancePriority = 'Low' | 'Medium' | 'High' | 'Emergency';
export type MaintenanceStatus = 'Reported' | 'In Progress' | 'Scheduled' | 'Resolved' | 'Cancelled';

export type SocietyNoticeCategory = 'General' | 'Maintenance' | 'Emergency' | 'Meeting' | 'Festival/Event' | 'Rules';
export type SocietyNoticePriority = 'Normal' | 'Important' | 'Urgent';

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
  society_name?: string | null;
  monthly_maintenance_charge?: number | null;
  maintenance_due_day?: number | null;
  amenities?: string[] | null;
  gate_phone?: string | null;
  rules?: string | null;
  created_at: string;
  // aggregated
  total_units?: number;
  vacant_units?: number;
  open_requests_count?: number;
}

export interface Unit {
  id: string;
  building_id: string;
  owner_id: string;
  unit_number: string;
  unit_type: UnitType;
  floor_number?: string | null;
  total_beds: number;
  rent_per_bed: number;
  monthly_maintenance?: number | null;
  is_vacant: boolean;
  resident_type?: ResidentType;
  created_at: string;
  // joined
  building_name?: string;
  building_type?: BuildingType;
  society_name?: string | null;
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
  resident_type?: ResidentType;
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
  advance_paid: number;
  payment_date: string | null;
  payment_mode: PaymentMode | null;
  electricity: number;
  water: number;
  maintenance_charge?: number;
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
  resident_type?: ResidentType;
}

export interface MaintenanceRequest {
  id: string;
  owner_id: string;
  building_id: string;
  unit_id?: string | null;
  tenant_id?: string | null;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  estimated_cost?: number | null;
  actual_cost?: number | null;
  vendor_name?: string | null;
  vendor_phone?: string | null;
  reported_by?: string | null;
  scheduled_date?: string | null;
  resolved_date?: string | null;
  resolution_notes?: string | null;
  created_at: string;
  // joined
  building_name?: string;
  unit_number?: string;
  tenant_name?: string;
}

export interface ServiceVendor {
  id: string;
  owner_id: string;
  name: string;
  category: MaintenanceCategory;
  phone: string;
  alternate_phone?: string | null;
  email?: string | null;
  address?: string | null;
  rating?: number | null;
  is_verified?: boolean;
  notes?: string | null;
  created_at: string;
}

export interface SocietyNotice {
  id: string;
  owner_id: string;
  building_id: string;
  title: string;
  content: string;
  category: SocietyNoticeCategory;
  priority: SocietyNoticePriority;
  publish_date: string;
  expiry_date?: string | null;
  created_at: string;
  // joined
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
