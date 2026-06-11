import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isActivityStarted } from '../activityPermissions.js';
import {
  canEditActivityWorkReport,
  canEditActivityWorkReportExtraItems,
  canSubmitActivityWorkReport,
  getActivityWorkReport,
  reopenActivityWorkReportForWorker,
  validateActivityInvoiceRequiresCompleteWorkReports,
  validateActivityInvoiceRequiresWorkerDeliveryNotes,
  formatActivityInvoiceWorkReportBlockReason,
  validateWorkReportSubmitClientEmail,
  ACTIVITY_INVOICE_PENDING_WORK_REPORTS_ERROR,
  ACTIVITY_INVOICE_PENDING_DELIVERY_NOTES_ERROR,
  ACTIVITY_WORK_REPORT_CLIENT_EMAIL_REQUIRED_ERROR,
  allAssigneesSubmittedWorkReports,
  allSubmittedAssigneesHaveDeliveryNotes,
} from '../activityWorkReport.js';
import type { Activity, CalendarEvent, Document, User } from '../types.js';

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

const futureEvent: CalendarEvent = {
  id: 'evt-future',
  workspaceId: 'ws-1',
  title: 'Manana',
  description: 'Manana',
  date: '2026-06-12',
  startTime: '09:00',
  endTime: '13:00',
  assignedTo: ['worker-1'],
  clientId: 'client-1',
  activityId: 'act-future',
  createdBy: 'admin-1',
  history: [],
};

const futureActivity: Activity = {
  id: 'act-future',
  workspaceId: 'ws-1',
  clientId: 'client-1',
  userId: 'worker-1',
  date: '2026-06-12',
  type: 'type-1',
  description: 'Trabajo manana',
  hours: 4,
  attachments: [],
  createdAt: '2026-06-10T00:00:00.000Z',
};

const inProgressEvent: CalendarEvent = {
  ...futureEvent,
  id: 'evt-progress',
  activityId: 'act-progress',
  date: '2026-06-11',
  startTime: '08:00',
  endTime: '18:00',
};

const inProgressActivity: Activity = {
  ...futureActivity,
  id: 'act-progress',
  date: '2026-06-11',
};

const pastEvent: CalendarEvent = {
  ...inProgressEvent,
  id: 'evt-past',
  activityId: 'act-past',
  date: '2026-06-10',
  startTime: '08:00',
  endTime: '10:00',
};

const pastActivity: Activity = {
  ...inProgressActivity,
  id: 'act-past',
  date: '2026-06-10',
};

const now = new Date('2026-06-11T12:00:00.000Z');

