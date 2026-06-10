const STORAGE_KEY = 'activities_return_url';

export function storeActivitiesReturnUrl(pathname: string, search: string): void {
  if (!pathname.startsWith('/activities')) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, `${pathname}${search}`);
  } catch {
    /* ignore quota / private mode */
  }
}

export function consumeActivitiesReturnUrl(): string {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    if (stored && stored.startsWith('/activities')) return stored;
  } catch {
    /* ignore */
  }
  return '/activities';
}
