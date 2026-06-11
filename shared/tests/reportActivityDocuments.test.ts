import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Activity, Document } from '../types.js';
import {
  deliveryNotesForActivities,
  documentsLinkedToActivities,
} from '../documentConcepts.js';

function baseActivity(id: string): Activity {
  return {
    id,
    workspaceId: 'ws-1',
    clientId: 'client-1',
    userId: 'user-1',
    date: '2026-01-10',
    type: 'at-1',
    description: 'Trabajo',
    hours: 2,
    attachments: [],
    createdAt: '2026-01-10T08:00:00.000Z',
  };
}

function baseDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    workspaceId: 'ws-1',
    type: 'delivery-note',
    number: 'A-001',
    clientId: 'client-1',
    activityId: 'act-1',
    date: '2026-02-15',
    items: [],
    total: 100,
    status: 'sent',
    createdAt: '2026-02-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('documentsLinkedToActivities', () => {
  it('incluye documento con activityId aunque document.date este fuera del periodo', () => {
    const activities = [baseActivity('act-1')];
    const documents = [baseDocument({ date: '2026-03-01' })];

    const linked = documentsLinkedToActivities(documents, activities);

    assert.equal(linked.length, 1);
    assert.equal(linked[0]?.id, 'doc-1');
  });

  it('excluye documento sin activityId no vinculado', () => {
    const activities = [baseActivity('act-1')];
    const documents = [
      baseDocument(),
      baseDocument({ id: 'doc-2', activityId: undefined, number: 'F-001', type: 'invoice' }),
    ];

    const linked = documentsLinkedToActivities(documents, activities);

    assert.equal(linked.length, 1);
    assert.equal(linked[0]?.type, 'delivery-note');
  });

  it('mantiene facturas y albaranes diferenciados', () => {
    const activities = [baseActivity('act-1')];
    const documents = [
      baseDocument({ id: 'dn-1', type: 'delivery-note', number: 'A-001' }),
      baseDocument({
        id: 'inv-1',
        type: 'invoice',
        number: 'F-001',
        date: '2026-04-01',
      }),
    ];

    const linked = documentsLinkedToActivities(documents, activities);
    const types = linked.map((document) => document.type).sort();

    assert.deepEqual(types, ['delivery-note', 'invoice']);
  });
});

describe('deliveryNotesForActivities', () => {
  it('encuentra albaran por activity.id sin workerUserId', () => {
    const activities = [baseActivity('act-1')];
    const documents = [
      baseDocument({ id: 'dn-1', date: '2026-03-01' }),
      baseDocument({
        id: 'dn-2',
        activityId: 'act-2',
        number: 'A-002',
      }),
    ];

    const notes = deliveryNotesForActivities(activities, documents);

    assert.equal(notes.length, 1);
    assert.equal(notes[0]?.id, 'dn-1');
    assert.equal(notes[0]?.date, '2026-03-01');
  });
});
