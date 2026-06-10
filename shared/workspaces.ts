import type { User, Workspace, WorkspaceMember, WorkspaceMemberRole, WorkspaceSummary } from './types.js';

export const DEFAULT_WORKSPACE_ID = 'a0000001-0000-4000-8000-000000000001';
export const DEFAULT_WORKSPACE_SLUG = 'principal';
export const DEFAULT_WORKSPACE_NAME = 'Espacio principal';

export const WORKSPACE_HEADER = 'X-Workspace-Id';

export function slugifyWorkspaceName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'workspace';
}

export function mapUserRoleToWorkspaceRole(userRole: User['role']): WorkspaceMemberRole {
  return userRole === 'admin' ? 'owner' : 'member';
}

export function isWorkspaceAdmin(role: WorkspaceMemberRole | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export function toWorkspaceSummary(
  workspace: Workspace,
  member: WorkspaceMember,
): WorkspaceSummary {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    role: member.role,
  };
}

export function belongsToWorkspace<T extends { workspaceId?: string }>(
  entity: T | null | undefined,
  workspaceId: string,
): entity is T & { workspaceId: string } {
  return Boolean(entity && entity.workspaceId === workspaceId);
}
