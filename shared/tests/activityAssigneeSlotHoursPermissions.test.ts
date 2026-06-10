import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canEditAssigneeSlotHours,
  canUpdateActivityAssigneeSlotHours,
  isAssigneeSlotScheduleOnlyUpdate,
} from '../activityPermissions.js';
import type { Activity, CalendarEvent, User } from '../types.js';

const admin: User = {
  id: 'admin-1',
  name: 'Admin',
  email: 'admin@test.com',
  role: 'admin',
  password: 'x',
};

const worker: User = {
  id: 'worker-1',
  name: 'Worker',
  email: 'worker@test.com',
  role: 'user',
  password: 'x',
};

const otherWorker: User = {
  id: 'worker-2',
  name: 'Other',
  email: 'other@test.com',
  role: 'user',
  password: 'x',
};

const activity: Activity = {
  id: 'act-1',
  workspaceId: 'ws-1',
  clientId: 'client-1',
  userId: 'worker-1',
  date: '2020-01-01',
  type: 'type-1',
  description: 'Trabajo',
  hours: 2,
  assigneeSlots: [
    { userId: 'worker-1', shift: 'M', startTime: '10:00', endTime: '12:00' },
    { userId: 'worker-2', shift: 'T', startTime: '14:00', endTime: '22:00' },
  ],
  attachments: [],
  createdAt: '2020-01-01T00:00:00.000Z',
};

const event: CalendarEvent = {
  id: 'evt-1',
  workspaceId: 'ws-1',
  title: 'Trabajo',
  description: 'Trabajo',
  date: '2020-01-01',
  startTime: '10:00',
  endTime: '22:00',
  assignedTo: ['worker-1', 'worker-2'],
  clientId: 'client-1',
  activityId: 'act-1',
  createdBy: 'admin-1',
  history: [],
};

describe('canEditAssigneeSlotHours', () => {
  it('permite al operario editar su tramo aunque la actividad sea pasada', () => {
    assert.equal(
      canEditAssigneeSlotHours(worker, {
        activity,
        event,
        targetUserId: 'worker-1',
      }),
      true,
    );
  });

  it('no permite al operario editar el tramo de otro', () => {
    assert.equal(
      canEditAssigneeSlotHours(worker, {
        activity,
        event,
        targetUserId: 'worker-2',
      }),
      false,
    );
  });

  it('permite al admin editar cualquier tramo sin firma', () => {
    assert.equal(
      canEditAssigneeSlotHours(admin, {
        activity,
        event,
        targetUserId: 'worker-2',
      }),
      true,
    );
  });
});

describe('canUpdateActivityAssigneeSlotHours', () => {
  it('acepta actualizacion parcial del propio tramo por operario', () => {
    assert.equal(
      canUpdateActivityAssigneeSlotHours(worker, {
        activity,
        event,
        nextAssigneeSlots: [
          { userId: 'worker-1', shift: 'M', startTime: '09:00', endTime: '11:00' },
          { userId: 'worker-2', shift: 'T', startTime: '14:00', endTime: '22:00' },
        ],
      }),
      true,
    );
  });

  it('rechaza si el operario cambia tramos ajenos', () => {
    assert.equal(
      canUpdateActivityAssigneeSlotHours(worker, {
        activity,
        event,
        nextAssigneeSlots: [
          { userId: 'worker-1', shift: 'M', startTime: '10:00', endTime: '12:00' },
          { userId: 'worker-2', shift: 'T', startTime: '15:00', endTime: '22:00' },
        ],
      }),
      false,
    );
  });
});

describe('isAssigneeSlotScheduleOnlyUpdate', () => {
  it('detecta updates limitados a assigneeSlots y hours', () => {
    assert.equal(
      isAssigneeSlotScheduleOnlyUpdate({
        assigneeSlots: activity.assigneeSlots,
        hours: 3,
      }),
      true,
    );
    assert.equal(
      isAssigneeSlotScheduleOnlyUpdate({
        assigneeSlots: activity.assigneeSlots,
        description: 'Otro',
      }),
      false,
    );
  });
});
