import React, { createContext, useContext, useState } from 'react';

interface SelectedBuildingContextType {
  selectedBuildingId: string;
  setSelectedBuildingId: (id: string) => void;
}

const SelectedBuildingContext = createContext<SelectedBuildingContextType>({
  selectedBuildingId: '',
  setSelectedBuildingId: () => {},
});

export const SelectedBuildingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('');
  return (
    <SelectedBuildingContext.Provider value={{ selectedBuildingId, setSelectedBuildingId }}>
      {children}
    </SelectedBuildingContext.Provider>
  );
};

export const useSelectedBuilding = () => useContext(SelectedBuildingContext);