describe('activity work report timing permissions', () => {
  it('actividad futura no ha empezado', () => {
    assert.equal(
      isActivityStarted({ activity: futureActivity, event: futureEvent }, now),
      false,
    );
  });

  it('actividad en curso ya ha empezado y no ha terminado', () => {
    assert.equal(
      isActivityStarted({ activity: inProgressActivity, event: inProgressEvent }, now),
      true,
    );
  });

  it('admin no puede editar informe antes de que empiece la actividad', () => {
    assert.equal(
      canEditActivityWorkReport(
        admin,
        {
          activity: futureActivity,
          event: futureEvent,
          targetUserId: 'worker-1',
        },
        now,
      ),
      false,
    );
    assert.equal(
      canEditActivityWorkReportExtraItems(
        admin,
        { activity: futureActivity, event: futureEvent },
        now,
      ),
      false,
    );
    assert.equal(
      canSubmitActivityWorkReport(
        admin,
        { activity: futureActivity, event: futureEvent },
        now,
      ),
      false,
    );
  });

  it('operario puede editar borrador durante la actividad pero no enviar', () => {
    assert.equal(
      canEditActivityWorkReport(
        worker,
        {
          activity: inProgressActivity,
          event: inProgressEvent,
          targetUserId: 'worker-1',
        },
        now,
      ),
      true,
    );
    assert.equal(
      canEditActivityWorkReportExtraItems(
        worker,
        { activity: inProgressActivity, event: inProgressEvent },
        now,
      ),
      true,
    );
    assert.equal(
      canSubmitActivityWorkReport(
        worker,
        { activity: inProgressActivity, event: inProgressEvent },
        now,
      ),
      false,
    );
  });

  it('operario puede enviar cuando la actividad ya termino', () => {
    assert.equal(
      canSubmitActivityWorkReport(
        worker,
        { activity: pastActivity, event: pastEvent },
        now,
      ),
      true,
    );
  });

  it('no se puede editar el informe si ya existe el albaran emitido del operario', () => {
    const submittedActivity: Activity = {
      ...pastActivity,
      workReports: [
        {
          userId: 'worker-1',
          userName: 'Worker',
          status: 'submitted',
          workedMinutes: 300,
          submittedAt: '2026-06-11T12:00:00.000Z',
          updatedAt: '2026-06-11T12:00:00.000Z',
        },
      ],
    };
    const deliveryNote: Document = {
      id: 'dn-1',
      workspaceId: 'ws-1',
      type: 'delivery-note',
      number: 'A-001',
      clientId: 'client-1',
      activityId: 'act-past',
      workerUserId: 'worker-1',
      date: '2026-06-10',
      items: [
        {
          name: 'Servicio',
          description: 'Worker: 5h',
          quantity: 5,
          price: 0,
        },
      ],
      subtotal: 0,
      taxRate: 21,
      taxAmount: 0,
      total: 0,
      notes: 'Albaran',
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
      createdAt: '2026-06-11T12:00:00.000Z',
    };

    assert.equal(
      canEditActivityWorkReport(
        worker,
        {
          activity: submittedActivity,
          event: pastEvent,
          targetUserId: 'worker-1',
          documents: [deliveryNote],
        },
        now,
      ),
      false,
    );
    assert.equal(
      canEditActivityWorkReport(
        admin,
        {
          activity: submittedActivity,
          event: pastEvent,
          targetUserId: 'admin-1',
          documents: [deliveryNote],
        },
        now,
      ),
      true,
    );
    assert.equal(
      canEditActivityWorkReportExtraItems(
        admin,
        {
          activity: submittedActivity,
          event: pastEvent,
          documents: [deliveryNote],
        },
        now,
      ),
      false,
    );
  });
});

describe('reopenActivityWorkReportForWorker', () => {
  const submittedActivity: Activity = {
    ...pastActivity,
    workReports: [
      {
        userId: 'worker-1',
        userName: 'Worker',
        status: 'submitted',
        workedMinutes: 300,
        submittedAt: '2026-06-11T12:00:00.000Z',
        updatedAt: '2026-06-11T12:00:00.000Z',
      },
    ],
  };

  it('vuelve a borrador el informe enviado del operario', () => {
    const reopened = reopenActivityWorkReportForWorker(
      submittedActivity,
      'worker-1',
      new Date('2026-06-11T14:00:00.000Z'),
    );
    const report = getActivityWorkReport(reopened, 'worker-1');
    assert.equal(report?.status, 'draft');
    assert.equal(report?.submittedAt, undefined);
    assert.equal(report?.workedMinutes, 300);
    assert.equal(report?.updatedAt, '2026-06-11T14:00:00.000Z');
  });

  it('no cambia la actividad si el informe no estaba enviado', () => {
    const draftActivity: Activity = {
      ...pastActivity,
      workReports: [
        {
          userId: 'worker-1',
          userName: 'Worker',
          status: 'draft',
          workedMinutes: 120,
          updatedAt: '2026-06-11T10:00:00.000Z',
        },
      ],
    };
    assert.equal(reopenActivityWorkReportForWorker(draftActivity, 'worker-1'), draftActivity);
  });
});

