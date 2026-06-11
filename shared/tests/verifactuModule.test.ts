import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseVerifactuModuleEnabled,
  resolveWorkspaceVerifactuEnabled,
} from '../verifactuModule.js';

describe('verifactuModule', () => {
  it('parseVerifactuModuleEnabled solo acepta true literal', () => {
    assert.equal(parseVerifactuModuleEnabled(undefined), false);
    assert.equal(parseVerifactuModuleEnabled(''), false);
    assert.equal(parseVerifactuModuleEnabled('false'), false);
    assert.equal(parseVerifactuModuleEnabled('TRUE'), true);
    assert.equal(parseVerifactuModuleEnabled('true'), true);
  });

  it('resolveWorkspaceVerifactuEnabled exige licencia de despliegue', () => {
    assert.equal(resolveWorkspaceVerifactuEnabled(true, false), false);
    assert.equal(resolveWorkspaceVerifactuEnabled(false, true), false);
    assert.equal(resolveWorkspaceVerifactuEnabled(true, true), true);
  });
});
