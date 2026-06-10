export type ClientCustomFieldEntry = {
  name: string;
  value: string;
};

export function customFieldsToEntries(
  fields?: Record<string, string> | null,
): ClientCustomFieldEntry[] {
  if (!fields || typeof fields !== 'object') return [];
  return Object.entries(fields)
    .map(([name, value]) => ({
      name: name.trim(),
      value: String(value ?? '').trim(),
    }))
    .filter((entry) => entry.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function entriesToCustomFields(entries: ClientCustomFieldEntry[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { name, value } of entries) {
    const key = name.trim();
    if (!key) continue;
    result[key] = value.trim();
  }
  return result;
}

export function normalizeClientCustomFields(
  fields?: Record<string, string> | null,
): Record<string, string> {
  return entriesToCustomFields(customFieldsToEntries(fields));
}
