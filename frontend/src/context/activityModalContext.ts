import { createContext, useContext } from 'react';
import type { Activity, CalendarEvent } from '@shared/types';

export type OpenNewActivityOptions = {
  directForm?: boolean;
};

export type ActivityModalFocusSection = 'documents' | 'assignees' | 'workReport';

export type OpenActivityModalOptions = {
  /** Abre el modal sin cambiar de ruta (p. ej. desde el panel). */
  navigate?: boolean;
  /** Abre directamente en modo edición (p. ej. para vincular documentos). */
  editMode?: boolean;
  /** Desplaza al abrir en edición hasta la sección indicada. */
  focusSection?: ActivityModalFocusSection;
};

export type ActivityModalContextValue = {
  openNew: (date?: string, options?: OpenNewActivityOptions) => void;
  openEdit: (event: CalendarEvent, options?: OpenActivityModalOptions) => void;
  openEditByActivity: (
    activity: Activity,
    events?: CalendarEvent[],
    options?: OpenActivityModalOptions,
  ) => void;
  /** Evento o actividad abiertos en el modal (para resaltar el ítem en sidebars). */
  activeEventId: string | null;
  activeActivityId: string | null;
  close: () => void;
  onActivitySaved: (listener: () => void | Promise<void>) => () => void;
  onDocumentSaved: (listener: () => void | Promise<void>) => () => void;
  notifyActivitySaved: () => Promise<void>;
  notifyDocumentSaved: () => Promise<void>;
  /** Incrementa tras cada guardado para forzar recarga de listas de actividades. */
  activitiesRefreshKey: number;
};

export const ActivityModalContext = createContext<ActivityModalContextValue | null>(null);

export function useActivityModal() {
  const context = useContext(ActivityModalContext);
  if (!context) {
    throw new Error('useActivityModal must be used within ActivityModalProvider');
  }
  return context;
}
