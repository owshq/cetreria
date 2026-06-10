import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Client, Document, WorkspaceBillingSettings } from '@shared/types';
import { defaultWorkspaceDocumentFormats } from '@shared/types';
import {
  VERIFACTU_CANONICAL_PAYLOAD_SCHEMA,
  buildVerifactuCanonicalPayload,
} from './verifactuPayload.js';
import {
  buildSha256Hash,
  canonicalizePayloadForHash,
  isSha256Hex,
} from './verifactuHash.js';

const WORKSPACE_ID = 'ws-aeat-golden-0001';
const DOCUMENT_ID = 'doc-aeat-golden-0001';
const CLIENT_ID = 'client-aeat-golden-0001';

const goldenClient: Client = {
  id: CLIENT_ID,
  workspaceId: WORKSPACE_ID,
  groupId: 'group-aeat-golden',
  name: 'Cliente Golden AEAT',
  email: 'golden@test.local',
  phone: '',
  address: 'Calle Golden 1',
  city: 'Madrid',
  postalCode: '28001',
  country: 'Espana',
  state: '',
  website: '',
  technicalInfo: '',
  observations: [],
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  customFields: { NIF: '12345678Z' },
};

const goldenDocument: Document = {
  id: DOCUMENT_ID,
  workspaceId: WORKSPACE_ID,
  type: 'invoice',
  number: 'VF-GOLDEN-2026-001',
  clientId: CLIENT_ID,
  date: '2026-06-10',
  items: [
    {
      name: 'Servicio',
      description: 'Linea golden',
      quantity: 1,
      price: 100,
    },
  ],
  subtotal: 100,
  taxRate: 21,
  taxAmount: 21,
  total: 121,
  status: 'draft',
  createdAt: '2026-06-10T08:00:00.000Z',
  invoiceKind: 'ordinaria',
  pdfSource: 'generated',
  verifactuStatus: 'pendiente',
};

const goldenSettings: WorkspaceBillingSettings = {
  id: WORKSPACE_ID,
  workspaceId: WORKSPACE_ID,
  companyName: 'Empresa Golden SL',
  email: 'empresa@test.local',
  address: '',
  city: '',
  postalCode: '',
  country: '',
  state: '',
  defaultTaxRate: 21,
  documentFormats: defaultWorkspaceDocumentFormats(),
  verifactuEnabled: true,
  verifactuEnvironment: 'sandbox',
  issuerNif: 'B12345678',
  verifactuSoftwareName: 'CRM Cetreria',
  verifactuSoftwareId: 'SW-GOLDEN-001',
  verifactuSoftwareVersion: '0.1.0',
};

const GOLDEN_CANONICAL_JSON =
  '{"documentId":"doc-aeat-golden-0001","invoiceDate":"2026-06-10","invoiceKindCode":"F1","invoiceNumber":"VF-GOLDEN-2026-001","issuerName":"Empresa Golden SL","issuerNif":"B12345678","previousRecordHash":"","recipientNif":"12345678Z","rectifiesDocumentId":"","schemaVersion":"1.0-draft","softwareId":"SW-GOLDEN-001","softwareName":"CRM Cetreria","softwareVersion":"0.1.0","subtotal":"100.00","taxAmount":"21.00","taxRate":"21.00","total":"121.00","workspaceId":"ws-aeat-golden-0001"}';

const GOLDEN_SHA256 = '90be32071ef7c642edb58b1cccf1fdb387f0ca2812b4c9dbfb9b31b66687d762';

describe('Verifactu AEAT core Fase 1', () => {
  it('buildVerifactuCanonicalPayload devuelve objeto estable con schema draft', () => {
    const payload = buildVerifactuCanonicalPayload({
      document: goldenDocument,
      client: goldenClient,
      settings: goldenSettings,
    });

    assert.equal(payload.schemaVersion, VERIFACTU_CANONICAL_PAYLOAD_SCHEMA);
    assert.equal(payload.invoiceKindCode, 'F1');
    assert.equal(payload.issuerNif, 'B12345678');
    assert.equal(payload.recipientNif, '12345678Z');
    assert.equal(payload.subtotal, '100.00');
    assert.equal(payload.total, '121.00');
    assert.equal(payload.previousRecordHash, '');
  });

  it('canonicalizePayloadForHash es determinista (golden)', () => {
    const payload = buildVerifactuCanonicalPayload({
      document: goldenDocument,
      client: goldenClient,
      settings: goldenSettings,
    });

    const first = canonicalizePayloadForHash(payload);
    const second = canonicalizePayloadForHash(payload);

    assert.equal(first, second);
    assert.equal(first, GOLDEN_CANONICAL_JSON);
  });

  it('buildSha256Hash devuelve 64 hex y coincide con golden', () => {
    const payload = buildVerifactuCanonicalPayload({
      document: goldenDocument,
      client: goldenClient,
      settings: goldenSettings,
    });
    const hash = buildSha256Hash(payload);

    assert.equal(hash.length, 64);
    assert.ok(isSha256Hex(hash));
    assert.equal(hash, GOLDEN_SHA256);
  });

  it('cambios en numero, fecha, importe o NIF alteran el hash', () => {
    const base = buildVerifactuCanonicalPayload({
      document: goldenDocument,
      client: goldenClient,
      settings: goldenSettings,
    });
    const baseHash = buildSha256Hash(base);

    const numberChanged = buildSha256Hash({
      ...base,
      invoiceNumber: 'VF-GOLDEN-2026-002',
    });
    const dateChanged = buildSha256Hash({
      ...base,
      invoiceDate: '2026-06-11',
    });
    const totalChanged = buildSha256Hash({
      ...base,
      total: '122.00',
    });
    const issuerChanged = buildSha256Hash({
      ...base,
      issuerNif: 'B87654321',
    });

    assert.notEqual(numberChanged, baseHash);
    assert.notEqual(dateChanged, baseHash);
    assert.notEqual(totalChanged, baseHash);
    assert.notEqual(issuerChanged, baseHash);
  });

  it('previousRecordHash participa en el encadenamiento', () => {
    const withoutChain = buildVerifactuCanonicalPayload({
      document: goldenDocument,
      client: goldenClient,
      settings: goldenSettings,
    });
    const withChain = buildVerifactuCanonicalPayload({
      document: goldenDocument,
      client: goldenClient,
      settings: goldenSettings,
      previousRecordHash: 'b'.repeat(64),
    });

    const hashWithout = buildSha256Hash(withoutChain);
    const hashWith = buildSha256Hash(withChain);

    assert.notEqual(hashWithout, hashWith);
    assert.match(withChain.previousRecordHash, /^[0-9a-f]{64}$/);
  });
});
