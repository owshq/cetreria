import data from '@emoji-mart/data';
import type { EmojiMartData } from '@emoji-mart/data';

const CATEGORY_LABELS: Record<string, string> = {
  people: 'Personas y cuerpo',
  nature: 'Animales y naturaleza',
  foods: 'Comida y bebida',
  activity: 'Actividades',
  places: 'Viajes y lugares',
  objects: 'Objetos',
  symbols: 'Símbolos',
  flags: 'Banderas',
};

export type EmojiCategory = {
  id: string;
  label: string;
  emojis: string[];
};

const emojiData = data as EmojiMartData;

export const EMOJI_CATEGORIES: EmojiCategory[] = emojiData.categories
  .filter((category) => category.id in CATEGORY_LABELS)
  .map((category) => ({
    id: category.id,
    label: CATEGORY_LABELS[category.id],
    emojis: category.emojis
      .map((emojiId) => emojiData.emojis[emojiId]?.skins[0]?.native)
      .filter((native): native is string => Boolean(native)),
  }));

export const DEFAULT_VIEW_EMOJI = '🔎';
