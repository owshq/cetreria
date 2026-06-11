import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Activity, ActivityType, Document } from '../types.js';
import { documentsLinkedToActivities } from '../documentConcepts.js';
import { formatWorkReportZonesSummary } from '../activityWorkReport.js';
import { resolveWorkerReportHours } from '../workerEffectiveHours.js';

const activityTypes: ActivityType[] = [
  {
    id: 'at-work',
    workspaceId: 'ws-1',
    name: 'Mantenimiento',
    icon: 'wrench',
    color: '#2563eb',
    createsDeliveryNote: true,
  },
];

const activity: Activity = {
  id: 'act-1',
  workspaceId: 'ws-1',
  clientId: 'client-1',
  userId: 'user-1',
  date: '2026-01-10',
  type: 'at-work',
  description: 'Revision',
  hours: 4,
  assigneeSlots: [
    { userId: 'user-1', shift: 'M', startTime: '09:00', endTime: '12:00' },
  ],
  attachments: [],
  workReports: [
    {
      userId: 'user-1',
      userName: 'Ana',
      status: 'submitted',
      workedMinutes: 180,
      zones: [{ id: 'z-1', title: 'Sala', notes: 'Cableado revisado', images: [] }],
      updatedAt: '2026-01-10T18:00:00.000Z',
    },
  ],
  createdAt: '2026-01-10T08:00:00.000Z',
};

const documents: Document[] = [
  {
    id: 'dn-1',
    workspaceId: 'ws-1',
    type: 'delivery-note',
    number: 'A-100',
    clientId: 'client-1',
    activityId: 'act-1',
    workerUserId: 'user-1',
    date: '2026-02-20',
    items: [],
    total: 50,
    status: 'sent',
    createdAt: '2026-02-20T10:00:00.000Z',
  },
];

describe('contrato filas detalle operario (shared)', () => {
  it('resuelve horas reportadas con fuente y zonas', () => {
    const result = resolveWorkerReportHours(activity, null, 'user-1', {
      activityTypes,
      workerSignaturesEnabled: false,
      shiftSchedulingEnabled: false,
    });
    const zones = formatWorkReportZonesSummary(activity.workReports![0]!.zones ?? []);

    assert.equal(result.hours, 3);
    assert.equal(result.source, 'work-report');
    assert.equal(result.label, 'Horas reportadas');
    assert.match(zones, /Sala/);
  });

  it('encuentra albaran por activity.id aunque document.date este fuera del periodo', () => {
    const linked = documentsLinkedToActivities(documents, [activity], 'all').filter(
      (doc) => doc.type === 'delivery-note',
    );

    assert.equal(linked.length, 1);
    assert.equal(linked[0]?.number, 'A-100');
    assert.equal(linked[0]?.date, '2026-02-20');
  });

  it('no usa firma para horas principales cuando el flag esta desactivado', () => {
    const signedActivity: Activity = {
      ...activity,
      workReports: [],
      assigneeSlots: [
        {
          userId: 'user-1',
          shift: 'M',
          startTime: '09:00',
          endTime: '12:00',
          workerSignature: {
            userId: 'user-1',
            userName: 'Ana',
            imageDataUrl: 'data:image/png;base64,abc',
            signedAt: '2026-01-10T12:00:00.000Z',
            hours: 2,
          },
        },
      ],
    };

    const result = resolveWorkerReportHours(signedActivity, null, 'user-1', {
      activityTypes,
      workerSignaturesEnabled: false,
      shiftSchedulingEnabled: true,
    });

    assert.equal(result.source, 'shift');
    assert.equal(result.hours, 3);
    assert.notEqual(result.label, 'Horas firmadas');
  });
});
