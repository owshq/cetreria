import type { Document } from '@shared/types';
import type { SelectMenuOption } from '@/components/SelectMenu';
import ui from '@/styles/shared.module.css';

export const DOCUMENT_STATUS_DOT: Record<Document['status'], string> = {
  draft: '#737373',
  sent: '#3b82f6',
  paid: '#22c55e',
};

export const DOCUMENT_STATUS_LABELS: Record<Document['status'], string> = {
  draft: 'Borrador',
  sent: 'Enviado',
  paid: 'Pagado',
};

/** Clases de badge compartidas (tabla documentos, actividades, detalle, agrupaciones). */
export const DOCUMENT_STATUS_CLASS: Record<Document['status'], string> = {
  draft: ui.badgeDraft,
  sent: ui.badgeSent,
  paid: ui.badgeActive,
};

export const DOCUMENT_STATUSES: Document['status'][] = ['draft', 'sent', 'paid'];

export const DOCUMENT_STATUS_OPTIONS: SelectMenuOption[] = DOCUMENT_STATUSES.map((status) => ({
  value: status,
  label: DOCUMENT_STATUS_LABELS[status],
  dotColor: DOCUMENT_STATUS_DOT[status],
}));

export const DOCUMENT_STATUS_FILTER_OPTIONS: SelectMenuOption[] = [
  { value: 'all', label: 'Todos los estados', emoji: '📄' },
  { value: 'draft', label: 'Borradores', dotColor: DOCUMENT_STATUS_DOT.draft, emoji: '📝' },
  { value: 'sent', label: 'Enviados', dotColor: DOCUMENT_STATUS_DOT.sent, emoji: '📨' },
  { value: 'paid', label: 'Pagados', dotColor: DOCUMENT_STATUS_DOT.paid, emoji: '✅' },
];
