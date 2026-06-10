import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ClientGroup } from '@shared/types';
import type { DataStore } from './dataStore.js';
import { readClientGroupsForWorkspaceFromStore } from './clientGroups.js';

const WORKSPACE_ID = 'c2000001-0000-4000-8000-000000000001';
const OTHER_WORKSPACE_ID = 'c2000002-0000-4000-8000-000000000002';

function mockStore(groups: ClientGroup[]): Pick<DataStore, 'listAllInWorkspace'> {
  return {
    listAllInWorkspace: async (_collection: string, workspaceId: string) =>
      groups.filter((group) => group.workspaceId === workspaceId),
  } as Pick<DataStore, 'listAllInWorkspace'>;
}

describe('readClientGroupsForWorkspaceFromStore', () => {
  it('ordena default primero y luego por nombre', async () => {
    const groups = await readClientGroupsForWorkspaceFromStore(
      WORKSPACE_ID,
      mockStore([
        {
          id: 'b1000001-0000-4000-8000-000000000001',
          workspaceId: WORKSPACE_ID,
          name: 'Zeta',
          isDefault: false,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'b1000002-0000-4000-8000-000000000002',
          workspaceId: WORKSPACE_ID,
          name: 'Clientes',
          isDefault: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );

    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.isDefault, true);
    assert.equal(groups[0]?.name, 'Clientes');
    assert.equal(groups[1]?.name, 'Zeta');
  });

  it('solo lista grupos del workspace pedido', async () => {
    const groups = await readClientGroupsForWorkspaceFromStore(
      WORKSPACE_ID,
      mockStore([
        {
          id: 'b1000003-0000-4000-8000-000000000003',
          workspaceId: WORKSPACE_ID,
          name: 'Local',
          isDefault: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'b1000004-0000-4000-8000-000000000004',
          workspaceId: OTHER_WORKSPACE_ID,
          name: 'Ajeno',
          isDefault: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );

    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.name, 'Local');
  });
});
