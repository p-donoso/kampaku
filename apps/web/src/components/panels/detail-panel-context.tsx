"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type DetailEntityType = "agent" | "project" | "skill" | "task";

export type DetailPanelHandlers = {
  onSave?: () => Promise<void>;
  onCancel?: () => void;
  onDelete?: () => Promise<void>;
  canDelete?: boolean;
  deleteConfirmMessage?: string;
};

export type DetailPanelBusy = "save" | "delete" | null;

type DetailPanelContextValue = {
  entityType: DetailEntityType | null;
  slug: string | null;
  editing: boolean;
  setEditing: (value: boolean) => void;
  busy: DetailPanelBusy;
  setBusy: (value: DetailPanelBusy) => void;
  registerHandlers: (handlers: DetailPanelHandlers) => void;
  getHandlers: () => DetailPanelHandlers;
};

const DetailPanelContext = createContext<DetailPanelContextValue | null>(null);

export function DetailPanelProvider({
  entityType,
  slug,
  children,
}: {
  entityType: DetailEntityType | null;
  slug: string | null;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<DetailPanelBusy>(null);
  const handlersRef = useRef<DetailPanelHandlers>({});

  useEffect(() => {
    setEditing(false);
    setBusy(null);
    handlersRef.current = {};
  }, [entityType, slug]);

  const registerHandlers = useCallback((handlers: DetailPanelHandlers) => {
    handlersRef.current = handlers;
  }, []);

  const getHandlers = useCallback(() => handlersRef.current, []);

  const value = useMemo(
    () => ({
      entityType,
      slug,
      editing,
      setEditing,
      busy,
      setBusy,
      registerHandlers,
      getHandlers,
    }),
    [entityType, slug, editing, busy, registerHandlers, getHandlers],
  );

  return <DetailPanelContext.Provider value={value}>{children}</DetailPanelContext.Provider>;
}

export function useDetailPanel() {
  const ctx = useContext(DetailPanelContext);
  if (!ctx) throw new Error("useDetailPanel must be used within DetailPanelProvider");
  return ctx;
}

export function useOptionalDetailPanel() {
  return useContext(DetailPanelContext);
}
