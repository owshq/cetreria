import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Document, WorkspaceBillingSettings } from '../types.js';
import { VERIFACTU_PROD_NOT_CONFIGURED_CODE } from '../verifactu.js';
import {
  ELECTRONIC_INVOICING_PROVIDER_ES_VERIFACTU,
  canApproveElectronicInvoicing,
  isElectronicInvoicingEnabledForWorkspace,
  isElectronicInvoicingProductionOperational,
  mapVerifactuStatusToElectronicInvoicingStatus,
  mapVerifactuSubmitToApprovalOutcome,
  normalizeElectronicInvoicingCountry,
  resolveElectronicInvoicingCountry,
  resolveElectronicInvoicingProviderForDocument,
} from '../electronicInvoicing.js';

const baseSettings: WorkspaceBillingSettings = {
  id: 'ws-1',
  workspaceId: 'ws-1',
  companyName: 'Empresa Test SL',
  email: '',
  address: '',
  city: '',
  postalCode: '',
  country: 'ES',
  state: '',
  defaultTaxRate: 21,
  documentFormats: {},
  verifactuEnabled: true,
  verifactuEnvironment: 'sandbox',
  issuerNif: 'B12345678',
};

const baseInvoice: Document = {
  id: 'doc-1',
  workspaceId: 'ws-1',
  type: 'invoice',
  number: 'F-2026-001',
  clientId: 'client-1',
  date: '2026-06-01',
  items: [{ name: 'Servicio', description: '', quantity: 1, price: 100 }],
  total: 121,
  status: 'draft',
  createdAt: '2026-06-01T00:00:00.000Z',
  pdfSource: 'generated',
  verifactuStatus: 'pendiente',
};

describe('electronicInvoicing gate (capa conceptual)', () => {
  it('workspace ES + Veri*Factu activo resuelve provider es_verifactu', () => {
    const resolution = resolveElectronicInvoicingProviderForDocument(baseInvoice, baseSettings);
    assert.equal(resolution.applicable, true);
    if (!resolution.applicable) return;

    assert.equal(resolution.provider.providerId, 'es_verifactu');
    assert.equal(resolution.provider.country, 'ES');
    assert.equal(resolution.provider.authority, 'AEAT');
    assert.equal(resolution.provider.environment, 'sandbox');
    assert.equal(resolution.provider.submissionMode, 'sandbox');
    assert.deepEqual(
      resolution.provider.providerId,
      ELECTRONIC_INVOICING_PROVIDER_ES_VERIFACTU.providerId,
    );
  });

  it('Veri*Factu desactivado no resuelve provider', () => {
    const settings = { ...baseSettings, verifactuEnabled: false };
    const resolution = resolveElectronicInvoicingProviderForDocument(baseInvoice, settings);
    assert.equal(resolution.applicable, false);
    if (resolution.applicable) return;

    assert.equal(resolution.providerId, 'none');
    assert.equal(resolution.reason, 'provider_disabled');
    assert.equal(isElectronicInvoicingEnabledForWorkspace(settings), false);
  });

  it('pais no soportado sin provider registrado devuelve none', () => {
    const settings = { ...baseSettings, country: 'IT', verifactuEnabled: true };
    const resolution = resolveElectronicInvoicingProviderForDocument(baseInvoice, settings);
    assert.equal(resolution.applicable, false);
    if (resolution.applicable) return;

    assert.equal(resolution.providerId, 'none');
    assert.equal(resolution.reason, 'unsupported_country');
  });

  it('pais Mexico sin provider devuelve none aunque toggle legacy este activo', () => {
    const settings = { ...baseSettings, country: 'MX', verifactuEnabled: true };
    const resolution = resolveElectronicInvoicingProviderForDocument(baseInvoice, settings);
    assert.equal(resolution.applicable, false);
    if (resolution.applicable) return;

    assert.equal(resolution.providerId, 'none');
    assert.equal(resolution.reason, 'unsupported_country');
  });

  it('albaran no admite provider fiscal', () => {
    const doc = { ...baseInvoice, type: 'delivery-note' as const };
    const resolution = resolveElectronicInvoicingProviderForDocument(doc, baseSettings);
    assert.equal(resolution.applicable, false);
    if (resolution.applicable) return;

    assert.equal(resolution.reason, 'document_type_not_supported');
  });

  it('pais vacio con Veri*Factu activo asume ES', () => {
    const settings = { ...baseSettings, country: '' };
    assert.equal(resolveElectronicInvoicingCountry(settings), 'ES');
    assert.equal(isElectronicInvoicingEnabledForWorkspace(settings), true);

    const resolution = resolveElectronicInvoicingProviderForDocument(baseInvoice, settings);
    assert.equal(resolution.applicable, true);
    if (!resolution.applicable) return;
    assert.equal(resolution.provider.providerId, 'es_verifactu');
  });

  it('produccion bloqueada sin flag explicito para es_verifactu', () => {
    const settings = {
      ...baseSettings,
      verifactuEnvironment: 'production' as const,
    };
    const resolution = resolveElectronicInvoicingProviderForDocument(baseInvoice, settings);
    assert.equal(resolution.applicable, true);
    if (!resolution.applicable) return;

    assert.equal(resolution.provider.environment, 'production');
    assert.equal(isElectronicInvoicingProductionOperational(resolution.provider), false);
    assert.equal(isElectronicInvoicingProductionOperational(resolution.provider, 'true'), true);
  });

  it('sandbox siempre operativo a nivel conceptual de produccion check', () => {
    const resolution = resolveElectronicInvoicingProviderForDocument(baseInvoice, baseSettings);
    assert.equal(resolution.applicable, true);
    if (!resolution.applicable) return;

    assert.equal(
      isElectronicInvoicingProductionOperational(resolution.provider),
      true,
    );
  });

  it('normalizeElectronicInvoicingCountry acepta alias y codigos ISO', () => {
    assert.equal(normalizeElectronicInvoicingCountry('es'), 'ES');
    assert.equal(normalizeElectronicInvoicingCountry('Espana'), 'ES');
    assert.equal(normalizeElectronicInvoicingCountry('spain'), 'ES');
    assert.equal(normalizeElectronicInvoicingCountry('IT'), 'IT');
    assert.equal(normalizeElectronicInvoicingCountry(''), null);
  });

  it('mapVerifactuStatusToElectronicInvoicingStatus proyecta estados legacy', () => {
    assert.equal(mapVerifactuStatusToElectronicInvoicingStatus('pendiente'), 'pending');
    assert.equal(mapVerifactuStatusToElectronicInvoicingStatus('aceptado'), 'accepted');
    assert.equal(mapVerifactuStatusToElectronicInvoicingStatus(undefined), 'not_applicable');
  });

  it('mapVerifactuSubmitToApprovalOutcome marca produccion sin flags como blocked', () => {
    assert.equal(
      mapVerifactuSubmitToApprovalOutcome({
        verifactuStatus: 'rechazado',
        verifactuErrorCode: VERIFACTU_PROD_NOT_CONFIGURED_CODE,
      }),
      'blocked',
    );
    assert.equal(
      mapVerifactuSubmitToApprovalOutcome({ verifactuStatus: 'aceptado' }),
      'accepted',
    );
  });

  it('canApproveElectronicInvoicing exige provider aplicable y estado enviable', () => {
    assert.equal(canApproveElectronicInvoicing(baseInvoice, baseSettings), true);
    assert.equal(
      canApproveElectronicInvoicing(baseInvoice, { ...baseSettings, verifactuEnabled: false }),
      false,
    );
  });
});
