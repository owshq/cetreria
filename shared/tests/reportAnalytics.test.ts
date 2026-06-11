import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  countDocumentsByType,
  documentTypeMetricsForRange,
} from '../reportAnalytics.js';
import type { Document } from '../types.js';

function doc(type: Document['type'], id: string, clientId = 'client-1'): Document {
  return {
    id,
    workspaceId: 'ws-1',
    clientId,
    type,
    status: 'draft',
    date: '2026-01-15',
    number: id,
    items: [],
    total: 0,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
  };
}

describe('document type metrics', () => {
  it('separa albaranes y facturas', () => {
    const documents = [
      doc('delivery-note', 'dn-1'),
      doc('delivery-note', 'dn-2'),
      doc('invoice', 'inv-1'),
    ];

    assert.deepEqual(countDocumentsByType(documents), {
      deliveryNoteCount: 2,
      invoiceCount: 1,
    });
  });

  it('filtra por periodo y cliente', () => {
    const documents = [
      doc('delivery-note', 'dn-1', 'client-1'),
      doc('invoice', 'inv-1', 'client-2'),
      {
        ...doc('invoice', 'inv-old', 'client-1'),
        date: '2025-12-01',
      },
    ];

    assert.deepEqual(
      documentTypeMetricsForRange(documents, '2026-01-01', '2026-01-31', 'client-1'),
      {
        deliveryNoteCount: 1,
        invoiceCount: 0,
      },
    );
  });
});
