/** Codigo cuando el modulo no esta licenciado en el despliegue (VERIFACTU_MODULE_ENABLED). */
export const VERIFACTU_MODULE_DISABLED_CODE = 'VERIFACTU_MODULE_NOT_LICENSED';

export const VERIFACTU_MODULE_DISABLED_MESSAGE =
  'El modulo Veri*Factu no esta contratado en este despliegue. Contacta con soporte para activarlo.';

export function parseVerifactuModuleEnabled(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === 'true';
}

export function isVerifactuModuleLicensed(moduleEnabled: boolean): boolean {
  return moduleEnabled === true;
}

/** Preferencia de workspace efectiva: requiere licencia de despliegue + flag del workspace. */
export function resolveWorkspaceVerifactuEnabled(
  storedEnabled: boolean,
  moduleLicensed: boolean,
): boolean {
  return moduleLicensed && storedEnabled === true;
}
