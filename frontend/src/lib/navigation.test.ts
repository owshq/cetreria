import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getReturnPath } from './navigation.js';

describe('getReturnPath', () => {
  it('returns fallback when state is missing', () => {
    assert.equal(getReturnPath(null), '/clients');
    assert.equal(getReturnPath(undefined, '/docs'), '/docs');
  });

  it('returns returnTo when present', () => {
    assert.equal(getReturnPath({ returnTo: '/reports' }), '/reports');
  });

  it('ignores invalid returnTo values', () => {
    assert.equal(getReturnPath({ returnTo: 42 }), '/clients');
    assert.equal(getReturnPath({ returnTo: '' }), '/clients');
  });
});
