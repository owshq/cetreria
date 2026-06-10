import type { SelectMenuOption } from '@/components/SelectMenu';
import { getCountryByIso } from '@/lib/phoneCountries';

export type TaxPreset = {
  id: string;
  label: string;
  rate: number;
};

export type CountryTaxConfig = {
  names: string[];
  label: string;
  defaultRate: number;
  presets: TaxPreset[];
};

export const MANUAL_TAX_PRESET_ID = 'manual';
export const COUNTRY_OTHER_VALUE = '__other__';

const GENERIC_PRESETS: TaxPreset[] = [
  { id: 'generic-21', label: '21%', rate: 21 },
  { id: 'generic-10', label: '10%', rate: 10 },
  { id: 'generic-0', label: '0% (exento)', rate: 0 },
];

export const COUNTRY_TAX_CONFIGS: CountryTaxConfig[] = [
  {
    names: ['espana', 'spain', 'es'],
    label: 'España',
    defaultRate: 21,
    presets: [
      { id: 'es-21', label: 'IVA general (21%)', rate: 21 },
      { id: 'es-10', label: 'IVA reducido (10%)', rate: 10 },
      { id: 'es-4', label: 'IVA superreducido (4%)', rate: 4 },
      { id: 'es-0', label: 'Exento (0%)', rate: 0 },
    ],
  },
  {
    names: ['portugal', 'pt'],
    label: 'Portugal',
    defaultRate: 23,
    presets: [
      { id: 'pt-23', label: 'IVA normal (23%)', rate: 23 },
      { id: 'pt-13', label: 'IVA intermedio (13%)', rate: 13 },
      { id: 'pt-6', label: 'IVA reducido (6%)', rate: 6 },
      { id: 'pt-0', label: 'Exento (0%)', rate: 0 },
    ],
  },
  {
    names: ['francia', 'france', 'fr'],
    label: 'Francia',
    defaultRate: 20,
    presets: [
      { id: 'fr-20', label: 'TVA normal (20%)', rate: 20 },
      { id: 'fr-10', label: 'TVA intermedio (10%)', rate: 10 },
      { id: 'fr-55', label: 'TVA reducido (5,5%)', rate: 5.5 },
      { id: 'fr-0', label: 'Exento (0%)', rate: 0 },
    ],
  },
  {
    names: ['alemania', 'germany', 'de'],
    label: 'Alemania',
    defaultRate: 19,
    presets: [
      { id: 'de-19', label: 'IVA normal (19%)', rate: 19 },
      { id: 'de-7', label: 'IVA reducido (7%)', rate: 7 },
      { id: 'de-0', label: 'Exento (0%)', rate: 0 },
    ],
  },
  {
    names: ['italia', 'italy', 'it'],
    label: 'Italia',
    defaultRate: 22,
    presets: [
      { id: 'it-22', label: 'IVA normal (22%)', rate: 22 },
      { id: 'it-10', label: 'IVA reducido (10%)', rate: 10 },
      { id: 'it-4', label: 'IVA superreducido (4%)', rate: 4 },
      { id: 'it-0', label: 'Exento (0%)', rate: 0 },
    ],
  },
  {
    names: ['mexico', 'mx'],
    label: 'México',
    defaultRate: 16,
    presets: [
      { id: 'mx-16', label: 'IVA general (16%)', rate: 16 },
      { id: 'mx-0', label: 'Exento (0%)', rate: 0 },
    ],
  },
  {
    names: ['reino unido', 'united kingdom', 'uk', 'gb'],
    label: 'Reino Unido',
    defaultRate: 20,
    presets: [
      { id: 'gb-20', label: 'VAT standard (20%)', rate: 20 },
      { id: 'gb-5', label: 'VAT reduced (5%)', rate: 5 },
      { id: 'gb-0', label: 'Exempt (0%)', rate: 0 },
    ],
  },
  {
    names: ['argentina', 'ar'],
    label: 'Argentina',
    defaultRate: 21,
    presets: [
      { id: 'ar-21', label: 'IVA general (21%)', rate: 21 },
      { id: 'ar-105', label: 'IVA reducido (10,5%)', rate: 10.5 },
      { id: 'ar-0', label: 'Exento (0%)', rate: 0 },
    ],
  },
  {
    names: ['colombia', 'co'],
    label: 'Colombia',
    defaultRate: 19,
    presets: [
      { id: 'co-19', label: 'IVA general (19%)', rate: 19 },
      { id: 'co-5', label: 'IVA reducido (5%)', rate: 5 },
      { id: 'co-0', label: 'Exento (0%)', rate: 0 },
    ],
  },
  {
    names: ['chile', 'cl'],
    label: 'Chile',
    defaultRate: 19,
    presets: [
      { id: 'cl-19', label: 'IVA (19%)', rate: 19 },
      { id: 'cl-0', label: 'Exento (0%)', rate: 0 },
    ],
  },
];

export function normalizeCountryKey(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

export function resolveCountryTaxConfig(country: string): CountryTaxConfig | null {
  const key = normalizeCountryKey(country);
  if (!key) return null;

  return (
    COUNTRY_TAX_CONFIGS.find((config) =>
      config.names.some((name) => key === name || key.includes(name) || name.includes(key)),
    ) ?? null
  );
}

export function getTaxPresetsForCountry(country: string): TaxPreset[] {
  return resolveCountryTaxConfig(country)?.presets ?? GENERIC_PRESETS;
}

export function getDefaultTaxRateForCountry(country: string): number | null {
  return resolveCountryTaxConfig(country)?.defaultRate ?? null;
}

export function getTaxPresetOptions(country: string): SelectMenuOption[] {
  return [
    ...getTaxPresetsForCountry(country).map((preset) => ({
      value: preset.id,
      label: preset.label,
    })),
    { value: MANUAL_TAX_PRESET_ID, label: 'Personalizado' },
  ];
}

export function findTaxPresetId(country: string, rate: number): string {
  const presets = getTaxPresetsForCountry(country);
  const match = presets.find((preset) => preset.rate === rate);
  return match?.id ?? MANUAL_TAX_PRESET_ID;
}

export function getTaxRateForPreset(presetId: string, country: string): number | null {
  if (presetId === MANUAL_TAX_PRESET_ID) return null;
  const preset = getTaxPresetsForCountry(country).find((entry) => entry.id === presetId);
  return preset?.rate ?? null;
}

export function getCountrySelectOptions(): SelectMenuOption[] {
  return COUNTRY_TAX_CONFIGS.map((config) => ({
    value: config.label,
    label: config.label,
  }));
}

export function resolveCountryLabelFromIso(iso: string): string | null {
  const key = iso.trim().toLowerCase();
  if (!key) return null;

  const config = COUNTRY_TAX_CONFIGS.find((entry) => entry.names.includes(key));
  return config?.label ?? null;
}

export function applyBillingDefaultsFromIso(
  iso: string,
): { country: string; defaultTaxRate?: number } | null {
  const label = resolveCountryLabelFromIso(iso);
  if (label) {
    const defaultTaxRate = getDefaultTaxRateForCountry(label);
    return defaultTaxRate != null ? { country: label, defaultTaxRate } : { country: label };
  }

  const phoneCountry = getCountryByIso(iso);
  if (phoneCountry) {
    return { country: phoneCountry.name };
  }

  return null;
}
