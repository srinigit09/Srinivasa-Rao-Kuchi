import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { BuildingType, PropertySummary, isRentalType, isRealEstateType } from '../types';

const STORAGE_KEY = 'propease_active_property';

interface ActiveProperty {
  id: string;
  name: string;
  building_type: BuildingType;
}

interface PropertyContextValue {
  // Active property (null = "All Properties" overview)
  activeProperty: ActiveProperty | null;
  setActiveProperty: (p: ActiveProperty | null) => void;

  // All properties for the selector sheet
  allProperties: PropertySummary[];
  loadProperties: () => Promise<void>;
  propertiesLoading: boolean;

  // Derived helpers
  isRental: boolean;       // active is residential or pg
  isRealEstate: boolean;   // active is open_plots / housing_villa / farm_land
  isPG: boolean;           // active is specifically pg
  isAllProperties: boolean; // no active property selected (overview mode)
}

const PropertyContext = createContext<PropertyContextValue>({
  activeProperty: null,
  setActiveProperty: () => {},
  allProperties: [],
  loadProperties: async () => {},
  propertiesLoading: false,
  isRental: false,
  isRealEstate: false,
  isPG: false,
  isAllProperties: true,
});

export function PropertyProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const [activeProperty, setActivePropertyState] = useState<ActiveProperty | null>(null);
  const [allProperties, setAllProperties] = useState<PropertySummary[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(false);

  // ── Load all properties from Supabase ──────────────────────────────────────
  const loadProperties = useCallback(async () => {
    if (!user) return;
    setPropertiesLoading(true);
    const { data } = await supabase
      .from('buildings')
      .select(`
        id, name, address, building_type,
        units(id, is_vacant, plot_status, sale_price)
      `)
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true });

    const summaries: PropertySummary[] = (data ?? []).map((b: any) => {
      const units = b.units ?? [];
      const isRE = isRealEstateType(b.building_type as BuildingType);
      return {
        id: b.id,
        name: b.name,
        address: b.address,
        building_type: b.building_type as BuildingType,
        total_units: units.length,
        vacant_units: isRE
          ? units.filter((u: any) => u.plot_status === 'available' || !u.plot_status).length
          : units.filter((u: any) => u.is_vacant).length,
        booked_units: isRE
          ? units.filter((u: any) => u.plot_status === 'booked').length
          : undefined,
        sold_units: isRE
          ? units.filter((u: any) => u.plot_status === 'sold').length
          : undefined,
        total_sale_value: isRE
          ? units.reduce((s: number, u: any) => s + (u.sale_price ?? 0), 0)
          : undefined,
      };
    });
    setAllProperties(summaries);
    setPropertiesLoading(false);
  }, [user]);

  // ── Restore last active property on mount ─────────────────────────────────
  useEffect(() => {
    const restore = async () => {
      try {
        // First try profile's last_property_id (Supabase-persisted)
        if (profile?.last_property_id && profile?.last_property_type) {
          // We'll set it after properties load — just store the intent
          const stored = await AsyncStorage.getItem(STORAGE_KEY);
          if (stored) {
            const parsed: ActiveProperty = JSON.parse(stored);
            setActivePropertyState(parsed);
          }
        } else {
          const stored = await AsyncStorage.getItem(STORAGE_KEY);
          if (stored) {
            setActivePropertyState(JSON.parse(stored));
          }
        }
      } catch {
        // ignore parse errors — stay in "All Properties" mode
      }
    };
    restore();
  }, [profile]);

  // ── Persist active property selection ─────────────────────────────────────
  const setActiveProperty = useCallback(async (p: ActiveProperty | null) => {
    setActivePropertyState(p);
    if (p) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(p));
      // Also persist to Supabase profile so it survives app reinstalls
      if (user) {
        await supabase
          .from('profiles')
          .update({
            last_property_id: p.id,
            last_property_type: p.building_type,
          })
          .eq('id', user.id);
      }
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
      if (user) {
        await supabase
          .from('profiles')
          .update({ last_property_id: null, last_property_type: null })
          .eq('id', user.id);
      }
    }
  }, [user]);

  // ── Load properties when user is available ────────────────────────────────
  useEffect(() => {
    if (user) loadProperties();
  }, [user, loadProperties]);

  // ── Derived booleans ──────────────────────────────────────────────────────
  const isRental     = !!activeProperty && isRentalType(activeProperty.building_type);
  const isRealEstate = !!activeProperty && isRealEstateType(activeProperty.building_type);
  const isPG         = activeProperty?.building_type === 'pg';
  const isAllProperties = activeProperty === null;

  return (
    <PropertyContext.Provider value={{
      activeProperty,
      setActiveProperty,
      allProperties,
      loadProperties,
      propertiesLoading,
      isRental,
      isRealEstate,
      isPG,
      isAllProperties,
    }}>
      {children}
    </PropertyContext.Provider>
  );
}

export const useProperty = () => useContext(PropertyContext);
