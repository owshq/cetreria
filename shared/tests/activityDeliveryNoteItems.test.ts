import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildActivityDeliveryNoteItemsForWorker,
  findActivityDeliveryNoteForWorker,
  listUnmatchedActivityDeliveryNotes,
  resolveActivityExtraItemsOwnerUserId,
  shouldIncludeExtraItemsOnWorkerDeliveryNote,
} from '../activityWorkReport.js';
import type { Activity, ActivityAssigneeSlot, Document } from '../types.js';

const assigneeSlots: ActivityAssigneeSlot[] = [
  {
    userId: 'admin-1',
    shift: 'M',
    startTime: '08:00',
    endTime: '17:00',
  },
  {
    userId: 'worker-1',
    shift: 'M',
    startTime: '08:00',
    endTime: '12:00',
  },
];

const baseActivity: Activity = {
  id: 'act-1',
  workspaceId: 'ws-1',
  clientId: 'client-1',
  type: 'type-1',
  date: '2026-06-11',
  description: 'Trabajo',
  assigneeSlots,
  workReportExtraItems: [{ name: 'Material', description: '', quantity: 1, price: 60.5 }],
};

describe('buildActivityDeliveryNoteItemsForWorker', () => {
  it('no incluye lineas si el operario no ha enviado su informe', () => {
    const activity: Activity = {
      ...baseActivity,
      workReports: [
        {
          userId: 'worker-1',
          userName: 'Sara',
          status: 'draft',
          workedMinutes: 120,
          updatedAt: '2026-06-11T10:00:00.000Z',
        },
      ],
    };

    assert.deepEqual(
      buildActivityDeliveryNoteItemsForWorker(activity, 'Servicio', 'worker-1'),
      [],
    );
  });

  it('incluye horas y conceptos extra solo en el primer operario asignado', () => {
    const activity: Activity = {
      ...baseActivity,
      workReports: [
        {
          userId: 'admin-1',
          userName: 'Administrador',
          status: 'submitted',
          workedMinutes: 180,
          updatedAt: '2026-06-11T10:00:00.000Z',
        },
      ],
    };

    const items = buildActivityDeliveryNoteItemsForWorker(activity, 'Servicio', 'admin-1');
    assert.equal(items.length, 2);
    assert.match(items[0]?.description ?? '', /Administrador/);
    assert.equal(items[1]?.name, 'Material');
  });

  it('cada operario obtiene solo sus horas; extras no se duplican', () => {
    const activity: Activity = {
      ...baseActivity,
      workReports: [
        {
          userId: 'admin-1',
          userName: 'Administrador',
          status: 'submitted',
          workedMinutes: 180,
          updatedAt: '2026-06-11T10:00:00.000Z',
        },
        {
          userId: 'worker-1',
          userName: 'Sara',
          status: 'submitted',
          workedMinutes: 60,
          updatedAt: '2026-06-11T11:00:00.000Z',
        },
      ],
    };

    const adminItems = buildActivityDeliveryNoteItemsForWorker(activity, 'Servicio', 'admin-1');
    const saraItems = buildActivityDeliveryNoteItemsForWorker(activity, 'Servicio', 'worker-1');

    assert.notEqual(adminItems[0]?.quantity, saraItems[0]?.quantity);
    assert.match(adminItems[0]?.description ?? '', /Administrador/);
    assert.match(saraItems[0]?.description ?? '', /Sara/);
    assert.equal(adminItems.length, 2);
    assert.equal(saraItems.length, 1);
    assert.equal(resolveActivityExtraItemsOwnerUserId(activity, null), 'admin-1');
    assert.equal(shouldIncludeExtraItemsOnWorkerDeliveryNote(activity, null, 'admin-1'), true);
    assert.equal(shouldIncludeExtraItemsOnWorkerDeliveryNote(activity, null, 'worker-1'), false);
  });
});

describe('findActivityDeliveryNoteForWorker', () => {
  const activity: Activity = {
    ...baseActivity,
    workReports: [
      {
        userId: 'admin-1',
        userName: 'Administrador',
        status: 'submitted',
        workedMinutes: 480,
        updatedAt: '2026-06-11T10:00:00.000Z',
      },
    ],
  };

  const legacyNote: Document = {
    id: 'dn-legacy',
    workspaceId: 'ws-1',
    type: 'delivery-note',
    number: 'A-2026-003',
    clientId: 'client-1',
    activityId: 'act-1',
    date: '2026-06-11',
    items: [
      {
        name: 'Servicio',
        description: 'Administrador: 8h',
        quantity: 8,
        price: 0,
      },
    ],
    subtotal: 0,
    taxRate: 21,
    taxAmount: 0,
    total: 0,
    notes: 'Albaran generado automaticamente a partir de los informes de trabajo.',
    billingAddress: {
      name: 'Cliente',
      email: 'cliente@test.com',
      address: '',
      city: '',
      postalCode: '',
      country: '',
      state: '',
    },
    status: 'sent',
    createdAt: '2026-06-11T10:00:00.000Z',
  };

  it('resuelve albaranes legacy sin workerUserId para el operario asignado', () => {
    const resolved = findActivityDeliveryNoteForWorker(
      'act-1',
      'admin-1',
      [legacyNote],
      activity,
    );
    assert.equal(resolved?.id, 'dn-legacy');
  });

  it('no duplica albaranes ya resueltos en filas legacy', () => {
    const resolved = findActivityDeliveryNoteForWorker(
      'act-1',
      'admin-1',
      [legacyNote],
      activity,
    );
    assert.ok(resolved);
    const unmatched = listUnmatchedActivityDeliveryNotes(
      'act-1',
      [legacyNote],
      new Set([resolved!.id]),
    );
    assert.deepEqual(unmatched, []);
  });
});
