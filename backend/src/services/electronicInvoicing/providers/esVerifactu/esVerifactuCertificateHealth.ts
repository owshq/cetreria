import fs from 'node:fs';
import type { ElectronicInvoicingCertificateStatus } from '@shared/types';
import type { EsVerifactuResolvedConfig } from './esVerifactuConfig.js';

export type EsVerifactuCertificateHealthResult = {
  certificateStatus: ElectronicInvoicingCertificateStatus;
  detail?: string;
};

/**
 * Health preparatorio del certificado (Fase 2A).
 * No carga clave privada, no firma, no mTLS.
 */
export function getEsVerifactuCertificateHealth(
  config: EsVerifactuResolvedConfig,
): EsVerifactuCertificateHealthResult {
  const hasFileName = Boolean(config.certificateFileName);
  const hasPath = Boolean(config.certificatePath);

  if (!hasFileName && !hasPath) {
    return {
      certificateStatus: 'missing',
      detail: 'Sin certificado configurado (ni VERIFACTU_CERT_PATH ni nombre en workspace).',
    };
  }

  if (hasPath) {
    try {
      if (!fs.existsSync(config.certificatePath)) {
        return {
          certificateStatus: 'invalid',
          detail: 'VERIFACTU_CERT_PATH no apunta a un archivo existente.',
        };
      }
      const stat = fs.statSync(config.certificatePath);
      if (!stat.isFile()) {
        return {
          certificateStatus: 'invalid',
          detail: 'VERIFACTU_CERT_PATH no es un archivo.',
        };
      }
    } catch {
      return {
        certificateStatus: 'invalid',
        detail: 'No se pudo comprobar VERIFACTU_CERT_PATH.',
      };
    }
  }

  return {
    certificateStatus: 'configured',
    detail: hasPath
      ? 'Ruta de certificado presente en servidor (sin validacion criptografica en Fase 2A).'
      : 'Referencia de certificado en workspace (sin ruta VERIFACTU_CERT_PATH).',
  };
}
