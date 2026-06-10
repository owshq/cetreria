import { normalizeConceptKey } from './documentConcepts.js';

export type InvoiceConceptPreset = {
  label: string;
  emoji: string;
};

/** Conceptos de factura predefinidos para el workspace de halconería / control de aves. */
export const HALCONERIA_INVOICE_CONCEPTS: readonly InvoiceConceptPreset[] = [
  { label: 'Vuelos de marcaje y dispersión con aves rapaces', emoji: '🦅' },
  { label: 'Revisión y retirada de jaulas trampas', emoji: '🔍' },
  { label: 'Servicio control de palomas', emoji: '🕊️' },
  { label: 'Servicio control de gaviotas', emoji: '🐦' },
  { label: 'Gestión y retirada de nidos de palomas', emoji: '🪺' },
  { label: 'Gestión y retirada de nidos de gaviotas', emoji: '🪹' },
  { label: 'Servicio nocturno control de aves', emoji: '🌙' },
  { label: 'Colocación de jaulas trampas', emoji: '🪤' },
] as const;

export function getHalconeriaConceptLabels(): string[] {
  return HALCONERIA_INVOICE_CONCEPTS.map((concept) => concept.label);
}

export function getHalconeriaConceptPreset(
  normalizedKey: string,
): InvoiceConceptPreset | undefined {
  return HALCONERIA_INVOICE_CONCEPTS.find(
    (concept) => normalizeConceptKey(concept.label) === normalizedKey,
  );
}
