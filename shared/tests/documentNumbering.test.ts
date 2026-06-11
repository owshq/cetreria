import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDocumentDisplayNameForDocument,
  defaultWorkspaceDocumentFormats,
  hasDocumentNameFormatChanges,
  resolveDocumentDisplayName,
} from '../documentNumbering.js';

describe('documentNumbering display names', () => {
  const formats = defaultWorkspaceDocumentFormats();

  it('resolveDocumentDisplayName usa displayName congelado si existe', () => {
    const resolved = resolveDocumentDisplayName(
      {
        type: 'invoice',
        number: 'F-2026-001',
        date: '2026-01-15',
        displayName: 'Nombre antiguo',
      },
      'Acme',
      formats,
    );
    assert.equal(resolved, 'Nombre antiguo');
  });

  it('resolveDocumentDisplayName calcula si no hay displayName', () => {
    const resolved = resolveDocumentDisplayName(
      { type: 'invoice', number: 'F-2026-001', date: '2026-01-15' },
      'Acme',
      formats,
    );
    assert.equal(resolved, buildDocumentDisplayNameForDocument(formats, {
      type: 'invoice',
      number: 'F-2026-001',
      date: '2026-01-15',
    }, 'Acme'));
  });

  it('hasDocumentNameFormatChanges detecta cambios solo en nombre', () => {
    const before = defaultWorkspaceDocumentFormats();
    const afterNumberOnly = defaultWorkspaceDocumentFormats();
    afterNumberOnly.invoice.number = [{ type: 'year' }, { type: 'counter', padding: 4 }];

    assert.equal(hasDocumentNameFormatChanges(before, afterNumberOnly), false);

    const afterName = defaultWorkspaceDocumentFormats();
    afterName.invoice.name = [{ type: 'client' }, { type: 'number' }];
    assert.equal(hasDocumentNameFormatChanges(before, afterName), true);
  });
});
