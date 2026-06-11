import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Activity, ActivityType } from '../types.js';
import {
  getWorkerHoursDisplayLabel,
  resolveWorkerEffectiveHours,
  resolveWorkerReportHours,
  workerPeriodHoursMetricLabel,
  workerReportHoursLabel,
} from '../workerEffectiveHours.js';

const activityTypes: ActivityType[] = [
  {
    id: 'at-work',
    workspaceId: 'ws-1',
    name: 'Mantenimiento',
    icon: 'wrench',
    color: '#000',
    createsDeliveryNote: true,
  },
  {
    id: 'at-no-report',
    workspaceId: 'ws-1',
    name: 'Formacion',
    icon: 'graduation-cap',
    color: '#000',
    createsDeliveryNote: false,
  },
];

function baseActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'act-1',
    workspaceId: 'ws-1',
    clientId: 'client-1',
    userId: 'user-1',
    date: '2026-01-10',
    type: 'at-work',
    description: 'Trabajo',
    hours: 4,
    attachments: [],
    createdAt: '2026-01-10T08:00:00.000Z',
    ...overrides,
  };
}

describe('resolveWorkerReportHours', () => {
  it('usa parte enviado con fuente work-report', () => {
    const activity = baseActivity({
      workReports: [
        {
          userId: 'user-1',
          userName: 'Ana',
          status: 'submitted',
          workedMinutes: 150,
          updatedAt: '2026-01-10T18:00:00.000Z',
        },
      ],
    });

    const result = resolveWorkerReportHours(activity, null, 'user-1', {
      activityTypes,
      workerSignaturesEnabled: false,
      shiftSchedulingEnabled: false,
    });

    assert.equal(result.hours, 2.5);
    assert.equal(result.source, 'work-report');
    assert.equal(result.label, workerReportHoursLabel('work-report'));
  });

  it('ignora parte draft y usa turno si shiftSchedulingEnabled', () => {
    const activity = baseActivity({
      assigneeSlots: [
        { userId: 'user-1', shift: 'M', startTime: '09:00', endTime: '12:00' },
      ],
      workReports: [
        {
          userId: 'user-1',
          userName: 'Ana',
          status: 'draft',
          workedMinutes: 240,
          updatedAt: '2026-01-10T18:00:00.000Z',
        },
      ],
    });

    const result = resolveWorkerReportHours(activity, null, 'user-1', {
      activityTypes,
      shiftSchedulingEnabled: true,
    });

    assert.equal(result.hours, 3);
    assert.equal(result.source, 'shift');
    assert.equal(result.label, 'Horas asignadas');
  });

  it('usa firma solo si workerSignaturesEnabled esta activo', () => {
    const activity = baseActivity({
      assigneeSlots: [
        {
          userId: 'user-1',
          shift: 'M',
          startTime: '09:00',
          endTime: '13:00',
          workerSignature: {
            userId: 'user-1',
            userName: 'Ana',
            imageDataUrl: 'data:image/png;base64,abc',
            signedAt: '2026-01-10T13:00:00.000Z',
            hours: 3,
          },
        },
      ],
    });

    const off = resolveWorkerReportHours(activity, null, 'user-1', {
      activityTypes,
      workerSignaturesEnabled: false,
      shiftSchedulingEnabled: false,
    });
    assert.equal(off.source, 'activity');
    assert.equal(off.hours, 4);

    const on = resolveWorkerReportHours(activity, null, 'user-1', {
      activityTypes,
      workerSignaturesEnabled: true,
    });
    assert.equal(on.source, 'signature');
    assert.equal(on.hours, 3);
    assert.equal(on.label, 'Horas firmadas');
  });

  it('sin modulos usa horas registradas de actividad', () => {
    const activity = baseActivity({
      hours: 5,
      userId: 'user-1',
      assigneeSlots: [
        { userId: 'user-1', shift: 'M', startTime: '09:00', endTime: '09:00' },
      ],
    });

    const result = resolveWorkerReportHours(activity, null, 'user-1', {
      activityTypes,
      workerSignaturesEnabled: false,
      shiftSchedulingEnabled: false,
    });

    assert.equal(result.hours, 5);
    assert.equal(result.source, 'activity');
    assert.equal(result.label, 'Horas registradas');
  });

  it('respeta tipos que no usan parte de trabajo', () => {
    const activity = baseActivity({
      type: 'at-no-report',
      hours: 6,
      workReports: [
        {
          userId: 'user-1',
          userName: 'Ana',
          status: 'submitted',
          workedMinutes: 120,
          updatedAt: '2026-01-10T18:00:00.000Z',
        },
      ],
    });

    const result = resolveWorkerReportHours(activity, null, 'user-1', {
      activityTypes,
      workerSignaturesEnabled: false,
      shiftSchedulingEnabled: false,
    });

    assert.equal(result.hours, 6);
    assert.equal(result.source, 'activity');
  });

  it('usa horas registradas si assigneeSlots es array vacio y userId coincide', () => {
    const activity = baseActivity({
      hours: 5,
      userId: 'user-1',
      assigneeSlots: [],
    });

    const result = resolveWorkerReportHours(activity, null, 'user-1', {
      activityTypes,
      workerSignaturesEnabled: false,
      shiftSchedulingEnabled: false,
    });

    assert.equal(result.hours, 5);
    assert.equal(result.source, 'activity');
    assert.equal(result.label, 'Horas registradas');
  });

  it('devuelve none si el operario no esta asociado', () => {
    const activity = baseActivity({
      assigneeSlots: [
        { userId: 'user-2', shift: 'M', startTime: '09:00', endTime: '12:00' },
      ],
    });

    const result = resolveWorkerReportHours(activity, null, 'user-1', {
      activityTypes,
      workerSignaturesEnabled: true,
    });

    assert.equal(result.hours, 0);
    assert.equal(result.source, 'none');
  });
});

