"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type DragPreviewContextValue = {
  draggedTeamName: string | null;
  setDraggedTeamName: (name: string | null) => void;
};

const DragPreviewContext = createContext<DragPreviewContextValue | null>(null);

/** Tracks the team name currently being dragged from the team list, so any
 * match slot being hovered over (in the bracket or match list) can preview
 * it before drop — HTML5 drag-and-drop only exposes the dragged value on
 * `drop`, not on `dragover`, so this has to be carried via React state
 * rather than `dataTransfer`. */
export function DragPreviewProvider({ children }: { children: ReactNode }) {
  const [draggedTeamName, setDraggedTeamName] = useState<string | null>(null);
  return (
    <DragPreviewContext.Provider value={{ draggedTeamName, setDraggedTeamName }}>
      {children}
    </DragPreviewContext.Provider>
  );
}

export function useDragPreview(): DragPreviewContextValue {
  const ctx = useContext(DragPreviewContext);
  if (!ctx) return { draggedTeamName: null, setDraggedTeamName: () => {} };
  return ctx;
}
