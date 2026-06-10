import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Client, Document, WorkspaceBillingSettings } from '../types.js';
import {
  VERIFACTU_PROD_NOT_CONFIGURED_CODE,
  VERIFACTU_PRODUCTION_UNAVAILABLE_MESSAGE,
  buildVerifactuCsv,
  buildVerifactuQrUrl,
  buildVerifactuRecordHash,
  canSubmitVerifactu,
  isValidSpanishNif,
  isVerifactuLocked,
  isVerifactuProductionOperational,
  normalizeIssuerNif,
  validateVerifactuSubmit,
} from '../verifactu.js';

const baseSettings: WorkspaceBillingSettings = {
  id: 'ws-1',
  workspaceId: 'ws-1',
  companyName: 'Empresa Test SL',
  email: '',
  address: '',
  city: '',
  postalCode: '',
  country: '',
  state: '',
  defaultTaxRate: 21,
  documentFormats: {},
  verifactuEnabled: true,
  verifactuEnvironment: 'sandbox',
  issuerNif: 'B12345678',
};

const baseClient: Client = {
  id: 'client-1',
  workspaceId: 'ws-1',
  groupId: 'group-1',
  name: 'Cliente',
  email: 'c@test.local',
  phone: '',
  address: '',
  city: '',
  postalCode: '',
  country: '',
  state: '',
  website: '',
  technicalInfo: '',
  observations: [],
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  customFields: { NIF: '12345678Z' },
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

describe('verifactu shared helpers', () => {
  it('normalizeIssuerNif elimina espacios y guiones', () => {
    assert.equal(normalizeIssuerNif(' b-12345678 '), 'B12345678');
  });

  it('isValidSpanishNif valida formato NIF/CIF emisor', () => {
    assert.equal(isValidSpanishNif('B12345678'), true);
    assert.equal(isValidSpanishNif('b-12345678'), true);
    assert.equal(isValidSpanishNif(''), false);
    assert.equal(isValidSpanishNif('INVALID'), false);
    assert.equal(isValidSpanishNif('123'), false);
  });

  it('buildVerifactuQrUrl incluye parametros AEAT esperados', () => {
    const url = buildVerifactuQrUrl({
      issuerNif: 'B12345678',
      invoiceNumber: 'F-2026/001',
      date: '2026-06-01',
      total: 121.5,
    });

    assert.match(url, /^https:\/\/www2\.agenciatributaria\.gob\.es\/wlpl\/TIKE-CONT\/ValidarQR\?/);
    assert.match(url, /nif=B12345678/);
    assert.match(url, /numserie=F-2026%2F001/);
    assert.match(url, /fecha=01-06-2026/);
    assert.match(url, /importe=121\.50/);
  });

  it('buildVerifactuRecordHash es determinista para el mismo input', () => {
    const input = {
      issuerNif: 'B12345678',
      invoiceNumber: 'F-1',
      date: '2026-06-01',
      total: 121,
      invoiceKind: 'ordinaria' as const,
      previousHash: 'abc',
    };
    const first = buildVerifactuRecordHash(input);
    const second = buildVerifactuRecordHash(input);

    assert.equal(first, second);
    assert.match(first, /^[0-9a-f]{64}$/);
  });

  it('buildVerifactuRecordHash cambia si cambia el input', () => {
    const base = {
      issuerNif: 'B12345678',
      invoiceNumber: 'F-1',
      date: '2026-06-01',
      total: 121,
      invoiceKind: 'ordinaria' as const,
    };
    const withPrevious = buildVerifactuRecordHash({ ...base, previousHash: 'prev' });
    const withoutPrevious = buildVerifactuRecordHash(base);
    assert.notEqual(withPrevious, withoutPrevious);
  });

  it('buildVerifactuCsv deriva CSV estable desde la huella', () => {
    const hash = buildVerifactuRecordHash({
      issuerNif: 'B12345678',
      invoiceNumber: 'F-1',
      date: '2026-06-01',
      total: 121,
      invoiceKind: 'ordinaria',
    });
    const csv = buildVerifactuCsv(hash);
    const csvAgain = buildVerifactuCsv(hash);

    assert.equal(csv, csvAgain);
    assert.match(csv, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it('isVerifactuLocked bloquea aceptado y anulado', () => {
    assert.equal(isVerifactuLocked({ verifactuStatus: 'aceptado' }), true);
    assert.equal(isVerifactuLocked({ verifactuStatus: 'anulado' }), true);
    assert.equal(isVerifactuLocked({ verifactuStatus: 'pendiente' }), false);
    assert.equal(isVerifactuLocked({ verifactuStatus: 'rechazado' }), false);
  });

  it('canSubmitVerifactu rechaza subidas manuales sin PDF generado por la app', () => {
    assert.equal(
      canSubmitVerifactu(
        { type: 'invoice', verifactuStatus: 'pendiente', pdfSource: 'uploaded' },
        baseSettings,
      ),
      false,
    );
    assert.equal(
      canSubmitVerifactu(
        { type: 'invoice', verifactuStatus: 'pendiente', pdfSource: 'generated' },
        baseSettings,
      ),
      true,
    );
  });

  it('validateVerifactuSubmit rechaza factura subida manualmente', () => {
    const result = validateVerifactuSubmit(
      { ...baseInvoice, pdfSource: 'uploaded' },
      baseClient,
      baseSettings,
    );
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((item) => /subido manualmente/i.test(item)));
  });

  it('validateVerifactuSubmit rechaza factura ya aceptada', () => {
    const result = validateVerifactuSubmit(
      { ...baseInvoice, verifactuStatus: 'aceptado' },
      baseClient,
      baseSettings,
    );
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((item) => /pendiente o rechazado/i.test(item)));
  });
});

describe('verifactu sandbox / produccion flags', () => {
  it('produccion no operativa sin flag explicito', () => {
    assert.equal(isVerifactuProductionOperational(undefined), false);
    assert.equal(isVerifactuProductionOperational(null), false);
    assert.equal(isVerifactuProductionOperational(false), false);
    assert.equal(isVerifactuProductionOperational(''), false);
    assert.equal(isVerifactuProductionOperational('false'), false);
    assert.equal(isVerifactuProductionOperational('0'), false);
  });

  it('produccion operativa solo con flag truthy reconocido', () => {
    assert.equal(isVerifactuProductionOperational(true), true);
    assert.equal(isVerifactuProductionOperational('true'), true);
    assert.equal(isVerifactuProductionOperational('TRUE'), true);
    assert.equal(isVerifactuProductionOperational('1'), true);
    assert.equal(isVerifactuProductionOperational('yes'), true);
  });

  it('expone codigo y mensaje de rechazo PROD_NOT_CONFIGURED', () => {
    assert.equal(VERIFACTU_PROD_NOT_CONFIGURED_CODE, 'PROD_NOT_CONFIGURED');
    assert.match(VERIFACTU_PRODUCTION_UNAVAILABLE_MESSAGE, /certificado digital/i);
    assert.match(VERIFACTU_PRODUCTION_UNAVAILABLE_MESSAGE, /integracion AEAT/i);
  });
});
