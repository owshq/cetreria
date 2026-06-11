import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITY_SCHEDULE_HOURS_TOOLTIP,
  activityScheduleHoursExceedsCalendarSpan,
  formatActivityScheduleEditHint,
  formatActivityScheduleHoursLabel,
} from './activityScheduleHoursHint.js';

describe('activityScheduleHoursHint', () => {
  it('no marca exceso cuando las horas caben en la franja', () => {
    assert.equal(activityScheduleHoursExceedsCalendarSpan(8, 8), false);
    assert.deepEqual(formatActivityScheduleHoursLabel(8, 8, String), {
      label: '8h totales',
    });
  });

  it('describe horas sumadas por operarios sin tono de error', () => {
    const result = formatActivityScheduleHoursLabel(16, 8, String);
    assert.equal(
      result.label,
      '16h sumadas por operarios \u00b7 bloque calendario 8h',
    );
    assert.equal(result.title, ACTIVITY_SCHEDULE_HOURS_TOOLTIP);
  });

  it('ajusta el pie del formulario de edicion', () => {
    const result = formatActivityScheduleEditHint(
      16,
      8,
      { startTime: '09:00', endTime: '17:00' },
      false,
      String,
    );
    assert.equal(
      result.suffix,
      ' sumadas por operarios \u00b7 calendario 09:00-17:00 (bloque 8 h)',
    );
    assert.equal(result.title, ACTIVITY_SCHEDULE_HOURS_TOOLTIP);
  });
});
