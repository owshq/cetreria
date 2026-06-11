import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseWorkReportZonesInput,
  workReportHasZoneContent,
  type ActivityWorkReport,
} from '../activityWorkReport.js';

const existingReport: ActivityWorkReport = {
  userId: 'worker-1',
  userName: 'Worker',
  workedMinutes: 120,
  status: 'draft',
  zones: [
    {
      id: 'zone-1',
      title: 'Zona 1',
      notes: 'Nota anterior',
      images: [
        {
          id: 'img-1',
          storageKey: 'ws/act/zone/img-1.jpg',
          mimeType: 'image/jpeg',
          uploadedAt: '2026-06-10T10:00:00.000Z',
        },
      ],
    },
  ],
  updatedAt: '2026-06-10T10:00:00.000Z',
};

describe('activity work report zones', () => {
  it('conserva imagenes al actualizar notas de una zona', () => {
    const zones = parseWorkReportZonesInput(
      [{ id: 'zone-1', title: 'Zona 1', notes: 'Material usado y observaciones' }],
      existingReport,
    );

    assert.ok(zones);
    assert.equal(zones.length, 1);
    assert.equal(zones[0]?.notes, 'Material usado y observaciones');
    assert.equal(zones[0]?.images.length, 1);
    assert.equal(zones[0]?.images[0]?.id, 'img-1');
  });

  it('detecta contenido en zonas con notas o imagenes', () => {
    assert.equal(
      workReportHasZoneContent([
        { id: 'z1', title: '', notes: 'Solo texto', images: [] },
      ]),
      true,
    );
    assert.equal(
      workReportHasZoneContent([
        { id: 'z1', title: 'Zona', notes: '', images: existingReport.zones![0]!.images },
      ]),
      true,
    );
    assert.equal(
      workReportHasZoneContent([{ id: 'z1', title: '', notes: '', images: [] }]),
      false,
    );
  });
});
