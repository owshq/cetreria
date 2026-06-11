import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Document } from '../types.js';
import {
  detectInvoiceActivityDeliveryNotesMismatches,
  detectInvoiceDeliveryNoteMismatches,
  DELIVERY_NOTE_REQUIRED_BY_INVOICE_ERROR,
  formatInvoiceDeliveryNoteMismatchBanner,
  INVOICE_REQUIRES_DELIVERY_NOTE_ERROR,
  ACTIVITY_SINGLE_INVOICE_ERROR,
  listActivitiesWithInvoiceWithoutDeliveryNote,
  validateActivityInvoiceRequiresDeliveryNote,
  validateRemovingDeliveryNoteFromActivity,
  validateSingleActivityInvoice,
  getActivityInvoiceWithoutDeliveryNoteBanner,
  getInvoiceDeliveryNotesMismatchTooltip,
  resolveDeliveryNotesAggregateTotals,
  deliveryNotesHaveZeroPricedHourLines,
  ACTIVITY_INVOICE_ZERO_HOUR_PRICE_WARNING,
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

describe('validateSingleActivityInvoice', () => {
  it('permite una sola factura vinculada', () => {
    const documents = [baseDoc({ id: 'inv', type: 'invoice', activityId: 'act-1' })];
    assert.equal(validateSingleActivityInvoice(documents, 'act-1'), null);
  });

  it('bloquea vincular una segunda factura', () => {
    const documents = [
      baseDoc({ id: 'inv-1', type: 'invoice', number: 'F-001', activityId: 'act-1' }),
      baseDoc({ id: 'inv-2', type: 'invoice', number: 'F-002' }),
    ];
    assert.equal(
      validateSingleActivityInvoice(documents, 'act-1', ['inv-1', 'inv-2']),
      ACTIVITY_SINGLE_INVOICE_ERROR,
    );
  });

  it('permite sustituir factura al desvincular la anterior', () => {
    const documents = [
      baseDoc({ id: 'inv-1', type: 'invoice', number: 'F-001', activityId: 'act-1' }),
      baseDoc({ id: 'inv-2', type: 'invoice', number: 'F-002' }),
    ];
    assert.equal(validateSingleActivityInvoice(documents, 'act-1', ['inv-2']), null);
  });
});

describe('detectInvoiceActivityDeliveryNotesMismatches', () => {
  it('compara factura con la suma de varios albaranes', () => {
    const invoice = baseDoc({
      type: 'invoice',
      items: [
        { name: 'Servicio', description: 'Op A', quantity: 2, price: 50 },
        { name: 'Material', description: 'Tornillos', quantity: 1, price: 10 },
      ],
      subtotal: 110,
      taxRate: 21,
      taxAmount: 23.1,
      total: 133.1,
    });
    const deliveryNotes = [
      baseDoc({
        type: 'delivery-note',
        number: 'A-001',
        items: [{ name: 'Servicio', description: 'Op A', quantity: 2, price: 0 }],
      }),
      baseDoc({
        type: 'delivery-note',
        number: 'A-002',
        items: [{ name: 'Material', description: 'Tornillos', quantity: 1, price: 10 }],
      }),
    ];

    assert.deepEqual(detectInvoiceActivityDeliveryNotesMismatches(invoice, deliveryNotes), []);
  });
});

describe('getInvoiceDeliveryNotesMismatchTooltip', () => {
  it('devuelve tooltip cuando hay desfase', () => {
    const invoice = baseDoc({
      type: 'invoice',
      items: [{ name: 'Servicio', description: 'Op A', quantity: 1, price: 50 }],
      subtotal: 50,
      taxRate: 21,
      taxAmount: 10.5,
      total: 60.5,
    });
    const deliveryNotes = [
      baseDoc({
        type: 'delivery-note',
        number: 'A-001',
        items: [{ name: 'Servicio', description: 'Op A', quantity: 2, price: 0 }],
      }),
    ];
    const tooltip = getInvoiceDeliveryNotesMismatchTooltip(invoice, deliveryNotes);
    assert.ok(tooltip?.includes('no coincide'));
    assert.ok(tooltip?.includes('cantidades'));
  });

  it('no devuelve tooltip cuando coinciden', () => {
    const invoice = baseDoc({
      type: 'invoice',
      items: [{ name: 'Servicio', description: 'Op A', quantity: 2, price: 50 }],
      subtotal: 100,
      taxRate: 21,
      taxAmount: 21,
      total: 121,
    });
    const deliveryNotes = [
      baseDoc({
        type: 'delivery-note',
        number: 'A-001',
        items: [{ name: 'Servicio', description: 'Op A', quantity: 2, price: 0 }],
      }),
    ];
    assert.equal(getInvoiceDeliveryNotesMismatchTooltip(invoice, deliveryNotes), null);
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

describe('resolveDeliveryNotesAggregateTotals', () => {
  it('suma lineas y totales de varios albaranes', () => {
    const deliveryNotes = [
      baseDoc({
        type: 'delivery-note',
        number: 'A-001',
        taxRate: 21,
        items: [{ name: 'Servicio', description: 'Op A', quantity: 2, price: 50 }],
        subtotal: 100,
        taxAmount: 21,
        total: 121,
      }),
      baseDoc({
        id: 'dn-2',
        type: 'delivery-note',
        number: 'A-002',
        taxRate: 21,
        items: [{ name: 'Servicio', description: 'Op B', quantity: 1, price: 80 }],
        subtotal: 80,
        taxAmount: 16.8,
        total: 96.8,
      }),
    ];

    const aggregate = resolveDeliveryNotesAggregateTotals(deliveryNotes);
    assert.equal(aggregate.lineCount, 2);
    assert.equal(aggregate.subtotal, 180);
    assert.equal(aggregate.total, 217.8);
  });
});

describe('deliveryNotesHaveZeroPricedHourLines', () => {
  it('detecta lineas con cantidad y precio 0', () => {
    const deliveryNotes = [
      baseDoc({
        type: 'delivery-note',
        number: 'A-001',
        items: [{ name: 'Servicio', description: 'Op A', quantity: 2, price: 0 }],
      }),
    ];
    assert.equal(deliveryNotesHaveZeroPricedHourLines(deliveryNotes), true);
    assert.ok(ACTIVITY_INVOICE_ZERO_HOUR_PRICE_WARNING.length > 0);
  });

  it('no alerta si todas las lineas tienen precio', () => {
    const deliveryNotes = [
      baseDoc({
        type: 'delivery-note',
        number: 'A-001',
        items: [{ name: 'Servicio', description: 'Op A', quantity: 2, price: 50 }],
      }),
    ];
    assert.equal(deliveryNotesHaveZeroPricedHourLines(deliveryNotes), false);
  });
});
