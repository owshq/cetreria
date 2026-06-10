import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { resolveEsVerifactuConfig } from './esVerifactuConfig.js';
import { getEsVerifactuCertificateHealth } from './esVerifactuCertificateHealth.js';

const baseSettings = {
  id: 'ws-1',
  workspaceId: 'ws-1',
  companyName: 'Test SL',
  email: '',
  address: '',
  city: '',
  postalCode: '',
  country: 'ES',
  state: '',
  defaultTaxRate: 21,
  documentFormats: {},
  verifactuEnabled: true,
  verifactuEnvironment: 'sandbox' as const,
  issuerNif: 'B12345678',
};

describe('getEsVerifactuCertificateHealth (Fase 2A)', () => {
  let tempDir: string;

  after(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('sin certificado devuelve missing', () => {
    const config = resolveEsVerifactuConfig(baseSettings, {});
    const health = getEsVerifactuCertificateHealth(config);
    assert.equal(health.certificateStatus, 'missing');
  });

  it('con ruta inexistente devuelve invalid', () => {
    const config = resolveEsVerifactuConfig(baseSettings, {
      VERIFACTU_CERT_PATH: '/no/existe/certificado.p12',
    });
    const health = getEsVerifactuCertificateHealth(config);
    assert.equal(health.certificateStatus, 'invalid');
  });

  it('con archivo existente devuelve configured', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-einv-cert-'));
    const certPath = path.join(tempDir, 'cert.pem');
    fs.writeFileSync(certPath, 'dummy-cert');

    const config = resolveEsVerifactuConfig(baseSettings, {
      VERIFACTU_CERT_PATH: certPath,
    });
    const health = getEsVerifactuCertificateHealth(config);
    assert.equal(health.certificateStatus, 'configured');
  });
});