describe('resolveWorkerEffectiveHours', () => {
  it('delega en resolveWorkerReportHours y devuelve solo horas', () => {
    const activity = baseActivity({ hours: 4, userId: 'user-1' });
    const result = resolveWorkerReportHours(activity, null, 'user-1', {
      activityTypes,
      workerSignaturesEnabled: false,
      shiftSchedulingEnabled: false,
    });

    assert.equal(
      resolveWorkerEffectiveHours(activity, null, 'user-1', {
        activityTypes,
        workerSignaturesEnabled: false,
        shiftSchedulingEnabled: false,
      }),
      result.hours,
    );
  });
});

describe('workerPeriodHoursMetricLabel', () => {
  it('elige etiqueta segun modulos activos', () => {
    assert.equal(
      workerPeriodHoursMetricLabel({
        workerSignaturesEnabled: false,
        shiftSchedulingEnabled: false,
      }),
      'Horas registradas',
    );
    assert.equal(
      workerPeriodHoursMetricLabel({
        workerSignaturesEnabled: false,
        shiftSchedulingEnabled: true,
      }),
      'Horas asignadas',
    );
    assert.equal(
      workerPeriodHoursMetricLabel({ workerSignaturesEnabled: true }),
      'Horas firmadas',
    );
  });
});

describe('getWorkerHoursDisplayLabel', () => {
  it('devuelve etiqueta corta agregada segun flags', () => {
    assert.equal(
      getWorkerHoursDisplayLabel({
        workerSignaturesEnabled: false,
        shiftSchedulingEnabled: false,
      }),
      'H. reg.',
    );
    assert.equal(
      getWorkerHoursDisplayLabel({
        workerSignaturesEnabled: false,
        shiftSchedulingEnabled: true,
      }),
      'H. asig.',
    );
    assert.equal(
      getWorkerHoursDisplayLabel({ workerSignaturesEnabled: true }),
      'H. firm.',
    );
  });

  it('devuelve etiqueta por fuente de fila', () => {
    assert.equal(
      getWorkerHoursDisplayLabel({ source: 'work-report' }),
      'H. reportadas',
    );
    assert.equal(
      getWorkerHoursDisplayLabel({ source: 'activity', short: false }),
      'Horas registradas',
    );
  });

  it('no expone la palabra efectivas', () => {
    for (const source of ['work-report', 'signature', 'shift', 'activity', 'none'] as const) {
      const label = getWorkerHoursDisplayLabel({ source, short: false });
      assert.doesNotMatch(label, /efectiv/i);
    }
    assert.doesNotMatch(
      getWorkerHoursDisplayLabel({
        workerSignaturesEnabled: true,
        shiftSchedulingEnabled: true,
        short: false,
      }),
      /efectiv/i,
    );
  });
});