describe('validateActivityInvoiceRequiresCompleteWorkReports', () => {
  const multiAssigneeActivity: Activity = {
    ...pastActivity,
    assigneeSlots: [
      {
        userId: 'worker-1',
        userName: 'Worker',
        shift: 'L',
        startTime: '09:00',
        endTime: '13:00',
      },
      {
        userId: 'worker-2',
        userName: 'Worker 2',
        shift: 'L',
        startTime: '09:00',
        endTime: '13:00',
      },
    ],
    workReports: [
      {
        userId: 'worker-1',
        userName: 'Worker',
        status: 'submitted',
        workedMinutes: 240,
        updatedAt: '2026-06-11T12:00:00.000Z',
        submittedAt: '2026-06-11T12:00:00.000Z',
      },
    ],
  };

  it('bloquea factura si falta informe de algun operario', () => {
    assert.equal(
      validateActivityInvoiceRequiresCompleteWorkReports(multiAssigneeActivity, pastEvent),
      ACTIVITY_INVOICE_PENDING_WORK_REPORTS_ERROR,
    );
    assert.equal(allAssigneesSubmittedWorkReports(multiAssigneeActivity, pastEvent), false);
  });

  it('detalla operarios con informe pendiente al bloquear factura', () => {
    assert.equal(
      formatActivityInvoiceWorkReportBlockReason(multiAssigneeActivity, pastEvent),
      `${ACTIVITY_INVOICE_PENDING_WORK_REPORTS_ERROR} Informes pendientes: Worker 2.`,
    );
  });

  it('permite factura cuando todos los operarios enviaron informe', () => {
    const complete: Activity = {
      ...multiAssigneeActivity,
      workReports: [
        ...(multiAssigneeActivity.workReports ?? []),
        {
          userId: 'worker-2',
          userName: 'Worker 2',
          status: 'submitted',
          workedMinutes: 180,
          updatedAt: '2026-06-11T12:30:00.000Z',
          submittedAt: '2026-06-11T12:30:00.000Z',
        },
      ],
    };
    assert.equal(validateActivityInvoiceRequiresCompleteWorkReports(complete, pastEvent), null);
    assert.equal(allAssigneesSubmittedWorkReports(complete, pastEvent), true);
  });
});

describe('validateActivityInvoiceRequiresWorkerDeliveryNotes', () => {
  const completeActivity: Activity = {
    ...pastActivity,
    assigneeSlots: [
      {
        userId: 'worker-1',
        shift: 'L',
        startTime: '09:00',
        endTime: '13:00',
      },
      {
        userId: 'worker-2',
        shift: 'L',
        startTime: '09:00',
        endTime: '13:00',
      },
    ],
    workReports: [
      {
        userId: 'worker-1',
        userName: 'Worker',
        status: 'submitted',
        workedMinutes: 240,
        updatedAt: '2026-06-11T12:00:00.000Z',
        submittedAt: '2026-06-11T12:00:00.000Z',
      },
      {
        userId: 'worker-2',
        userName: 'Worker 2',
        status: 'submitted',
        workedMinutes: 180,
        updatedAt: '2026-06-11T12:30:00.000Z',
        submittedAt: '2026-06-11T12:30:00.000Z',
      },
    ],
  };

  const deliveryNoteFor = (workerUserId: string): Document => ({
    id: `dn-${workerUserId}`,
    workspaceId: 'ws-1',
    type: 'delivery-note',
    number: `A-${workerUserId}`,
    clientId: 'client-1',
    activityId: completeActivity.id,
    workerUserId,
    date: '2026-06-10',
    items: [{ name: 'Servicio', description: 'Horas', quantity: 1, price: 0 }],
    subtotal: 0,
    taxRate: 21,
    taxAmount: 0,
    total: 0,
    status: 'sent',
    createdAt: '2026-06-11T10:00:00.000Z',
  });

  it('bloquea factura si falta albaran de algun operario con informe enviado', () => {
    const documents = [deliveryNoteFor('worker-1')];
    assert.equal(
      validateActivityInvoiceRequiresWorkerDeliveryNotes(
        completeActivity,
        pastEvent,
        documents,
      ),
      ACTIVITY_INVOICE_PENDING_DELIVERY_NOTES_ERROR,
    );
    assert.equal(
      allSubmittedAssigneesHaveDeliveryNotes(completeActivity, pastEvent, documents),
      false,
    );
  });

  it('permite factura cuando cada operario con informe tiene albaran', () => {
    const documents = [deliveryNoteFor('worker-1'), deliveryNoteFor('worker-2')];
    assert.equal(
      validateActivityInvoiceRequiresWorkerDeliveryNotes(
        completeActivity,
        pastEvent,
        documents,
      ),
      null,
    );
  });
});

describe('validateWorkReportSubmitClientEmail', () => {
  it('exige email cuando el tipo genera albaran', () => {
    assert.equal(validateWorkReportSubmitClientEmail('', true), ACTIVITY_WORK_REPORT_CLIENT_EMAIL_REQUIRED_ERROR);
    assert.equal(validateWorkReportSubmitClientEmail('cliente@test.com', true), null);
    assert.equal(validateWorkReportSubmitClientEmail('', false), null);
  });
});
