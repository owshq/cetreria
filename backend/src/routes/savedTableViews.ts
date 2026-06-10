import { Router } from 'express';
import type { UserTableViewsPage, WorkspaceTableViewsPage } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { findByFieldInWorkspace, insertDoc, updateDoc } from '../db/repository.js';
import { authRequired, type AuthUser } from '../middleware/auth.js';
import { workspaceRequired } from '../middleware/workspace.js';
import { routeParam } from '../utils/routeParam.js';

const router = Router();

router.use(authRequired);
router.use(workspaceRequired);

function viewId(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const id = (raw as { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
}

function viewCreatedBy(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const createdBy = (raw as { createdBy?: unknown }).createdBy;
  return typeof createdBy === 'string' ? createdBy : undefined;
}

function canDeleteViewOnServer(raw: unknown, user: AuthUser): boolean {
  if (user.role === 'admin') return true;
  if (isPrivateView(raw)) {
    const owner = (raw as { userId?: string }).userId;
    return owner === user.id;
  }
  const createdBy = viewCreatedBy(raw);
  return Boolean(createdBy && createdBy === user.id);
}

function mergePublicViewsForUser(
  existing: unknown[],
  incoming: unknown[],
  user: AuthUser,
): unknown[] {
  if (user.role === 'admin') return incoming;

  const incomingById = new Map<string, unknown>();
  for (const view of incoming) {
    const id = viewId(view);
    if (id) incomingById.set(id, view);
  }

  const merged: unknown[] = [];

  for (const existingView of existing) {
    const id = viewId(existingView);
    if (!id) continue;
    if (incomingById.has(id)) {
      merged.push(incomingById.get(id));
      incomingById.delete(id);
      continue;
    }
    if (!canDeleteViewOnServer(existingView, user)) {
      merged.push(existingView);
    }
  }

  for (const view of incomingById.values()) {
    merged.push(view);
  }

  return merged;
}

function normalizeViews(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

function isPrivateView(raw: unknown): boolean {
  return Boolean(raw && typeof raw === 'object' && (raw as { isPrivate?: boolean }).isPrivate);
}

function stripPrivateMetadata(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const { isPrivate: _isPrivate, userId: _userId, ...rest } = raw as Record<string, unknown>;
  return rest;
}

function sanitizePublicViews(views: unknown[]): unknown[] {
  return views.filter((view) => !isPrivateView(view)).map(stripPrivateMetadata);
}

function sanitizePrivateViewsForUser(views: unknown[], userId: string): unknown[] {
  return views
    .filter((view) => isPrivateView(view))
    .map((view) => ({
      ...(typeof view === 'object' && view ? view : {}),
      isPrivate: true,
      userId,
    }));
}

async function getWorkspacePageBundle(
  workspaceId: string,
  pageKey: string,
): Promise<WorkspaceTableViewsPage | null> {
  const matches = await findByFieldInWorkspace<WorkspaceTableViewsPage>(
    DB_NAMES.savedTableViewsPages,
    'pageKey',
    pageKey,
    workspaceId,
  );
  return matches[0] ?? null;
}

async function getUserPageBundle(
  workspaceId: string,
  userId: string,
  pageKey: string,
): Promise<UserTableViewsPage | null> {
  const matches = await findByFieldInWorkspace<UserTableViewsPage>(
    DB_NAMES.savedTableViewsUserPages,
    'pageKey',
    pageKey,
    workspaceId,
  );
  return matches.find((entry) => entry.userId === userId) ?? null;
}

async function saveWorkspaceViews(
  workspaceId: string,
  pageKey: string,
  views: unknown[],
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getWorkspacePageBundle(workspaceId, pageKey);

  if (existing) {
    await updateDoc<WorkspaceTableViewsPage>(DB_NAMES.savedTableViewsPages, existing.id, {
      views,
      updatedAt: now,
    });
    return;
  }

  const bundle: WorkspaceTableViewsPage = {
    id: crypto.randomUUID(),
    workspaceId,
    pageKey,
    views,
    updatedAt: now,
  };
  await insertDoc(DB_NAMES.savedTableViewsPages, bundle);
}

async function saveUserViews(
  workspaceId: string,
  userId: string,
  pageKey: string,
  views: unknown[],
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getUserPageBundle(workspaceId, userId, pageKey);

  if (existing) {
    await updateDoc<UserTableViewsPage>(DB_NAMES.savedTableViewsUserPages, existing.id, {
      views,
      updatedAt: now,
    });
    return;
  }

  const bundle: UserTableViewsPage = {
    id: crypto.randomUUID(),
    workspaceId,
    userId,
    pageKey,
    views,
    updatedAt: now,
  };
  await insertDoc(DB_NAMES.savedTableViewsUserPages, bundle);
}

router.get('/:pageKey', async (req, res) => {
  const pageKey = routeParam(req.params.pageKey);
  const workspaceId = req.workspaceId!;
  const userId = req.user!.id;

  const [workspaceBundle, userBundle] = await Promise.all([
    getWorkspacePageBundle(workspaceId, pageKey),
    getUserPageBundle(workspaceId, userId, pageKey),
  ]);

  const rawWorkspaceViews = normalizeViews(workspaceBundle?.views);
  const publicViews = sanitizePublicViews(rawWorkspaceViews);
  const legacyPrivateInWorkspace = rawWorkspaceViews.filter((view) => {
    if (!isPrivateView(view)) return false;
    const owner = (view as { userId?: string }).userId;
    return !owner || owner === userId;
  });
  const privateViews = sanitizePrivateViewsForUser(
    [...normalizeViews(userBundle?.views), ...legacyPrivateInWorkspace],
    userId,
  );

  res.json({ views: [...publicViews, ...privateViews] });
});

router.put('/:pageKey', async (req, res) => {
  const pageKey = routeParam(req.params.pageKey);
  const workspaceId = req.workspaceId!;
  const userId = req.user!.id;
  const incoming = normalizeViews(req.body?.views);

  const existingWorkspace = await getWorkspacePageBundle(workspaceId, pageKey);
  const existingPublic = sanitizePublicViews(normalizeViews(existingWorkspace?.views));
  const incomingPublic = sanitizePublicViews(incoming);
  const privateViews = sanitizePrivateViewsForUser(incoming, userId);
  const publicViews = mergePublicViewsForUser(existingPublic, incomingPublic, req.user!);

  await Promise.all([
    saveWorkspaceViews(workspaceId, pageKey, publicViews),
    saveUserViews(workspaceId, userId, pageKey, privateViews),
  ]);

  res.json({ views: [...publicViews, ...privateViews] });
});

export default router;
