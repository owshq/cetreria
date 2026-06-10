import {
  DEFAULT_PHONE_COUNTRY,
  getCountryByIso,
  PHONE_COUNTRIES_BY_DIAL_LENGTH,
  type PhoneCountry,
} from './phoneCountries';

export type ParsedPhone = {
  countryIso: string;
  national: string;
};

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function formatPhoneValue(country: PhoneCountry, national: string): string {
  const nationalDigits = digitsOnly(national);
  if (!nationalDigits) return '';
  const dialDigits = digitsOnly(country.dialCode);
  return `+${dialDigits} ${nationalDigits}`;
}

export function parsePhoneValue(
  full: string,
  fallbackIso = DEFAULT_PHONE_COUNTRY,
): ParsedPhone {
  const trimmed = full.trim();
  if (!trimmed) {
    return { countryIso: fallbackIso, national: '' };
  }

  const allDigits = digitsOnly(trimmed);
  if (!allDigits) {
    return { countryIso: fallbackIso, national: '' };
  }

  for (const country of PHONE_COUNTRIES_BY_DIAL_LENGTH) {
    const dialDigits = digitsOnly(country.dialCode);
    if (allDigits.startsWith(dialDigits) && allDigits.length > dialDigits.length) {
      return {
        countryIso: country.iso,
        national: allDigits.slice(dialDigits.length),
      };
    }
    if (allDigits === dialDigits) {
      return { countryIso: country.iso, national: '' };
    }
  }

  if (trimmed.startsWith('+')) {
    return { countryIso: fallbackIso, national: allDigits };
  }

  return { countryIso: fallbackIso, national: allDigits };
}

export function isPhoneValueValid(full: string): boolean {
  const { national } = parsePhoneValue(full);
  return digitsOnly(national).length >= 6;
}

export function formatNationalDisplay(national: string): string {
  const d = digitsOnly(national);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
}
