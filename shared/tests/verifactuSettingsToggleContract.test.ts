import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const verifactuSettingsSrc = fs.readFileSync(
  path.join(repoRoot, 'frontend/src/pages/VerifactuSettings.tsx'),
  'utf8',
);
const workspaceFeatureSettingsSrc = fs.readFileSync(
  path.join(repoRoot, 'frontend/src/pages/WorkspaceFeatureSettings.tsx'),
  'utf8',
);

describe('VerifactuSettings toggle contract', () => {
  it('lee verifactuEnabled desde funcionalidades del workspace', () => {
    assert.match(verifactuSettingsSrc, /useWorkspaceFeatureSettings/);
    assert.match(verifactuSettingsSrc, /verifactuEnabled/);
    assert.doesNotMatch(verifactuSettingsSrc, /verifactuEnabled:\s*formData/);
  });

  it('bloquea edicion tecnica cuando Veri*Factu esta desactivado', () => {
    assert.match(verifactuSettingsSrc, /disabled=\{!verifactuEnabled\}/);
    assert.match(verifactuSettingsSrc, /disabledNotice/);
    assert.match(verifactuSettingsSrc, /!verifactuEnabled/);
  });

  it('el toggle Veri*Factu no se muestra en el panel de funcionalidades', () => {
    assert.doesNotMatch(workspaceFeatureSettingsSrc, /id="feature-verifactu"/);
    assert.doesNotMatch(workspaceFeatureSettingsSrc, /Veri\*Factu/);
  });
});
