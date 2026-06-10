import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_WORKSPACE_FEATURE_FLAGS,
  defaultWorkspaceFeatureSettings,
  normalizeWorkspaceFeatureSettings,
} from '../workspaceFeatureSettings.js';

describe('workspaceFeatureSettings', () => {
  const workspaceId = 'ws-feature-test';

  it('verifactuEnabled es false por defecto', () => {
    assert.equal(DEFAULT_WORKSPACE_FEATURE_FLAGS.verifactuEnabled, false);
    assert.equal(defaultWorkspaceFeatureSettings(workspaceId).verifactuEnabled, false);
    assert.equal(normalizeWorkspaceFeatureSettings(null, workspaceId).verifactuEnabled, false);
  });

  it('normalizeWorkspaceFeatureSettings conserva verifactuEnabled explicito', () => {
    const enabled = normalizeWorkspaceFeatureSettings(
      { verifactuEnabled: true },
      workspaceId,
    );
    assert.equal(enabled.verifactuEnabled, true);

    const disabled = normalizeWorkspaceFeatureSettings(
      { verifactuEnabled: false },
      workspaceId,
    );
    assert.equal(disabled.verifactuEnabled, false);
  });
});
