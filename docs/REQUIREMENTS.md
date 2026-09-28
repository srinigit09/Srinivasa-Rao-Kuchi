# PropEase — Complete Product Requirements Document

> **Version:** 1.0  
> **Branch:** `RentAndLand`  
> **Last Updated:** 2026-09-28  
> **Status:** In Development  
> **Previous app name:** RentEase (renamed to PropEase)

---

## 1. App Identity

| Field | Value |
|---|---|
| **App Name (in-app / icon)** | PropEase |
| **Play Store Title** | PropEase - Property Management App |
| **Play Store Short Description** | Rental, PG & Real Estate Manager — Tenants, Plots, Buyers, Payments & Reports |
| **Package Name** | com.propease.app |
| **EAS Slug** | propease |
| **Platform** | Android (primary), iOS (future) |
| **Target Users** | Individual property owners, landlords, PG operators, real estate developers/sellers |
| **Purpose** | Self/individual property tracking — rental income, PG beds, real estate sales, construction progress |

---

## 2. Property Types

The app supports **5 property types** under a single login. All types are managed from one unified home screen.

### 2.1 Rental Building 🏠
- **Unit types:** Room, 1RK, 1BHK, 2BHK, 3BHK, 4BHK, Villa, Shop, Office, Entire Building
- **Rent model:** Rent per unit (not per bed)
- **Occupancy:** One tenant per unit
- **Payments:** Monthly recurring rent + utilities (electricity, water, other charges)
- **Receipts:** Auto-generated with receipt number
- **Reminders:** WhatsApp reminder per tenant

### 2.2 PG / Hostel 🏨
- **Unit types:** Single, 2-Sharing, 3-Sharing, 4-Sharing, 5-Sharing
- **Bed model:** Beds are created under each unit with auto-named labels
  - e.g. Room 5 with 3-Sharing → Bed 5A, Bed 5B, Bed 5C
  - Sharing type determines number of beds (1 to 5)
- **Rent model:** Rent per bed (each bed has its own rent)
- **Occupancy:** One tenant per bed; a unit can have multiple active tenants (one per bed)
- **Vacancy:** Tracked at bed level — a specific bed is vacant, not just "room has space"
- **Payments:** Monthly recurring rent per bed
- **Receipts & Reminders:** Same as Rental

### 2.3 Real Estate — Open Plots 🌳
- **Unit:** Individual plots in a project/layout
- **Fields:** Plot number, area (sq.yd / sq.ft), price, facing (N/S/E/W/NE/NW/SE/SW)
- **Status:** Available → Booked → Sold
- **Buyer:** One buyer per plot → sale installments
- **Construction stages:** Not applicable

### 2.4 Real Estate — Housing / Villa 🏗
- **Project:** One project can have a **mix** of unit types
- **Unit types:** Flat, House, Villa, Plot — owner defines what he is selling
  - Suggested types shown as chips; owner can also type a custom type
- **Fields:** Unit number, type, area (sq.ft), price, BHK (for flats)
- **Status:** Available → Booked → Under Construction → Ready → Sold
- **Construction stages** (for Flat / House / Villa):
  1. Foundation
  2. Structure / Framing
  3. Roofing
  4. Plastering
  5. Finishing
  6. Handover
- **Buyer:** One buyer per unit → sale installments

### 2.5 Real Estate — Farm Land 🌾
- **Unit:** Individual land parcels in a project
- **Fields:** Survey number, area (acres), water source, price per acre, total price
- **Status:** Available → Booked → Sold
- **Buyer:** One buyer per parcel → sale installments
- **Construction stages:** Not applicable

---

## 3. Data Model

### 3.1 Existing Tables (unchanged structure, extended)

#### `profiles`
- Add: `last_property_id UUID` — last selected property (remembered on next launch)
- Add: `last_property_type TEXT` — type of last selected property

#### `buildings` (renamed conceptually to "Properties" in UI)
- Extend `building_type` CHECK to include: `'open_plots'`, `'housing_villa'`, `'farm_land'`
- Full set: `'residential'`, `'pg'`, `'open_plots'`, `'housing_villa'`, `'farm_land'`

