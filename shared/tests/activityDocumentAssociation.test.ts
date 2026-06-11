import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Activity, Document } from '../types.js';
import {
  aggregateInvoiceConcepts,
  deliveryNoteConceptsForActivities,
  documentsLinkedToActivities,
  invoiceConceptsForActivities,
} from '../documentConcepts.js';
import { documentsIssuedInPeriod } from '../reportAnalytics.js';

const activity = (patch: Partial<Activity>): Activity => ({
  id: patch.id ?? 'act-1',
  workspaceId: 'ws-1',
  clientId: patch.clientId ?? 'client-1',
  type: patch.type ?? 'visit',
  date: patch.date ?? '2026-06-01',
  hours: patch.hours ?? 2,
  createdAt: patch.createdAt ?? '2026-06-01T08:00:00.000Z',
  ...patch,
});

const document = (patch: Partial<Document>): Document => ({
  id: patch.id ?? 'doc-1',
  workspaceId: 'ws-1',
  type: patch.type ?? 'invoice',
  number: patch.number ?? 'F-001',
  clientId: patch.clientId ?? 'client-1',
  date: patch.date ?? '2026-06-01',
  items: patch.items ?? [{ name: 'Mantenimiento', quantity: 1, price: 100 }],
  total: patch.total ?? 121,
  status: 'paid',
  createdAt: '2026-06-01T10:00:00.000Z',
  ...patch,
});

describe('documentsLinkedToActivities', () => {
  it('incluye documentos vinculados aunque document.date quede fuera del periodo', () => {
    const activities = [activity({ id: 'act-1', date: '2026-06-05' })];
    const documents = [
      document({
        id: 'inv-1',
        type: 'invoice',
        activityId: 'act-1',
        date: '2026-07-01',
      }),
      document({
        id: 'dn-1',
        type: 'delivery-note',
        number: 'A-001',
        activityId: 'act-1',
        date: '2026-07-02',
      }),
      document({
        id: 'inv-2',
        type: 'invoice',
        activityId: 'act-2',
        date: '2026-06-05',
      }),
    ];

    const linked = documentsLinkedToActivities(documents, activities, 'all');
    assert.deepEqual(
      linked.map((doc) => doc.id).sort(),
      ['dn-1', 'inv-1'],
    );
  });
});

describe('invoiceConceptsForActivities', () => {
  it('agrupa conceptos de facturas vinculadas sin filtrar por document.date', () => {
    const activities = [activity({ id: 'act-1', date: '2026-06-05' })];
    const documents = [
      document({
        id: 'inv-1',
        type: 'invoice',
        activityId: 'act-1',
        date: '2026-08-01',
        items: [{ name: 'Revision', quantity: 2, price: 50 }],
      }),
    ];

    const concepts = invoiceConceptsForActivities(documents, activities, 'all');
    assert.equal(concepts.length, 1);
    assert.equal(concepts[0]?.description, 'Revision');
    assert.equal(concepts[0]?.totalQuantity, 2);
  });
});

describe('deliveryNoteConceptsForActivities', () => {
  it('agrupa conceptos pendientes de albaranes vinculados sin filtrar por document.date', () => {
    const activities = [activity({ id: 'act-1', date: '2026-06-05' })];
    const documents = [
      document({
        id: 'dn-1',
        type: 'delivery-note',
        number: 'A-010',
        activityId: 'act-1',
        date: '2026-09-01',
        items: [{ name: 'Trabajo pendiente', quantity: 1, price: 80 }],
      }),
    ];

    const concepts = deliveryNoteConceptsForActivities(documents, activities, 'all');
    assert.equal(concepts.length, 1);
    assert.equal(concepts[0]?.description, 'Trabajo pendiente');
  });
});

describe('aggregateInvoiceConcepts (financiero)', () => {
  it('sigue filtrando por document.date para informes financieros', () => {
    const activities = [activity({ id: 'act-1', date: '2026-06-05' })];
    const documents = [
      document({
        id: 'inv-linked',
        type: 'invoice',
        activityId: 'act-1',
        date: '2026-08-01',
        items: [{ name: 'Vinculada fuera de periodo', quantity: 1, price: 100 }],
      }),
      document({
        id: 'inv-period',
        type: 'invoice',
        date: '2026-06-10',
        items: [{ name: 'Emitida en periodo', quantity: 1, price: 200 }],
      }),
    ];

    const financialConcepts = aggregateInvoiceConcepts(documents, '2026-06-01', '2026-06-30', 'all');
    assert.equal(financialConcepts.length, 1);
    assert.equal(financialConcepts[0]?.description, 'Emitida en periodo');

    const activityConcepts = invoiceConceptsForActivities(documents, activities, 'all');
    assert.equal(activityConcepts.length, 1);
    assert.equal(activityConcepts[0]?.description, 'Vinculada fuera de periodo');
  });
});

describe('documentsIssuedInPeriod', () => {
  it('filtra solo documentos emitidos dentro del periodo', () => {
    const documents = [
      document({ id: 'in', date: '2026-06-15' }),
      document({ id: 'out', date: '2026-07-01' }),
    ];

    const issued = documentsIssuedInPeriod(documents, '2026-06-01', '2026-06-30', 'all');
    assert.deepEqual(
      issued.map((doc) => doc.id),
      ['in'],
    );
  });
});
