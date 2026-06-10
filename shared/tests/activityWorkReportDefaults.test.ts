import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getDefaultWorkReportWorkedMinutes,
  hasMultipleWorkReportAssignees,
} from '../activityWorkReport.js';
import type { Activity } from '../types.js';

function baseActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'act-1',
    workspaceId: 'ws-1',
    clientId: 'client-1',
    userId: 'worker-1',
    date: '2026-06-10',
    type: 'type-1',
    description: 'Trabajo',
    hours: 5,
    attachments: [],
    createdAt: '2026-06-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('activity work report default hours', () => {
  it('un operario usa las horas de la actividad aunque el tramo sea distinto', () => {
    const activity = baseActivity({
      hours: 5,
      assigneeSlots: [
        { userId: 'worker-1', shift: 'M', startTime: '08:00', endTime: '14:00' },
      ],
    });

    assert.equal(hasMultipleWorkReportAssignees(activity, null), false);
    assert.equal(getDefaultWorkReportWorkedMinutes(activity, null, 'worker-1'), 300);
  });

  it('varios operarios usan las horas dedicadas del tramo del operario', () => {
    const activity = baseActivity({
      hours: 8,
      assigneeSlots: [
        { userId: 'worker-1', shift: 'M', startTime: '08:00', endTime: '12:00' },
        { userId: 'worker-2', shift: 'T', startTime: '14:00', endTime: '18:00' },
      ],
    });

    assert.equal(hasMultipleWorkReportAssignees(activity, null), true);
    assert.equal(getDefaultWorkReportWorkedMinutes(activity, null, 'worker-1'), 240);
    assert.equal(getDefaultWorkReportWorkedMinutes(activity, null, 'worker-2'), 240);
  });
});
