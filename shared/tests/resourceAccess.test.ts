import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Activity, CalendarEvent, Client, Document, DocumentTypeGroup, User } from '../types.js';
import {
  canUserAccessClient,
  canUserAccessDocument,
  filterClientsForUser,
  filterDocumentsForUser,
  resolveDocumentTypeGroupIsPublic,
} from '../resourceAccess.js';

const admin: Pick<User, 'id' | 'role'> = { id: 'admin-1', role: 'admin' };
const operator: Pick<User, 'id' | 'role'> = { id: 'op-1', role: 'user' };

const clientA: Client = {
  id: 'client-a',
  workspaceId: 'ws-1',
  groupId: 'group-1',
  name: 'Cliente A',
  email: 'a@test.com',
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
};

const clientB: Client = {
  ...clientA,
  id: 'client-b',
  name: 'Cliente B',
  email: 'b@test.com',
};

const activityForOperator: Activity = {
  id: 'act-1',
  workspaceId: 'ws-1',
  clientId: clientA.id,
  userId: operator.id,
  date: '2026-06-01',
  description: 'Trabajo',
  hours: 2,
  type: 'work',
  createdAt: '2026-06-01T08:00:00.000Z',
};

const activityOtherClient: Activity = {
  ...activityForOperator,
  id: 'act-2',
  clientId: clientB.id,
  userId: 'other-op',
};

const events: CalendarEvent[] = [];

const publicDeliveryGroup: DocumentTypeGroup = {
  id: 'grp-alb',
  workspaceId: 'ws-1',
  documentType: 'delivery-note',
  name: 'Albaranes',
  isPublic: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const privateDeliveryGroup: DocumentTypeGroup = {
  ...publicDeliveryGroup,
  id: 'grp-alb-priv',
  isPublic: false,
};

const invoiceGroup: DocumentTypeGroup = {
  id: 'grp-inv',
  workspaceId: 'ws-1',
  documentType: 'invoice',
  name: 'Facturas',
  isPublic: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function doc(
  overrides: Partial<Document> & Pick<Document, 'id' | 'type'>,
): Document {
  return {
    workspaceId: 'ws-1',
    number: 'DOC-1',
    clientId: clientA.id,
    date: '2026-06-01',
    items: [],
    total: 100,
    status: 'draft',
    createdAt: '2026-06-01T00:00:00.000Z',
    activityId: activityForOperator.id,
    ...overrides,
  };
}

describe('resolveDocumentTypeGroupIsPublic', () => {
  it('facturas siempre privadas aunque isPublic true en BD', () => {
    assert.equal(
      resolveDocumentTypeGroupIsPublic({ ...invoiceGroup, isPublic: true }),
      false,
    );
  });

  it('albaranes publicos solo con isPublic true explicito', () => {
    assert.equal(resolveDocumentTypeGroupIsPublic(publicDeliveryGroup), true);
    assert.equal(resolveDocumentTypeGroupIsPublic(privateDeliveryGroup), false);
    assert.equal(
      resolveDocumentTypeGroupIsPublic({ ...publicDeliveryGroup, isPublic: undefined }),
      false,
    );
  });
});

describe('canUserAccessDocument', () => {
  it('operario nunca accede a facturas', () => {
    const invoice = doc({ id: 'inv-1', type: 'invoice', activityId: activityForOperator.id });
    assert.equal(
      canUserAccessDocument(invoice, [activityForOperator], events, operator, [invoiceGroup]),
      false,
    );
  });

  it('operario ve albaran publico sin actividad asignada', () => {
    const note = doc({ id: 'alb-1', type: 'delivery-note', activityId: undefined });
    assert.equal(
      canUserAccessDocument(note, [activityForOperator], events, operator, [publicDeliveryGroup]),
      true,
    );
  });

  it('operario no ve albaran privado sin actividad asignada', () => {
    const note = doc({ id: 'alb-2', type: 'delivery-note', activityId: undefined });
    assert.equal(
      canUserAccessDocument(note, [activityForOperator], events, operator, [privateDeliveryGroup]),
      false,
    );
  });

  it('operario ve albaran privado ligado a actividad asignada', () => {
    const note = doc({ id: 'alb-3', type: 'delivery-note', activityId: activityForOperator.id });
    assert.equal(
      canUserAccessDocument(note, [activityForOperator], events, operator, [privateDeliveryGroup]),
      true,
    );
  });

  it('admin accede a cualquier documento', () => {
    const invoice = doc({ id: 'inv-2', type: 'invoice' });
    assert.equal(canUserAccessDocument(invoice, [], events, admin, []), true);
  });
});

describe('filterDocumentsForUser', () => {
  it('filtra facturas para operario', () => {
    const docs = [
      doc({ id: 'inv-3', type: 'invoice' }),
      doc({ id: 'alb-4', type: 'delivery-note', activityId: undefined }),
    ];
    const visible = filterDocumentsForUser(
      docs,
      [activityForOperator],
      events,
      operator,
      [publicDeliveryGroup, invoiceGroup],
    );
    assert.deepEqual(visible.map((item) => item.id), ['alb-4']);
  });
});

describe('canUserAccessClient / filterClientsForUser', () => {
  it('operario solo ve contactos de actividades asignadas', () => {
    const activities = [activityForOperator, activityOtherClient];
    assert.equal(canUserAccessClient(clientA.id, activities, events, operator), true);
    assert.equal(canUserAccessClient(clientB.id, activities, events, operator), false);
  });

  it('admin ve todos los contactos', () => {
    assert.equal(canUserAccessClient(clientB.id, [activityOtherClient], events, admin), true);
  });

  it('filterClientsForUser acota listado del operario', () => {
    const filtered = filterClientsForUser(
      [clientA, clientB],
      [activityForOperator, activityOtherClient],
      events,
      operator,
    );
    assert.deepEqual(filtered.map((client) => client.id), [clientA.id]);
  });
});
