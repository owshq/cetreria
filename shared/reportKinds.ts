export type ReportKind =
  | 'general'
  | 'contacts_global'
  | 'contact'
  | 'workers_global'
  | 'worker';

export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  general: 'Informe General',
  contacts_global: 'Informe global de contactos',
  contact: 'Informe de contacto',
  workers_global: 'Informe de Equipo',
  worker: 'Informe de operario',
};

export const REPORT_KIND_HEADING: Record<ReportKind, string> = {
  general: 'INFORME GENERAL',
  contacts_global: 'INFORME GLOBAL DE CONTACTOS',
  contact: 'INFORME DE CONTACTO',
  workers_global: 'INFORME DE EQUIPO',
  worker: 'INFORME DE OPERARIO',
};

const LEGACY_REPORT_KIND_MAP: Record<string, ReportKind> = {
  operators_global: 'workers_global',
  operator: 'worker',
};

export function normalizeReportKind(kind: string): ReportKind {
  return LEGACY_REPORT_KIND_MAP[kind] ?? (kind as ReportKind);
}

export function resolveReportKind(options: {
  clientId?: string;
  workerUserId?: string;
  explicitKind?: ReportKind;
}): ReportKind {
  if (options.explicitKind) return options.explicitKind;
  if (options.workerUserId) return 'worker';
  if (options.clientId) return 'contact';
  return 'general';
}
