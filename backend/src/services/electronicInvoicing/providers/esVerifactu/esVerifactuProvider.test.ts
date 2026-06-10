import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { WorkspaceBillingSettings } from '@shared/types';
import { defaultWorkspaceDocumentFormats } from '@shared/types';
import { getElectronicInvoicingProvider } from '../../providerRegistry.js';
import { esVerifactuProvider } from './esVerifactuProvider.js';

describe('esVerifactuProvider (Fase 2A)', { concurrency: false }, () => {
  let tempDir: string;
  let dbPath: string;
  let resetDb: () => void;
  let initDb: () => Promise<void>;
  let VERIFACTU_PENDING_INVOICE_ID: string;
  let VERIFACTU_WORKSPACE_ID: string;
  let seedVerifactuSmokeScenario: typeof import('../../../../test/verifactuSmokeFixture.js').seedVerifactuSmokeScenario;
  let verifactuSandboxScenario: typeof import('../../../../test/verifactuSmokeFixture.js').verifactuSandboxScenario;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-einv-provider-'));
    dbPath = path.join(tempDir, 'db.json');
    process.env.DB_PATH = dbPath;
    process.env.DOCUMENT_STORAGE_DIR = path.join(tempDir, 'document-pdfs');
    delete process.env.VERIFACTU_PRODUCTION_ENABLED;

    const fixtureMod = await import('../../../../test/verifactuSmokeFixture.js');
    VERIFACTU_PENDING_INVOICE_ID = fixtureMod.VERIFACTU_PENDING_INVOICE_ID;
    VERIFACTU_WORKSPACE_ID = fixtureMod.VERIFACTU_WORKSPACE_ID;
    seedVerifactuSmokeScenario = fixtureMod.seedVerifactuSmokeScenario;
    verifactuSandboxScenario = fixtureMod.verifactuSandboxScenario;

    const dbMod = await import('../../../../db/store.js');
    resetDb = dbMod.resetDbInstanceForTests;
    initDb = dbMod.initJsonDb;
  });

  beforeEach(async () => {
    resetDb();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    await initDb();
    await seedVerifactuSmokeScenario(verifactuSandboxScenario);
  });

  after(() => {
    resetDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('provider es_verifactu existe en registry', () => {
    const provider = getElectronicInvoicingProvider('es_verifactu');
    assert.ok(provider);
    assert.equal(provider!.getProviderId(), 'es_verifactu');
    assert.equal(provider, esVerifactuProvider);
  });

  it('getCertificateHealth sin certificado devuelve missing y productionReady false', () => {
    const settings: WorkspaceBillingSettings = {
      id: VERIFACTU_WORKSPACE_ID,
      workspaceId: VERIFACTU_WORKSPACE_ID,
      companyName: 'Empresa Verifactu SL',
      email: '',
      address: '',
      city: '',
      postalCode: '',
      country: 'ES',
      state: '',
      defaultTaxRate: 21,
      documentFormats: defaultWorkspaceDocumentFormats(),
      verifactuEnabled: true,
      verifactuEnvironment: 'sandbox',
      issuerNif: 'B12345678',
    };

    const health = esVerifactuProvider.getCertificateHealth(settings);
    assert.equal(health.providerId, 'es_verifactu');
    assert.equal(health.country, 'ES');
    assert.equal(health.authority, 'AEAT');
    assert.equal(health.mode, 'sandbox');
    assert.equal(health.certificateStatus, 'missing');
    assert.equal(health.productionReady, false);
  });

  it('productionReady siempre false en Fase 2A aunque haya certificado', () => {
    const certPath = path.join(tempDir, 'configured.pem');
    fs.writeFileSync(certPath, 'dummy');
    const prev = process.env.VERIFACTU_CERT_PATH;
    process.env.VERIFACTU_CERT_PATH = certPath;

    const settings: WorkspaceBillingSettings = {
      id: VERIFACTU_WORKSPACE_ID,
      workspaceId: VERIFACTU_WORKSPACE_ID,
      companyName: 'Empresa Verifactu SL',
      email: '',
      address: '',
      city: '',
      postalCode: '',
      country: 'ES',
      state: '',
      defaultTaxRate: 21,
      documentFormats: defaultWorkspaceDocumentFormats(),
      verifactuEnabled: true,
      verifactuEnvironment: 'production',
      issuerNif: 'B12345678',
      verifactuCertificateFileName: 'cert.pem',
    };

    const health = esVerifactuProvider.getCertificateHealth(settings);
    assert.equal(health.certificateStatus, 'configured');
    assert.equal(health.productionReady, false);

    if (prev === undefined) {
      delete process.env.VERIFACTU_CERT_PATH;
    } else {
      process.env.VERIFACTU_CERT_PATH = prev;
    }
  });

  it('validateConfiguration bloquea produccion sin flag operativo', () => {
    const settings: WorkspaceBillingSettings = {
      id: VERIFACTU_WORKSPACE_ID,
      workspaceId: VERIFACTU_WORKSPACE_ID,
      companyName: 'Empresa Verifactu SL',
      email: '',
      address: '',
      city: '',
      postalCode: '',
      country: 'ES',
      state: '',
      defaultTaxRate: 21,
      documentFormats: defaultWorkspaceDocumentFormats(),
      verifactuEnabled: true,
      verifactuEnvironment: 'production',
      issuerNif: 'B12345678',
    };

    const result = esVerifactuProvider.validateConfiguration(settings);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /produccion/i.test(e)));
  });

  it('approveDocument delega en sandbox actual y acepta factura pendiente', async () => {
    const { getByIdInWorkspace } = await import('../../../../db/repository.js');
    const { DB_NAMES } = await import('../../../../config.js');
    const { getWorkspaceBillingSettings } = await import('../../../workspaceBillingSettings.js');

    const document = await getByIdInWorkspace(
      DB_NAMES.documents,
      VERIFACTU_PENDING_INVOICE_ID,
      VERIFACTU_WORKSPACE_ID,
    );
    const client = await getByIdInWorkspace(
      DB_NAMES.clients,
      document!.clientId,
      VERIFACTU_WORKSPACE_ID,
    );
    const settings = await getWorkspaceBillingSettings(VERIFACTU_WORKSPACE_ID);

    const result = await esVerifactuProvider.approveDocument({
      workspaceId: VERIFACTU_WORKSPACE_ID,
      document: document!,
      client: client!,
      settings,
    });

    assert.equal(result.outcome, 'accepted');
    assert.equal(result.providerId, 'es_verifactu');
    assert.equal(result.document.verifactuStatus, 'aceptado');
    assert.ok(result.document.verifactuHash);
    assert.ok(result.document.verifactuCsv);
  });
});
