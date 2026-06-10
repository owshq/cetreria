import type { ActivityType } from './types.js';

export type ActivityTypeDefinition = Omit<ActivityType, 'workspaceId'>;

export const UNKNOWN_ACTIVITY_TYPE_LABEL = 'Sin tipo';

export const DEFAULT_ACTIVITY_TYPES: ActivityTypeDefinition[] = [
  { id: 'at-1', name: 'Mantenimiento', icon: 'wrench', color: '#2563eb', createsDeliveryNote: true },
  { id: 'at-2', name: 'Instalación', icon: 'package', color: '#059669', createsDeliveryNote: true },
  { id: 'at-3', name: 'Reparación', icon: 'hammer', color: '#dc2626', createsDeliveryNote: true },
  { id: 'at-4', name: 'Inspección', icon: 'clipboard-check', color: '#d97706', createsDeliveryNote: true },
  { id: 'at-5', name: 'Consultoría', icon: 'briefcase', color: '#7c3aed', createsDeliveryNote: true },
  { id: 'at-6', name: 'Formación', icon: 'graduation-cap', color: '#0891b2', createsDeliveryNote: false },
  { id: 'at-7', name: 'Otro', icon: 'other', color: '#525252', createsDeliveryNote: true },
];

/** Tipos sin campo persistido se tratan como Informe de Trabajo (albaran automatico). */
export function activityTypeCreatesDeliveryNote(type: ActivityType | null | undefined): boolean {
  if (!type) return true;
  return type.createsDeliveryNote !== false;
}

/** Si true, el tipo usa el flujo de Informe de Trabajo (parte + albaran). */
export function activityTypeUsesWorkReport(type: ActivityType | null | undefined): boolean {
  return activityTypeCreatesDeliveryNote(type);
}

export function activityUsesWorkReport(
  activity: Pick<import('./types.js').Activity, 'type'>,
  activityTypes: ActivityType[],
): boolean {
  return activityTypeUsesWorkReport(resolveActivityType(activity.type, activityTypes));
}

export function workspaceHasWorkReportActivityTypes(activityTypes: ActivityType[]): boolean {
  return activityTypes.some((type) => activityTypeUsesWorkReport(type));
}

export function resolveActivityType(typeRef: string, types: ActivityType[]): ActivityType | null {
  if (!typeRef) return null;
  const byId = types.find((t) => t.id === typeRef);
  if (byId) return byId;
  const byName = types.find((t) => t.name === typeRef);
  if (byName) return byName;
  return null;
}

export function getActivityTypeLabel(typeRef: string, types: ActivityType[]): string {
  return resolveActivityType(typeRef, types)?.name ?? UNKNOWN_ACTIVITY_TYPE_LABEL;
}

export function buildActivityEventTitle(
  typeId: string,
  types: ActivityType[],
  clientName?: string,
): string {
  const label = getActivityTypeLabel(typeId, types);
  return clientName ? `${label} - ${clientName}` : label;
}

export function parseEventTypeIdFromTitle(title: string, types: ActivityType[]): string {
  const [prefix] = title.split(' - ');
  if (!prefix || prefix === UNKNOWN_ACTIVITY_TYPE_LABEL) return '';
  const match = types.find((t) => t.name === prefix);
  return match?.id ?? '';
}

export function resolveEventType(title: string, types: ActivityType[]): ActivityType | null {
  const typeId = parseEventTypeIdFromTitle(title, types);
  if (typeId) return resolveActivityType(typeId, types);
  const [prefix] = title.split(' - ');
  if (!prefix || prefix === UNKNOWN_ACTIVITY_TYPE_LABEL) return null;
  return types.find((t) => t.name === prefix) ?? null;
}