#### `units`
- Add: `area_sqft NUMERIC(10,2)` — for real estate units (sq.ft / sq.yd)
- Add: `area_acres NUMERIC(10,4)` — for farm land (acres)
- Add: `facing TEXT` — plot facing (N/S/E/W/NE/NW/SE/SW)
- Add: `plot_status TEXT CHECK IN ('available','booked','under_construction','ready','sold')` — real estate status
- Add: `custom_type TEXT` — owner-defined unit type for real estate
- Add: `sale_price NUMERIC(12,2)` — asking/sale price for real estate units
- Existing: `rent_per_bed`, `total_beds`, `is_vacant` — used for rental/PG only

#### `tenants`
- Add: `bed_id UUID REFERENCES beds(id)` — null for rental, set for PG

### 3.2 New Tables

#### `beds`
```sql
CREATE TABLE beds (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id     UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  owner_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bed_label   TEXT NOT NULL,   -- e.g. "5A", "5B", "5C"
  is_vacant   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

#### `buyers`
```sql
CREATE TABLE buyers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  unit_id         UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  phone           TEXT NOT NULL,
  email           TEXT,
  id_type         TEXT,         -- Aadhaar / PAN / Passport / Driving License
  id_number       TEXT,
  booking_date    DATE NOT NULL,
  sale_price      NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid     NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

