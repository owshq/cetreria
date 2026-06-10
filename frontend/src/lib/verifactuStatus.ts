import type { VerifactuStatus } from '@shared/types';
import ui from '@/styles/shared.module.css';

export const VERIFACTU_STATUS_CLASS: Record<VerifactuStatus, string> = {
  pendiente: ui.badgeDraft,
  enviado: ui.badgeSent,
  aceptado: ui.badgeActive,
  rechazado: ui.badgeRejected,
  anulado: ui.badgeInactive,
};
