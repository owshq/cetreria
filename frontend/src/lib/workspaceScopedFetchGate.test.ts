import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldFetchWorkspaceScopedSettings } from './workspaceScopedFetchGate.js';

describe('shouldFetchWorkspaceScopedSettings', () => {
  it('no fetch sin sesion aunque haya workspace en cache', () => {
    assert.equal(shouldFetchWorkspaceScopedSettings(false, 'ws-1'), false);
    assert.equal(shouldFetchWorkspaceScopedSettings(false, null), false);
  });

  it('no fetch con sesion pero sin workspace resuelto', () => {
    assert.equal(shouldFetchWorkspaceScopedSettings(true, null), false);
    assert.equal(shouldFetchWorkspaceScopedSettings(true, ''), false);
  });

  it('fetch solo con sesion y workspace validos', () => {
    assert.equal(shouldFetchWorkspaceScopedSettings(true, 'ws-1'), true);
  });
});
