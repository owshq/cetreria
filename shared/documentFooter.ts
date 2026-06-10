import type { WorkspaceBillingSettings } from './types.js';

export const DEFAULT_DOCUMENT_FOOTER_TEXT =
  'Protecci\u00f3n de datos de car\u00e1cter personal: En cumplimiento de lo dispuesto en el Reglamento (UE) 2016/679 del Parlamento Europeo y del Consejo, de 27 de abril de 2016 (RGPD) y la Ley Org\u00e1nica 3/2018, de 5 de diciembre, se le informa que los datos personales facilitados son tratados por F & H SERVICIO CONTROL DE FAUNA, SL, con CIF B55647499, situada en 43760 El Morell (Tarragona), Av. Pa\u00efsos Catalans, 2 1a, tel\u00e9fono 617250477, con la finalidad de poder presentar, a petici\u00f3n suya, nuestra Oferta de Servicios y ser\u00e1n conservados durante el tiempo de vigencia de la misma. La base legal para el tratamiento de sus datos se fundamenta en la aplicaci\u00f3n, a petici\u00f3n suya, de medidas precontractuales y no ser\u00e1n comunicados a terceros, menos en aquellos casos previstos por la legislaci\u00f3n vigente. Puede ejercer sus derechos de acceso, rectificaci\u00f3n, supresi\u00f3n, limitaci\u00f3n, portabilidad y oposici\u00f3n, de forma escrita en el domicilio social anteriormente indicado o v\u00eda email a fhalconesreus@hotmail.es, adjuntando fotocopia de documento oficial que le identifique. Puede obtener m\u00e1s informaci\u00f3n sobre sus derechos acudiendo a la p\u00e1gina web de la Agencia Espa\u00f1ola de Protecci\u00f3n de Datos, as\u00ed como presentar una reclamaci\u00f3n ante este organismo de considerarlo oportuno.';

export function normalizeDocumentFooterText(value: string | undefined | null): string {
  const trimmed = value?.trim();
  return trimmed || DEFAULT_DOCUMENT_FOOTER_TEXT;
}

export function resolveDocumentFooterText(
  company?: Pick<WorkspaceBillingSettings, 'documentFooterText'> | null,
): string {
  return normalizeDocumentFooterText(company?.documentFooterText);
}
