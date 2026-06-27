"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type PanelId = 'teams' | 'bracket' | 'matches';

const ORDER: PanelId[] = ['teams', 'bracket', 'matches'];

type Ctx = {
  visiblePanels: PanelId[];
  togglePanel: (id: PanelId) => void;
};

const AdminPanelContext = createContext<Ctx | null>(null);

export function AdminPanelProvider({ children }: { children: ReactNode }) {
  const [visiblePanels, setVisible] = useState<PanelId[]>(['teams', 'bracket']);

  function togglePanel(id: PanelId) {
    setVisible(prev => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        return prev.filter(p => p !== id);
      }
      return [...prev, id].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    });
  }

  return (
    <AdminPanelContext.Provider value={{ visiblePanels, togglePanel }}>
      {children}
    </AdminPanelContext.Provider>
  );
}

export function useAdminPanels(): Ctx {
  const ctx = useContext(AdminPanelContext);
  if (!ctx) throw new Error('useAdminPanels must be used inside AdminPanelProvider');
  return ctx;
}