#### `sale_payments`
```sql
CREATE TABLE sale_payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  buyer_id        UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  amount          NUMERIC(12,2) NOT NULL,
  payment_date    DATE NOT NULL,
  payment_mode    TEXT CHECK (payment_mode IN ('Cash','UPI','Bank Transfer','Cheque')),
  installment_no  INT,
  notes           TEXT,
  receipt_number  TEXT UNIQUE,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

#### `construction_stages`
```sql
CREATE TABLE construction_stages (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  unit_id       UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  stage_name    TEXT NOT NULL,  -- Foundation / Structure / Roofing / Plastering / Finishing / Handover
  stage_order   INT NOT NULL,   -- 1 to 6
  completed     BOOLEAN NOT NULL DEFAULT false,
  completed_at  DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

---

## 4. Navigation Structure

### 4.1 Bottom Tab Bar (5 tabs)

| Tab | Icon | Label | Content |
|---|---|---|---|
| 1 | `grid-outline` | **Home** | Dashboard — property selector, stat cards, quick actions, payment/sales summary |
| 2 | `business-outline` | **Properties** | All properties list grouped by type (Rental/PG + Real Estate) |
| 3 | `people-outline` | **People** | Tenants (rental/PG) OR Buyers (real estate) — based on active property |
| 4 | `bar-chart-outline` | **Reports** | Payment reports (rental/PG) OR Sales reports (real estate) |
| 5 | `settings-outline` | **Settings** | Profile, payment details, biometrics — unchanged |

### 4.2 Stack Screens

#### Shared / Existing (unchanged or minor edits)
- `AddEditBuilding` → renamed `AddEditProperty` (handles all 5 types)
- `BuildingDetail` → `PropertyDetail`
- `AddEditUnit` — extended for PG beds + real estate fields
- `AddTenantStep1`, `AddTenantStep2`, `AddTenantStep3` — rental/PG only
- `TenantProfile`, `RecordPayment`, `PaymentHistory`, `Receipt`
- `VacantUnits`, `AllUnits`, `OccupiedTenants`
- `CollectedPayments`, `Outstanding`
- `MoveOut`, `AdminClients`

#### New Stack Screens (Real Estate)
- `AddPropertyTypeScreen` — 5-card type picker (entry point for all new property creation)
- `PlotsScreen` — list all units/plots in a real estate project
- `AddEditPlotScreen` — add/edit plot/flat/house/villa/farm land
- `ConstructionStagesScreen` — view/update construction stages per unit
- `BuyersScreen` — list all buyers across all real estate projects
- `AddBuyerScreen` — select plot → enter buyer details → sale price (single screen)
- `BuyerProfileScreen` — buyer detail: sale progress, installments paid, balance
- `RecordSalePaymentScreen` — record a sale installment
- `SaleReceiptScreen` — receipt for sale payment
- `LandReportsScreen` — sales by project, collected vs total value, pending buyers

---

## 5. Home Screen (Dashboard)

### 5.1 Header
- App name: **PropEase**
- Property selector pill — shows active property name + type icon
  - Tapping opens bottom sheet with all properties grouped:
    - Section 1: Rental & PG properties
    - Section 2: Real Estate projects
    - Bottom: **"+ Add new Property"** button
- Logout button (top right)

### 5.2 Quick Actions (4 buttons — change per active property type)

| Active Property Type | Action 1 | Action 2 | Action 3 | Action 4 |
|---|---|---|---|---|
| Rental Building | Add Tenant | Record Payment | Vacant Units | Add Property |
| PG / Hostel | Add Tenant | Record Payment | Free Beds | Add Property |
| Open Plots | Add Buyer | Record Sale | View Plots | Add Property |
| Housing / Villa | Add Buyer | Record Sale | Update Stage | Add Property |
| Farm Land | Add Buyer | Record Sale | View Plots | Add Property |

### 5.3 Stat Cards (change per active property type)

| Active Property Type | Card 1 | Card 2 | Card 3 | Card 4 |
|---|---|---|---|---|
| Rental Building | Total Units | Occupied | Vacant | — |
| PG / Hostel | Total Beds | Occupied Beds | Free Beds | — |
| Open Plots | Total Plots | Available | Booked | Sold |
| Housing / Villa | Total Units | Available | Under Const. | Sold |
| Farm Land | Total Plots | Available | Booked | Sold |
| **All Properties** | Total Properties | Rental/PG Units | RE Units/Plots | — |

### 5.4 Summary Section (below stat cards)

- **Rental/PG active:** "This Month's Payment Summary" — Received + Outstanding (tap for details)
- **Real Estate active:** "Sales Summary" — Total Collected + Balance Due (tap for details)
- **All Properties:** Both summaries shown

### 5.5 Alerts
- Rental/PG: Overdue payments alert (red banner)
- Real Estate: Pending installments alert

---

## 6. Properties Tab

Replaces the old "Buildings" tab. Shows all properties in one unified list.

### Grouping
```
── RENTAL & PG (3) ──────────────────────
  🏠 Sunrise Apartments    Residential · 12 units · 2 vacant
  🏠 Green Tower           Residential · 8 units · 0 vacant
  🏨 City PG               PG/Hostel · 6 rooms · 4 beds free

── REAL ESTATE (2) ──────────────────────
  🌳 Green Valley Layout   Open Plots · 60 plots · 22 available
  🏗 Lakeside Villas        Housing/Villa · 24 units · 5 sold
```

### Add new Property button
- Always visible at top
- Opens `AddPropertyTypeScreen` (5-card type picker)

---

## 7. People Tab

Context-aware — shows Tenants or Buyers based on active property.

### Rental / PG mode → Tenants
- Existing `TenantsScreen` — unchanged behaviour
- List of active tenants with unit/bed, rent, move-in date

### Real Estate mode → Buyers
- New `BuyersScreen`
- List of active buyers with plot/unit, sale price, amount paid, balance
- Tap → `BuyerProfileScreen`

---

## 8. Reports Tab

Context-aware — shows rental reports or sales reports.

### Rental / PG mode
- Existing reports: Monthly breakdown, Pending & Partial
- Building filter dropdown (already implemented)
- Date range filter (This Month, Last Quarter, 6 Months, 1 Year, Custom)

### Real Estate mode
- Sales by project
- Per-unit: sale price, collected, balance, buyer name
- Total collected vs total project value
- Pending installments list

---

## 9. Add Property Flow

Single entry point — `AddPropertyTypeScreen`.

### Step 1 — Type Picker (5 cards)
```
┌─────────────────┐  ┌─────────────────┐
│  🏠             │  │  🏨             │
│  Rental         │  │  PG / Hostel    │
│  Building       │  │  Rooms + Beds   │
└─────────────────┘  └─────────────────┘
┌─────────────────┐  ┌─────────────────┐
│  🌳             │  │  🏗             │
│  Open Plots     │  │  Housing / Villa│
│  Area + Sale    │  │  Flat/House/    │
│                 │  │  Villa + Stages │
└─────────────────┘  └─────────────────┘
┌───────────────────────────────────────┐
│  🌾  Farm Land  ·  Acres + Sale       │
└───────────────────────────────────────┘
```

### Step 2 — Enter Details
Fields depend on selected type:

**Rental Building / PG:**
- Property Name (required)
- Address
- Type (auto-filled from Step 1)

**Real Estate (all sub-types):**
- Project Name (required)
- Location / Address
- Sub-type (auto-filled from Step 1, editable)
- Total planned units/plots (optional, for reference)

---

## 10. Add Unit / Plot Flow

### Rental Building
- Unit Number (required)
- Unit Type: Room / 1RK / 1BHK / 2BHK / 3BHK / 4BHK / Villa / Shop / Office / Entire Building
- Monthly Rent (₹) — per unit
- Notes (optional)

### PG / Hostel
- Room Number (required)
- Sharing Type: Single / 2-Sharing / 3-Sharing / 4-Sharing / 5-Sharing
- Rent per Bed (₹)
- Auto-creates beds: e.g. Room 5 + 3-Sharing → Bed 5A, Bed 5B, Bed 5C

### Open Plots / Farm Land
- Plot / Survey Number (required)
- Unit Type: Open Plot / Farm Land (auto-filled, editable)
- Area — sq.yd / sq.ft / acres (unit selectable)
- Facing: N / S / E / W / NE / NW / SE / SW (plots only)
- Sale Price (₹)
- Status: Available / Booked / Sold

### Housing / Villa
- Unit Number (required)
- Unit Type: Flat / House / Villa / Plot / [Custom — owner types freely]
- BHK (for Flat): 1BHK / 2BHK / 3BHK / 4BHK / Custom
- Area (sq.ft)
- Sale Price (₹)
- Status: Available / Booked / Under Construction / Ready / Sold
- Construction Stages (auto-initialised for Flat/House/Villa):
  1. Foundation
  2. Structure / Framing
  3. Roofing
  4. Plastering
  5. Finishing
  6. Handover

---

## 11. Add Buyer Flow (Real Estate)

Single screen (not multi-step like Add Tenant).

- Select Project + Plot/Unit (dropdown — shows only Available/Booked units)
- Buyer Full Name (required)
- Phone (required)
- Email (optional)
- ID Type + Number (optional)
- Booking Date (required)
- Agreed Sale Price (₹) — pre-filled from unit price, editable
- Notes (optional)
- On save: unit status auto-updates to "Booked"

---

## 12. Sale Payments (Real Estate)

- Record installment: Amount, Date, Payment Mode, Installment No., Notes
- Receipt auto-generated (reuses `receipt_sequences` table)
- WhatsApp receipt/reminder to buyer (reuses `openWhatsApp` utility)
- `buyers.amount_paid` auto-updated on each installment
- Balance = `sale_price - amount_paid`
- When balance = 0 → option to mark plot as "Sold"

---

## 13. Construction Stages (Housing / Villa / Flat)

Per unit — 6 fixed stages in order:

| # | Stage | Field |
|---|---|---|
| 1 | Foundation | Completed ✓ / Pending · Date · Notes |
| 2 | Structure / Framing | Completed ✓ / Pending · Date · Notes |
| 3 | Roofing | Completed ✓ / Pending · Date · Notes |
| 4 | Plastering | Completed ✓ / Pending · Date · Notes |
| 5 | Finishing | Completed ✓ / Pending · Date · Notes |
| 6 | Handover | Completed ✓ / Pending · Date · Notes |

- Stages must be completed in order
- Completing "Handover" prompts to mark unit as "Ready"
- Visible in `BuyerProfileScreen` if unit has a buyer

---

## 14. Existing Features (Unchanged)

All features from the original RentEase `RentApp` branch carry over:

- ✅ OTP-based login (Supabase Auth)
- ✅ Biometric unlock (fingerprint / Face ID)
- ✅ Profile setup (name, phone, DOB, UPI, bank details)
- ✅ Payment recording with electricity, water, other charges
- ✅ Auto-generated receipt numbers (RCP-YYYY-NNNN)
- ✅ PDF receipt generation + share
- ✅ WhatsApp rent reminders with `buildReminderMessage`
- ✅ Overdue payment detection
- ✅ Collected Payments screen
- ✅ Outstanding Payments screen with WhatsApp Remind button
- ✅ Move Out flow
- ✅ Payment History per tenant
- ✅ Reports with date filter + building filter
- ✅ Admin / Clients management screen
- ✅ Settings — profile, payment details, biometrics
- ✅ Building-aware filtering on all sub-screens

---

## 15. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Expo SDK 57 (React Native) |
| Language | TypeScript |
| Navigation | React Navigation v7 (native stack + bottom tabs) |
| Backend / DB | Supabase (PostgreSQL + Auth + RLS) |
| Auth | Supabase OTP (email/phone) |
| Local Storage | expo-secure-store, @react-native-async-storage |
| PDF | expo-print + expo-sharing |
| Biometrics | expo-local-authentication |
| Icons | @expo/vector-icons (Ionicons) |
| SMS/WhatsApp | expo-sms + Linking (wa.me) |
| Build | EAS Build (preview profile → APK) |

---

## 16. Branch Strategy

| Branch | Purpose |
|---|---|
| `RentApp` | Original RentEase rental-only app — **DO NOT TOUCH** |
| `RentAndLand` | PropEase — full multi-property platform (active development) |
| `main` | Reserved |

---

## 17. Screen Inventory

### 17.1 Unchanged Screens (12)
| Screen | File |
|---|---|
| Login | `src/screens/auth/LoginScreen.tsx` |
| OTP | `src/screens/auth/OTPScreen.tsx` |
| Profile Setup | `src/screens/auth/ProfileSetupScreen.tsx` |
| Tenant Profile | `src/screens/tenants/TenantProfileScreen.tsx` |
| Add Tenant Step 2 | `src/screens/tenants/AddTenantStep2Screen.tsx` |
| Add Tenant Step 3 | `src/screens/tenants/AddTenantStep3Screen.tsx` |
| Move Out | `src/screens/tenants/MoveOutScreen.tsx` |
| Record Payment | `src/screens/payments/RecordPaymentScreen.tsx` |
| Payment History | `src/screens/payments/PaymentHistoryScreen.tsx` |
| Receipt | `src/screens/payments/ReceiptScreen.tsx` |
| Settings | `src/screens/settings/SettingsScreen.tsx` |
| Admin Clients | `src/screens/admin/AdminClientsScreen.tsx` |

### 17.2 Modified Screens (7)
| Screen | File | Change |
|---|---|---|
| Dashboard | `src/screens/dashboard/DashboardScreen.tsx` | Property selector, module-aware cards + quick actions |
| Buildings → Properties | `src/screens/buildings/BuildingsScreen.tsx` | Show all 5 types grouped; rename tab |
| Add/Edit Building → Property | `src/screens/buildings/AddEditBuildingScreen.tsx` | All 5 types; real estate fields |
| Add/Edit Unit | `src/screens/units/AddEditUnitScreen.tsx` | PG beds, real estate area/price/facing |
| Add Tenant Step 1 | `src/screens/tenants/AddTenantStep1Screen.tsx` | Filter to rental/PG only |
| Tenants → People | `src/screens/tenants/TenantsScreen.tsx` | Context-aware: tenants or buyers |
| Reports | `src/screens/reports/ReportsScreen.tsx` | Context-aware: rental or real estate reports |

### 17.3 New Screens (11)
| Screen | File |
|---|---|
| Add Property Type Picker | `src/screens/properties/AddPropertyTypeScreen.tsx` |
| Plots List | `src/screens/properties/PlotsScreen.tsx` |
| Add/Edit Plot | `src/screens/properties/AddEditPlotScreen.tsx` |
| Construction Stages | `src/screens/properties/ConstructionStagesScreen.tsx` |
| Buyers List | `src/screens/buyers/BuyersScreen.tsx` |
| Add Buyer | `src/screens/buyers/AddBuyerScreen.tsx` |
| Buyer Profile | `src/screens/buyers/BuyerProfileScreen.tsx` |
| Record Sale Payment | `src/screens/buyers/RecordSalePaymentScreen.tsx` |
| Sale Receipt | `src/screens/buyers/SaleReceiptScreen.tsx` |
| Land Reports | `src/screens/reports/LandReportsScreen.tsx` |
| Vacant Plots | `src/screens/properties/VacantPlotsScreen.tsx` |

---

## 18. Commit Policy

- ✅ All commits go to `RentAndLand` branch only
- ✅ `RentApp` branch is never touched
- ✅ Confirmation required before every commit
- ✅ Commit messages follow: `feat:`, `fix:`, `refactor:`, `docs:` prefixes

---

## 19. Open Items / Future Scope

| Item | Priority | Notes |
|---|---|---|
| iOS build + App Store listing | Medium | After Android Play Store launch |
| Document upload per tenant/buyer | Medium | Aadhaar, agreement scan |
| Multi-user / team access | Low | Currently single owner only |
| Notification reminders (push) | Low | WhatsApp covers this for now |
| Bulk import (CSV) | Low | For migrating existing records |
| Dashboard charts / graphs | Low | Visual trend of rent collection |

---

## 20. Change Log

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-09-28 | Initial requirements document created |

---

*This document is the single source of truth for PropEase development.*  
*Update this file whenever requirements change before writing any code.*
