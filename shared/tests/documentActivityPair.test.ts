import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Document } from '../types.js';
import {
  detectInvoiceDeliveryNoteMismatches,
  DELIVERY_NOTE_REQUIRED_BY_INVOICE_ERROR,
  formatInvoiceDeliveryNoteMismatchBanner,
  INVOICE_REQUIRES_DELIVERY_NOTE_ERROR,
  listActivitiesWithInvoiceWithoutDeliveryNote,
  validateActivityInvoiceRequiresDeliveryNote,
  validateRemovingDeliveryNoteFromActivity,
  getActivityInvoiceWithoutDeliveryNoteBanner,
} from '../documentActivityPair.js';

const baseDoc = (patch: Partial<Document>): Document => ({
  id: patch.id ?? 'doc-1',
  workspaceId: 'ws-1',
  type: patch.type ?? 'invoice',
  number: patch.number ?? 'F-001',
  clientId: 'client-1',
  date: '2026-01-10',
  items: patch.items ?? [],
  total: patch.total ?? 0,
  status: 'draft',
  createdAt: '2026-01-10T10:00:00.000Z',
  ...patch,
});

describe('validateActivityInvoiceRequiresDeliveryNote', () => {
  it('permite factura si hay albaran vinculado', () => {
    const documents = [
      baseDoc({ id: 'inv', type: 'invoice', activityId: 'act-1' }),
      baseDoc({ id: 'dn', type: 'delivery-note', number: 'A-001', activityId: 'act-1' }),
    ];
    assert.equal(
      validateActivityInvoiceRequiresDeliveryNote(documents, 'act-1'),
      null,
    );
  });

  it('bloquea factura sin albaran', () => {
    const documents = [baseDoc({ id: 'inv', type: 'invoice', activityId: 'act-1' })];
    assert.equal(
      validateActivityInvoiceRequiresDeliveryNote(documents, 'act-1'),
      INVOICE_REQUIRES_DELIVERY_NOTE_ERROR,
    );
    assert.equal(
      validateActivityInvoiceRequiresDeliveryNote([], 'act-1', undefined, {
        includesInvoice: true,
      }),
      INVOICE_REQUIRES_DELIVERY_NOTE_ERROR,
    );
  });

  it('permite seleccionar factura y albaran a la vez', () => {
    const documents = [
      baseDoc({ id: 'inv', type: 'invoice' }),
      baseDoc({ id: 'dn', type: 'delivery-note', number: 'A-001' }),
    ];
    assert.equal(
      validateActivityInvoiceRequiresDeliveryNote(documents, 'act-1', ['inv', 'dn']),
      null,
    );
  });
});

describe('validateRemovingDeliveryNoteFromActivity', () => {
  it('bloquea desvincular el unico albaran si hay factura', () => {
    const documents = [
      baseDoc({ id: 'inv', type: 'invoice', activityId: 'act-1' }),
      baseDoc({ id: 'dn', type: 'delivery-note', number: 'A-001', activityId: 'act-1' }),
    ];
    assert.equal(
      validateRemovingDeliveryNoteFromActivity(documents, 'act-1', 'dn'),
      DELIVERY_NOTE_REQUIRED_BY_INVOICE_ERROR,
    );
  });

  it('permite desvincular un albaran si queda otro en la actividad', () => {
    const documents = [
      baseDoc({ id: 'inv', type: 'invoice', activityId: 'act-1' }),
      baseDoc({ id: 'dn-1', type: 'delivery-note', number: 'A-001', activityId: 'act-1' }),
      baseDoc({ id: 'dn-2', type: 'delivery-note', number: 'A-002', activityId: 'act-1' }),
    ];
    assert.equal(validateRemovingDeliveryNoteFromActivity(documents, 'act-1', 'dn-1'), null);
  });

  it('permite desvincular albaran si no hay factura', () => {
    const documents = [
      baseDoc({ id: 'dn', type: 'delivery-note', number: 'A-001', activityId: 'act-1' }),
    ];
    assert.equal(validateRemovingDeliveryNoteFromActivity(documents, 'act-1', 'dn'), null);
  });
});

describe('getActivityInvoiceWithoutDeliveryNoteBanner', () => {
  it('detecta factura sin albaran vinculado', () => {
    const documents = [baseDoc({ id: 'inv', type: 'invoice', activityId: 'act-1' })];
    assert.ok(getActivityInvoiceWithoutDeliveryNoteBanner(documents, 'act-1'));
  });

  it('no muestra banner cuando el par es valido', () => {
    const documents = [
      baseDoc({ id: 'inv', type: 'invoice', activityId: 'act-1' }),
      baseDoc({ id: 'dn', type: 'delivery-note', number: 'A-001', activityId: 'act-1' }),
    ];
    assert.equal(getActivityInvoiceWithoutDeliveryNoteBanner(documents, 'act-1'), null);
  });
});

describe('listActivitiesWithInvoiceWithoutDeliveryNote', () => {
  it('lista actividades con factura y sin albaran', () => {
    const documents = [
      baseDoc({ id: 'inv-1', type: 'invoice', number: 'F-001', activityId: 'act-1' }),
      baseDoc({ id: 'inv-2', type: 'invoice', number: 'F-002', activityId: 'act-2' }),
      baseDoc({ id: 'dn-1', type: 'delivery-note', number: 'A-001', activityId: 'act-2' }),
    ];
    const violations = listActivitiesWithInvoiceWithoutDeliveryNote(documents);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.activityId, 'act-1');
    assert.equal(violations[0]?.invoices.length, 1);
  });
});

describe('detectInvoiceDeliveryNoteMismatches', () => {
  it('detecta diferencias de cantidad', () => {
    const invoice = baseDoc({
      type: 'invoice',
      items: [{ name: 'Servicio', description: 'Op A', quantity: 2, price: 50 }],
      subtotal: 100,
      taxRate: 21,
      taxAmount: 21,
      total: 121,
    });
    const deliveryNote = baseDoc({
      type: 'delivery-note',
      number: 'A-001',
      items: [{ name: 'Servicio', description: 'Op A', quantity: 1, price: 0 }],
      total: 0,
    });

    const mismatches = detectInvoiceDeliveryNoteMismatches(invoice, deliveryNote);
    assert.ok(mismatches.some((item) => item.code === 'quantities'));
    assert.ok(formatInvoiceDeliveryNoteMismatchBanner(invoice, deliveryNote));
  });

  it('no marca incoherencias cuando coinciden cantidades', () => {
    const invoice = baseDoc({
      type: 'invoice',
      items: [{ name: 'Servicio', description: 'Op A', quantity: 2, price: 50 }],
      subtotal: 100,
      taxRate: 21,
      taxAmount: 21,
      total: 121,
    });
    const deliveryNote = baseDoc({
      type: 'delivery-note',
      number: 'A-001',
      items: [{ name: 'Servicio', description: 'Op A', quantity: 2, price: 0 }],
      total: 0,
    });

    assert.deepEqual(detectInvoiceDeliveryNoteMismatches(invoice, deliveryNote), []);
    assert.equal(formatInvoiceDeliveryNoteMismatchBanner(invoice, deliveryNote), null);
  });
});
