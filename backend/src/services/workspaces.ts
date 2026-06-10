import type { User, Workspace, WorkspaceMember } from '@shared/types';
import {
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_NAME,
  DEFAULT_WORKSPACE_SLUG,
  mapUserRoleToWorkspaceRole,
  slugifyWorkspaceName,
  toWorkspaceSummary,
} from '@shared/types';
import { DB_NAMES } from '../config.js';
import { getById, insertDoc, listAll, updateDoc } from '../db/repository.js';
import { ensureDefaultClientGroup } from '../db/clientGroups.js';

export async function getWorkspacesForUser(userId: string) {
  const [workspaces, members] = await Promise.all([
    listAll<Workspace>(DB_NAMES.workspaces),
    listAll<WorkspaceMember>(DB_NAMES.workspaceMembers),
  ]);

  const userMembers = members.filter((member) => member.userId === userId);
  const workspaceMap = new Map(workspaces.map((workspace) => [workspace.id, workspace]));

  return userMembers
    .map((member) => {
      const workspace = workspaceMap.get(member.workspaceId);
      if (!workspace) return null;
      return toWorkspaceSummary(workspace, member);
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export async function getWorkspaceMemberIds(workspaceId: string): Promise<string[]> {
  const members = await listAll<WorkspaceMember>(DB_NAMES.workspaceMembers);
  return members.filter((member) => member.workspaceId === workspaceId).map((member) => member.userId);
}

export async function ensureDefaultWorkspace(): Promise<Workspace> {
  const existing = await getById<Workspace>(DB_NAMES.workspaces, DEFAULT_WORKSPACE_ID);
  if (existing) return existing;

  const workspace: Workspace = {
    id: DEFAULT_WORKSPACE_ID,
    name: DEFAULT_WORKSPACE_NAME,
    slug: DEFAULT_WORKSPACE_SLUG,
    createdAt: new Date().toISOString(),
  };
  await insertDoc(DB_NAMES.workspaces, workspace);
  await ensureDefaultClientGroup(workspace.id);
  return workspace;
}

export async function ensureUserWorkspaceMembership(user: User, workspaceId: string): Promise<void> {
  const members = await listAll<WorkspaceMember>(DB_NAMES.workspaceMembers);
  const existing = members.find(
    (member) => member.workspaceId === workspaceId && member.userId === user.id,
  );
  if (existing) return;

  const member: WorkspaceMember = {
    id: crypto.randomUUID(),
    workspaceId,
    userId: user.id,
    role: mapUserRoleToWorkspaceRole(user.role),
    joinedAt: new Date().toISOString(),
  };
  await insertDoc(DB_NAMES.workspaceMembers, member);
}

export async function updateWorkspaceName(
  workspaceId: string,
  name: string,
): Promise<Workspace | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const workspace = await getById<Workspace>(DB_NAMES.workspaces, workspaceId);
  if (!workspace || workspace.name === trimmed) return workspace;

  return updateDoc<Workspace>(DB_NAMES.workspaces, workspaceId, {
    name: trimmed,
    slug: slugifyWorkspaceName(trimmed),
  });
}

export async function addUserToWorkspace(
  user: User,
  workspaceId: string,
  role = mapUserRoleToWorkspaceRole(user.role),
): Promise<WorkspaceMember> {
  const members = await listAll<WorkspaceMember>(DB_NAMES.workspaceMembers);
  const existing = members.find(
    (member) => member.workspaceId === workspaceId && member.userId === user.id,
  );
  if (existing) return existing;

  const member: WorkspaceMember = {
    id: crypto.randomUUID(),
    workspaceId,
    userId: user.id,
    role,
    joinedAt: new Date().toISOString(),
  };
  await insertDoc(DB_NAMES.workspaceMembers, member);
  return member;
}
