export type WorkspaceFeatureSettings = {
  id: string;
  workspaceId: string;
  /** Firma de horas por operario en actividades. */
  workerSignaturesEnabled: boolean;
  /** Cuadrante de turnos y tramos M/T/N en actividades. */
  shiftSchedulingEnabled: boolean;
  /** Parte de trabajo (horas reales + notas) tras completar la actividad. */
  activityWorkReportsEnabled: boolean;
  /** Crear conceptos nuevos al facturar o en partes (no solo el catalogo de ajustes). */
  invoiceConceptFreeCreationEnabled: boolean;
  /** Registro de facturas Veri*Factu (sandbox AEAT simulado). */
  verifactuEnabled: boolean;
};

export const DEFAULT_WORKSPACE_FEATURE_FLAGS = {
  workerSignaturesEnabled: false,
  shiftSchedulingEnabled: false,
  activityWorkReportsEnabled: true,
  invoiceConceptFreeCreationEnabled: false,
  verifactuEnabled: false,
} as const;

export function defaultWorkspaceFeatureSettings(workspaceId: string): WorkspaceFeatureSettings {
  return {
    id: workspaceId,
    workspaceId,
    ...DEFAULT_WORKSPACE_FEATURE_FLAGS,
  };
}

export function normalizeWorkspaceFeatureSettings(
  raw: Partial<WorkspaceFeatureSettings> | null | undefined,
  workspaceId: string,
): WorkspaceFeatureSettings {
  const defaults = defaultWorkspaceFeatureSettings(workspaceId);
  if (!raw) return defaults;

  return {
    id: raw.id ?? workspaceId,
    workspaceId,
    workerSignaturesEnabled:
      typeof raw.workerSignaturesEnabled === 'boolean'
        ? raw.workerSignaturesEnabled
        : defaults.workerSignaturesEnabled,
    shiftSchedulingEnabled:
      typeof raw.shiftSchedulingEnabled === 'boolean'
        ? raw.shiftSchedulingEnabled
        : defaults.shiftSchedulingEnabled,
    activityWorkReportsEnabled:
      typeof raw.activityWorkReportsEnabled === 'boolean'
        ? raw.activityWorkReportsEnabled
        : defaults.activityWorkReportsEnabled,
    invoiceConceptFreeCreationEnabled:
      typeof raw.invoiceConceptFreeCreationEnabled === 'boolean'
        ? raw.invoiceConceptFreeCreationEnabled
        : defaults.invoiceConceptFreeCreationEnabled,
    verifactuEnabled:
      typeof raw.verifactuEnabled === 'boolean'
        ? raw.verifactuEnabled
        : defaults.verifactuEnabled,
  };
}
