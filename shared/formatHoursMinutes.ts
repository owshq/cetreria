/**
 * Convierte horas decimales (p. ej. 2.5) a texto con horas y minutos: "2h 30m", "1h", "45m".
 */
export function formatHoursMinutes(hours: number): string | null {
  if (!Number.isFinite(hours) || hours <= 0) return null;

  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
