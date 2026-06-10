/** Ensures search input placeholders end with ASCII ellipsis ("..."). */
export function withSearchEllipsis(text: string): string {
  const trimmed = text.trimEnd();
  if (trimmed.endsWith('...')) return trimmed;
  if (trimmed.endsWith('…') || trimmed.endsWith('\uFFFD')) return `${trimmed.slice(0, -1)}...`;
  return `${trimmed}...`;
}

export function getCountedSearchPlaceholder(
  count: number,
  singular: string,
  plural: string,
): string {
  const noun = count === 1 ? singular : plural;
  return `Buscar ${count} ${noun}`;
}

export function getActivitiesSearchPlaceholder(count: number): string {
  return getCountedSearchPlaceholder(count, 'actividad', 'actividades');
}

export function getContactsSearchPlaceholder(count: number): string {
  return getCountedSearchPlaceholder(count, 'contacto', 'contactos');
}

export function getDocumentsSearchPlaceholder(
  count: number,
  tab: 'all' | 'invoice' | 'delivery-note',
): string {
  if (tab === 'invoice') {
    return getCountedSearchPlaceholder(count, 'factura', 'facturas');
  }
  if (tab === 'delivery-note') {
    return getCountedSearchPlaceholder(count, 'albarán', 'albaranes');
  }
  return getCountedSearchPlaceholder(count, 'documento', 'documentos');
}
