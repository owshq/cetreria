import { DEFAULT_PHONE_COUNTRY, getCountryByIso } from './phoneCountries';
import { storageKeys } from './storageKeys';

const CACHE_KEY = storageKeys.detectedCountry;

export async function detectCountryIso(): Promise<string> {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached && getCountryByIso(cached)) return cached;
  } catch {
    /* sessionStorage unavailable */
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://ipapi.co/country_code/', {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const code = (await res.text()).trim().toUpperCase();
      if (getCountryByIso(code)) {
        try {
          sessionStorage.setItem(CACHE_KEY, code);
        } catch {
          /* ignore */
        }
        return code;
      }
    }
  } catch {
    /* network / timeout */
  }

  return DEFAULT_PHONE_COUNTRY;
}
