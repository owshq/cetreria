export function getClientWebsiteHref(website: string): string | null {
  const trimmed = website.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function getClientWebsiteLabel(website: string): string {
  return website.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
}
