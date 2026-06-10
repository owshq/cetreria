import type { WorkspaceBillingSettings } from '@shared/types';
import { applyBillingDefaultsFromIso } from '@/lib/countryTaxRates';
import { detectCountryIso } from '@/lib/detectCountry';

/** Aplica país/impuesto detectados cuando la empresa aún no tiene país guardado. */
export async function resolveWorkspaceBillingSettings(
  settings: WorkspaceBillingSettings,
): Promise<WorkspaceBillingSettings> {
  if (settings.country.trim()) return settings;

  const iso = await detectCountryIso();
  const detected = applyBillingDefaultsFromIso(iso);
  if (!detected) return settings;

  return { ...settings, ...detected };
}
