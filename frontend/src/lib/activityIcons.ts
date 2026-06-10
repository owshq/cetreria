export const ACTIVITY_EMOJI = '🗓️';

export const ACTIVITY_ICON_OPTIONS: { id: string; emoji: string; label: string }[] = [
  { id: 'wrench', emoji: '🔧', label: 'Llave' },
  { id: 'package', emoji: '📦', label: 'Paquete' },
  { id: 'hammer', emoji: '🔨', label: 'Martillo' },
  { id: 'clipboard-check', emoji: '📋', label: 'Inspección' },
  { id: 'briefcase', emoji: '💼', label: 'Maletín' },
  { id: 'graduation-cap', emoji: '🎓', label: 'Formación' },
  { id: 'other', emoji: '🔘', label: 'Otro' },
  { id: 'calendar', emoji: ACTIVITY_EMOJI, label: 'Calendario' },
  { id: 'truck', emoji: '🚚', label: 'Transporte' },
  { id: 'shield', emoji: '🛡️', label: 'Seguridad' },
  { id: 'zap', emoji: '⚡', label: 'Eléctrico' },
  { id: 'settings', emoji: '⚙️', label: 'Ajustes' },
  { id: 'users', emoji: '👥', label: 'Equipo' },
  { id: 'map-pin', emoji: '📍', label: 'Visita' },
  { id: 'phone', emoji: '📞', label: 'Llamada' },
  { id: 'camera', emoji: '📷', label: 'Foto' },
  { id: 'file-text', emoji: '📄', label: 'Documento' },
  { id: 'star', emoji: '⭐', label: 'Destacado' },
  { id: 'heart', emoji: '❤️', label: 'Cuidado' },
];

const emojiMap = new Map(ACTIVITY_ICON_OPTIONS.map((o) => [o.id, o.emoji]));

const ICON_ALIASES: Record<string, string> = {
  'circle-ellipsis': 'other',
};

export function getActivityEmoji(iconId: string): string {
  const resolvedId = ICON_ALIASES[iconId] ?? iconId;
  return emojiMap.get(resolvedId) ?? emojiMap.get(iconId) ?? '🔘';
}

export const ACTIVITY_COLOR_PRESETS = [
  '#2563eb',
  '#059669',
  '#dc2626',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#525252',
  '#db2777',
  '#ca8a04',
  '#16a34a',
];
