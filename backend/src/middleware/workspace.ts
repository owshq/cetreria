import { NextFunction, Request, Response } from 'express';
import type { Workspace, WorkspaceMember } from '@shared/types';
import { isWorkspaceAdmin } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { getById, listAll } from '../db/repository.js';

declare global {
  namespace Express {
    interface Request {
      workspaceId?: string;
      workspaceMember?: WorkspaceMember;
      workspace?: Workspace;
    }
  }
}

export async function workspaceRequired(req: Request, res: Response, next: NextFunction) {
  const workspaceId = req.headers['x-workspace-id'];
  if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
    res.status(400).json({ error: 'Workspace requerido' });
    return;
  }

  const workspace = await getById<Workspace>(DB_NAMES.workspaces, workspaceId);
  if (!workspace) {
    res.status(404).json({ error: 'Workspace no encontrado' });
    return;
  }

  const members = await listAll<WorkspaceMember>(DB_NAMES.workspaceMembers);
  const member = members.find(
    (item) => item.workspaceId === workspaceId && item.userId === req.user!.id,
  );
  if (!member) {
    res.status(403).json({ error: 'No perteneces a este workspace' });
    return;
  }

  req.workspaceId = workspaceId;
  req.workspaceMember = member;
  req.workspace = workspace;
  next();
}

export function workspaceAdminRequired(req: Request, res: Response, next: NextFunction) {
  if (isWorkspaceAdmin(req.workspaceMember?.role) || req.user?.role === 'admin') {
    next();
    return;
  }
  res.status(403).json({ error: 'Permiso denegado' });
}
