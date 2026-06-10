import { isVerifactuProductionOperational } from '@shared/types';

/** Flag explicito para habilitar guardar/enviar en produccion AEAT (off por defecto). */
export function isVerifactuProductionEnabledInClient(): boolean {
  return isVerifactuProductionOperational(import.meta.env.VITE_VERIFACTU_PRODUCTION_ENABLED);
}
