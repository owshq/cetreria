export type PhoneCountry = {
  iso: string;
  name: string;
  dialCode: string;
};

/** Regional indicator flag emoji from ISO 3166-1 alpha-2 */
export function flagEmoji(iso: string): string {
  const code = iso.toUpperCase();
  if (code.length !== 2 || !/^[A-Z]{2}$/.test(code)) return '🌐';
  return code
    .split('')
    .map((char) => String.fromCodePoint(0x1f1e6 - 65 + char.charCodeAt(0)))
    .join('');
}

export const DEFAULT_PHONE_COUNTRY = 'ES';

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: 'AF', name: 'Afganistán', dialCode: '+93' },
  { iso: 'AL', name: 'Albania', dialCode: '+355' },
  { iso: 'DE', name: 'Alemania', dialCode: '+49' },
  { iso: 'AD', name: 'Andorra', dialCode: '+376' },
  { iso: 'AO', name: 'Angola', dialCode: '+244' },
  { iso: 'SA', name: 'Arabia Saudita', dialCode: '+966' },
  { iso: 'DZ', name: 'Argelia', dialCode: '+213' },
  { iso: 'AR', name: 'Argentina', dialCode: '+54' },
  { iso: 'AM', name: 'Armenia', dialCode: '+374' },
  { iso: 'AU', name: 'Australia', dialCode: '+61' },
  { iso: 'AT', name: 'Austria', dialCode: '+43' },
  { iso: 'AZ', name: 'Azerbaiyán', dialCode: '+994' },
  { iso: 'BS', name: 'Bahamas', dialCode: '+1242' },
  { iso: 'BD', name: 'Bangladés', dialCode: '+880' },
  { iso: 'BB', name: 'Barbados', dialCode: '+1246' },
  { iso: 'BH', name: 'Baréin', dialCode: '+973' },
  { iso: 'BE', name: 'Bélgica', dialCode: '+32' },
  { iso: 'BZ', name: 'Belice', dialCode: '+501' },
  { iso: 'BJ', name: 'Benín', dialCode: '+229' },
  { iso: 'BY', name: 'Bielorrusia', dialCode: '+375' },
  { iso: 'BO', name: 'Bolivia', dialCode: '+591' },
  { iso: 'BA', name: 'Bosnia y Herzegovina', dialCode: '+387' },
  { iso: 'BW', name: 'Botsuana', dialCode: '+267' },
  { iso: 'BR', name: 'Brasil', dialCode: '+55' },
  { iso: 'BN', name: 'Brunéi', dialCode: '+673' },
  { iso: 'BG', name: 'Bulgaria', dialCode: '+359' },
  { iso: 'BF', name: 'Burkina Faso', dialCode: '+226' },
  { iso: 'BI', name: 'Burundi', dialCode: '+257' },
  { iso: 'BT', name: 'Bután', dialCode: '+975' },
  { iso: 'CV', name: 'Cabo Verde', dialCode: '+238' },
  { iso: 'KH', name: 'Camboya', dialCode: '+855' },
  { iso: 'CM', name: 'Camerún', dialCode: '+237' },
  { iso: 'CA', name: 'Canadá', dialCode: '+1' },
  { iso: 'QA', name: 'Catar', dialCode: '+974' },
  { iso: 'TD', name: 'Chad', dialCode: '+235' },
  { iso: 'CL', name: 'Chile', dialCode: '+56' },
  { iso: 'CN', name: 'China', dialCode: '+86' },
  { iso: 'CY', name: 'Chipre', dialCode: '+357' },
  { iso: 'CO', name: 'Colombia', dialCode: '+57' },
  { iso: 'KM', name: 'Comoras', dialCode: '+269' },
  { iso: 'KP', name: 'Corea del Norte', dialCode: '+850' },
  { iso: 'KR', name: 'Corea del Sur', dialCode: '+82' },
  { iso: 'CI', name: 'Costa de Marfil', dialCode: '+225' },
  { iso: 'CR', name: 'Costa Rica', dialCode: '+506' },
  { iso: 'HR', name: 'Croacia', dialCode: '+385' },
  { iso: 'CU', name: 'Cuba', dialCode: '+53' },
  { iso: 'DK', name: 'Dinamarca', dialCode: '+45' },
  { iso: 'DM', name: 'Dominica', dialCode: '+1767' },
  { iso: 'EC', name: 'Ecuador', dialCode: '+593' },
  { iso: 'EG', name: 'Egipto', dialCode: '+20' },
  { iso: 'SV', name: 'El Salvador', dialCode: '+503' },
  { iso: 'AE', name: 'Emiratos Árabes Unidos', dialCode: '+971' },
  { iso: 'SK', name: 'Eslovaquia', dialCode: '+421' },
  { iso: 'SI', name: 'Eslovenia', dialCode: '+386' },
  { iso: 'ES', name: 'España', dialCode: '+34' },
  { iso: 'US', name: 'Estados Unidos', dialCode: '+1' },
  { iso: 'EE', name: 'Estonia', dialCode: '+372' },
  { iso: 'SZ', name: 'Esuatini', dialCode: '+268' },
  { iso: 'ET', name: 'Etiopía', dialCode: '+251' },
  { iso: 'PH', name: 'Filipinas', dialCode: '+63' },
  { iso: 'FI', name: 'Finlandia', dialCode: '+358' },
  { iso: 'FJ', name: 'Fiyi', dialCode: '+679' },
  { iso: 'FR', name: 'Francia', dialCode: '+33' },
  { iso: 'GA', name: 'Gabón', dialCode: '+241' },
  { iso: 'GM', name: 'Gambia', dialCode: '+220' },
  { iso: 'GE', name: 'Georgia', dialCode: '+995' },
  { iso: 'GH', name: 'Ghana', dialCode: '+233' },
  { iso: 'GR', name: 'Grecia', dialCode: '+30' },
  { iso: 'GD', name: 'Granada', dialCode: '+1473' },
  { iso: 'GT', name: 'Guatemala', dialCode: '+502' },
  { iso: 'GN', name: 'Guinea', dialCode: '+224' },
  { iso: 'GQ', name: 'Guinea Ecuatorial', dialCode: '+240' },
  { iso: 'GW', name: 'Guinea-Bisáu', dialCode: '+245' },
  { iso: 'GY', name: 'Guyana', dialCode: '+592' },
  { iso: 'HT', name: 'Haití', dialCode: '+509' },
  { iso: 'HN', name: 'Honduras', dialCode: '+504' },
  { iso: 'HU', name: 'Hungría', dialCode: '+36' },
  { iso: 'IN', name: 'India', dialCode: '+91' },
  { iso: 'ID', name: 'Indonesia', dialCode: '+62' },
  { iso: 'IQ', name: 'Irak', dialCode: '+964' },
  { iso: 'IR', name: 'Irán', dialCode: '+98' },
  { iso: 'IE', name: 'Irlanda', dialCode: '+353' },
  { iso: 'IS', name: 'Islandia', dialCode: '+354' },
  { iso: 'MH', name: 'Islas Marshall', dialCode: '+692' },
  { iso: 'SB', name: 'Islas Salomón', dialCode: '+677' },
  { iso: 'IL', name: 'Israel', dialCode: '+972' },
  { iso: 'IT', name: 'Italia', dialCode: '+39' },
  { iso: 'JM', name: 'Jamaica', dialCode: '+1876' },
  { iso: 'JP', name: 'Japón', dialCode: '+81' },
  { iso: 'JO', name: 'Jordania', dialCode: '+962' },
  { iso: 'KZ', name: 'Kazajistán', dialCode: '+7' },
  { iso: 'KE', name: 'Kenia', dialCode: '+254' },
  { iso: 'KG', name: 'Kirguistán', dialCode: '+996' },
  { iso: 'KI', name: 'Kiribati', dialCode: '+686' },
  { iso: 'KW', name: 'Kuwait', dialCode: '+965' },
  { iso: 'LA', name: 'Laos', dialCode: '+856' },
  { iso: 'LS', name: 'Lesoto', dialCode: '+266' },
  { iso: 'LV', name: 'Letonia', dialCode: '+371' },
  { iso: 'LB', name: 'Líbano', dialCode: '+961' },
  { iso: 'LR', name: 'Liberia', dialCode: '+231' },
  { iso: 'LY', name: 'Libia', dialCode: '+218' },
  { iso: 'LI', name: 'Liechtenstein', dialCode: '+423' },
  { iso: 'LT', name: 'Lituania', dialCode: '+370' },
  { iso: 'LU', name: 'Luxemburgo', dialCode: '+352' },
  { iso: 'MK', name: 'Macedonia del Norte', dialCode: '+389' },
  { iso: 'MG', name: 'Madagascar', dialCode: '+261' },
  { iso: 'MY', name: 'Malasia', dialCode: '+60' },
  { iso: 'MW', name: 'Malaui', dialCode: '+265' },
  { iso: 'MV', name: 'Maldivas', dialCode: '+960' },
  { iso: 'ML', name: 'Mali', dialCode: '+223' },
  { iso: 'MT', name: 'Malta', dialCode: '+356' },
  { iso: 'MA', name: 'Marruecos', dialCode: '+212' },
  { iso: 'MU', name: 'Mauricio', dialCode: '+230' },
  { iso: 'MR', name: 'Mauritania', dialCode: '+222' },
  { iso: 'MX', name: 'México', dialCode: '+52' },
  { iso: 'FM', name: 'Micronesia', dialCode: '+691' },
  { iso: 'MD', name: 'Moldavia', dialCode: '+373' },
  { iso: 'MC', name: 'Mónaco', dialCode: '+377' },
  { iso: 'MN', name: 'Mongolia', dialCode: '+976' },
  { iso: 'ME', name: 'Montenegro', dialCode: '+382' },
  { iso: 'MZ', name: 'Mozambique', dialCode: '+258' },
  { iso: 'MM', name: 'Myanmar', dialCode: '+95' },
  { iso: 'NA', name: 'Namibia', dialCode: '+264' },
  { iso: 'NR', name: 'Nauru', dialCode: '+674' },
  { iso: 'NP', name: 'Nepal', dialCode: '+977' },
  { iso: 'NI', name: 'Nicaragua', dialCode: '+505' },
  { iso: 'NE', name: 'Níger', dialCode: '+227' },
  { iso: 'NG', name: 'Nigeria', dialCode: '+234' },
  { iso: 'NO', name: 'Noruega', dialCode: '+47' },
  { iso: 'NZ', name: 'Nueva Zelanda', dialCode: '+64' },
  { iso: 'OM', name: 'Omán', dialCode: '+968' },
  { iso: 'NL', name: 'Países Bajos', dialCode: '+31' },
  { iso: 'PK', name: 'Pakistán', dialCode: '+92' },
  { iso: 'PW', name: 'Palaos', dialCode: '+680' },
  { iso: 'PS', name: 'Palestina', dialCode: '+970' },
  { iso: 'PA', name: 'Panamá', dialCode: '+507' },
  { iso: 'PG', name: 'Papúa Nueva Guinea', dialCode: '+675' },
  { iso: 'PY', name: 'Paraguay', dialCode: '+595' },
  { iso: 'PE', name: 'Perú', dialCode: '+51' },
  { iso: 'PL', name: 'Polonia', dialCode: '+48' },
  { iso: 'PT', name: 'Portugal', dialCode: '+351' },
  { iso: 'GB', name: 'Reino Unido', dialCode: '+44' },
  { iso: 'CF', name: 'República Centroafricana', dialCode: '+236' },
  { iso: 'CZ', name: 'República Checa', dialCode: '+420' },
  { iso: 'CG', name: 'República del Congo', dialCode: '+242' },
  { iso: 'CD', name: 'República Democrática del Congo', dialCode: '+243' },
  { iso: 'DO', name: 'República Dominicana', dialCode: '+1809' },
  { iso: 'RW', name: 'Ruanda', dialCode: '+250' },
  { iso: 'RO', name: 'Rumanía', dialCode: '+40' },
  { iso: 'RU', name: 'Rusia', dialCode: '+7' },
  { iso: 'WS', name: 'Samoa', dialCode: '+685' },
  { iso: 'KN', name: 'San Cristóbal y Nieves', dialCode: '+1869' },
  { iso: 'SM', name: 'San Marino', dialCode: '+378' },
  { iso: 'VC', name: 'San Vicente y las Granadinas', dialCode: '+1784' },
  { iso: 'LC', name: 'Santa Lucía', dialCode: '+1758' },
  { iso: 'ST', name: 'Santo Tomé y Príncipe', dialCode: '+239' },
  { iso: 'SN', name: 'Senegal', dialCode: '+221' },
  { iso: 'RS', name: 'Serbia', dialCode: '+381' },
  { iso: 'SC', name: 'Seychelles', dialCode: '+248' },
  { iso: 'SL', name: 'Sierra Leona', dialCode: '+232' },
  { iso: 'SG', name: 'Singapur', dialCode: '+65' },
  { iso: 'SY', name: 'Siria', dialCode: '+963' },
  { iso: 'SO', name: 'Somalia', dialCode: '+252' },
  { iso: 'LK', name: 'Sri Lanka', dialCode: '+94' },
  { iso: 'ZA', name: 'Sudáfrica', dialCode: '+27' },
  { iso: 'SD', name: 'Sudán', dialCode: '+249' },
  { iso: 'SS', name: 'Sudán del Sur', dialCode: '+211' },
  { iso: 'SE', name: 'Suecia', dialCode: '+46' },
  { iso: 'CH', name: 'Suiza', dialCode: '+41' },
  { iso: 'SR', name: 'Surinam', dialCode: '+597' },
  { iso: 'TH', name: 'Tailandia', dialCode: '+66' },
  { iso: 'TW', name: 'Taiwán', dialCode: '+886' },
  { iso: 'TZ', name: 'Tanzania', dialCode: '+255' },
  { iso: 'TJ', name: 'Tayikistán', dialCode: '+992' },
  { iso: 'TL', name: 'Timor Oriental', dialCode: '+670' },
  { iso: 'TG', name: 'Togo', dialCode: '+228' },
  { iso: 'TO', name: 'Tonga', dialCode: '+676' },
  { iso: 'TT', name: 'Trinidad y Tobago', dialCode: '+1868' },
  { iso: 'TN', name: 'Túnez', dialCode: '+216' },
  { iso: 'TM', name: 'Turkmenistán', dialCode: '+993' },
  { iso: 'TR', name: 'Turquía', dialCode: '+90' },
  { iso: 'TV', name: 'Tuvalu', dialCode: '+688' },
  { iso: 'UA', name: 'Ucrania', dialCode: '+380' },
  { iso: 'UG', name: 'Uganda', dialCode: '+256' },
  { iso: 'UY', name: 'Uruguay', dialCode: '+598' },
  { iso: 'UZ', name: 'Uzbekistán', dialCode: '+998' },
  { iso: 'VU', name: 'Vanuatu', dialCode: '+678' },
  { iso: 'VA', name: 'Vaticano', dialCode: '+379' },
  { iso: 'VE', name: 'Venezuela', dialCode: '+58' },
  { iso: 'VN', name: 'Vietnam', dialCode: '+84' },
  { iso: 'YE', name: 'Yemen', dialCode: '+967' },
  { iso: 'DJ', name: 'Yibuti', dialCode: '+253' },
  { iso: 'ZM', name: 'Zambia', dialCode: '+260' },
  { iso: 'ZW', name: 'Zimbabue', dialCode: '+263' },
];

const byIso = new Map(PHONE_COUNTRIES.map((c) => [c.iso, c]));

export function getCountryByIso(iso: string): PhoneCountry | undefined {
  return byIso.get(iso.toUpperCase());
}

/** Longest dial codes first for correct parsing (+1 vs +1242). */
export const PHONE_COUNTRIES_BY_DIAL_LENGTH = [...PHONE_COUNTRIES].sort(
  (a, b) => b.dialCode.replace(/\D/g, '').length - a.dialCode.replace(/\D/g, '').length,
);

export function getCountriesSorted(): PhoneCountry[] {
  return [...PHONE_COUNTRIES].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function filterCountries(query: string): PhoneCountry[] {
  const q = query.trim().toLowerCase();
  if (!q) return getCountriesSorted();
  const digits = q.replace(/\D/g, '');
  return getCountriesSorted().filter((c) => {
    const dialDigits = c.dialCode.replace(/\D/g, '');
    return (
      c.name.toLowerCase().includes(q) ||
      c.iso.toLowerCase().includes(q) ||
      c.dialCode.includes(q) ||
      (digits.length > 0 && dialDigits.startsWith(digits))
    );
  });
}
