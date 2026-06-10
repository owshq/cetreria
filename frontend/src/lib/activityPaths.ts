export function activityDetailPath(id: string): string {
  return `/activities/${id}`;
}

export function newActivityPath(date?: string, directForm?: boolean): string {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (directForm) params.set('direct', '1');
  const query = params.toString();
  return query ? `/activities/new?${query}` : '/activities/new';
}
