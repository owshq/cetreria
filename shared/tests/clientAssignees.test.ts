import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeClientAssignedUserIds, normalizeClientAssignedUserIds } from '../clientAssignees.js';

describe('clientAssignees', () => {
  it('normaliza ids unicos', () => {
    assert.deepEqual(normalizeClientAssignedUserIds([' u1 ', 'u1', '', 'u2']), ['u1', 'u2']);
  });

  it('merge set reemplaza', () => {
    assert.deepEqual(mergeClientAssignedUserIds(['a', 'b'], ['c'], 'set'), ['c']);
  });

  it('merge add une', () => {
    assert.deepEqual(mergeClientAssignedUserIds(['a'], ['b', 'a'], 'add'), ['a', 'b']);
  });

  it('merge remove elimina', () => {
    assert.deepEqual(mergeClientAssignedUserIds(['a', 'b', 'c'], ['b', 'x'], 'remove'), ['a', 'c']);
  });
});
