import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatActivityCalendarDateRange,
  formatActivityCalendarTimeRange,
} from './activityScheduleDisplay.js';

describe('formatActivityCalendarDateRange', () => {
  it('muestra una sola fecha cuando el tramo no cruza medianoche', () => {
    assert.equal(
      formatActivityCalendarDateRange('2026-06-11', {
        startTime: '09:00',
        endTime: '17:00',
      }),
      '11 de junio 2026',
    );
  });

  it('muestra rango de fechas cuando cruza medianoche', () => {
    assert.equal(
      formatActivityCalendarDateRange('2026-06-11', {
        startTime: '22:00',
        endTime: '06:00',
      }),
      '11 - 12 de junio 2026',
    );
  });

  it('ajusta el rango al cambiar de mes', () => {
    assert.equal(
      formatActivityCalendarDateRange('2026-06-30', {
        startTime: '00:00',
        endTime: '00:00',
      }),
      '30 de junio - 1 de julio 2026',
    );
  });
});

describe('formatActivityCalendarTimeRange', () => {
  it('muestra solo horas en el mismo dia', () => {
    assert.equal(
      formatActivityCalendarTimeRange('2026-06-11', {
        startTime: '09:00',
        endTime: '17:00',
      }),
      '09:00 - 17:00',
    );
  });

  it('incluye fechas cuando cruza medianoche', () => {
    assert.equal(
      formatActivityCalendarTimeRange('2026-06-11', {
        startTime: '22:00',
        endTime: '06:00',
      }),
      '11 jun 2026 22:00 - 12 jun 2026 06:00',
    );
  });

  it('describe bloque 24h de medianoche a medianoche', () => {
    assert.equal(
      formatActivityCalendarTimeRange('2026-06-11', {
        startTime: '00:00',
        endTime: '00:00',
      }),
      '11 jun 2026 00:00 - 12 jun 2026 00:00',
    );
  });
});
