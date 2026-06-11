import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  activityEventSpanCrossesMidnight,
  aggregateEventTimeRange,
  resolveActivitySlotsForDisplay,
  totalHoursFromAssigneeSlots,
  type ActivityAssigneeSlot,
} from '../activityAssignees.js';

describe('resolveActivitySlotsForDisplay', () => {
  const saved: ActivityAssigneeSlot[] = [
    { userId: 'u1', shift: 'M', startTime: '10:00', endTime: '22:00' },
    { userId: 'u2', shift: 'T', startTime: '14:00', endTime: '22:00' },
  ];

  it('usa borradores del formulario para recalcular el horario visible', () => {
    const slots = resolveActivitySlotsForDisplay(
      ['u1', 'u2'],
      {
        u1: { shift: 'M', startTime: '11:00', endTime: '22:00' },
        u2: { shift: 'T', startTime: '14:00', endTime: '22:00' },
      },
      saved,
    );

    const range = aggregateEventTimeRange(slots);
    assert.equal(range.startTime, '11:00');
    assert.equal(range.endTime, '22:00');
    assert.equal(totalHoursFromAssigneeSlots(slots), 19);
  });

  it('agrega el rango minimo-maximo cuando hay varios operarios', () => {
    const slots = resolveActivitySlotsForDisplay(
      ['u1', 'u2'],
      {
        u1: { shift: 'M', startTime: '08:00', endTime: '14:00' },
        u2: { shift: 'T', startTime: '16:00', endTime: '22:00' },
      },
      saved,
    );

    const range = aggregateEventTimeRange(slots);
    assert.equal(range.startTime, '08:00');
    assert.equal(range.endTime, '22:00');
    assert.equal(totalHoursFromAssigneeSlots(slots), 12);
  });

  it('cae en tramos guardados cuando no hay borrador en el formulario', () => {
    const slots = resolveActivitySlotsForDisplay(['u1'], {}, saved);
    assert.deepEqual(slots, [saved[0]]);
  });
});

describe('aggregateEventTimeRange con varios operarios', () => {
  it('cubre el tramo nocturno mas largo entre operarios', () => {
    const slots: ActivityAssigneeSlot[] = [
      { userId: 'u1', shift: 'L', startTime: '22:00', endTime: '06:00' },
      { userId: 'u2', shift: 'L', startTime: '08:00', endTime: '12:00' },
    ];

    const range = aggregateEventTimeRange(slots);
    assert.equal(range.startTime, '08:00');
    assert.equal(range.endTime, '06:00');
    assert.equal(activityEventSpanCrossesMidnight(range), true);
  });

  it('mantiene un solo operario nocturno', () => {
    const slots: ActivityAssigneeSlot[] = [
      { userId: 'u1', shift: 'L', startTime: '22:00', endTime: '06:00' },
    ];

    const range = aggregateEventTimeRange(slots);
    assert.equal(range.startTime, '22:00');
    assert.equal(range.endTime, '06:00');
    assert.equal(activityEventSpanCrossesMidnight(range), true);
  });
});
