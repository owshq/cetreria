import { Router } from 'express';
import type { DeleteDocumentTypeGroupDocumentsAction, DocumentTypeGroup } from '@shared/types';
import { filterDocumentTypeGroupsForUser, workspaceHasDocumentTypeGroup } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { insertDoc, updateDoc } from '../db/repository.js';
import {
  deleteDocumentTypeGroupInWorkspace,
  getDocumentTypeGroupInWorkspace,
  listDocumentTypeGroupsForWorkspace,
  readDocumentTypeGroupsForWorkspaceFromStore,
} from '../db/documentTypeGroups.js';
import { jsonFileStore } from '../db/jsonFileStore.js';
import { routeParam } from '../utils/routeParam.js';
import { authRequired } from '../middleware/auth.js';
import { workspaceAdminRequired, workspaceRequired } from '../middleware/workspace.js';

const router = Router();

router.use(authRequired);
router.use(workspaceRequired);

router.get('/', async (req, res) => {
  const groups = await readDocumentTypeGroupsForWorkspaceFromStore(
    req.workspaceId!,
    jsonFileStore,
  );
  res.json(filterDocumentTypeGroupsForUser(groups, req.user!));
});

router.post('/', workspaceAdminRequired, async (req, res) => {
  const documentType = req.body?.documentType;
  if (documentType !== 'invoice' && documentType !== 'delivery-note') {
    res.status(400).json({ error: 'Tipo de documento no valido' });
    return;
  }

  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: 'El nombre del grupo es obligatorio' });
    return;
  }

  const workspaceId = req.workspaceId!;
  const existingGroups = await listDocumentTypeGroupsForWorkspace(workspaceId);
  if (workspaceHasDocumentTypeGroup(existingGroups, documentType)) {
    res.status(409).json({ error: 'Ya existe un grupo para este tipo de documento' });
    return;
  }

  const isPublic =
    documentType === 'invoice' ? false : req.body?.isPublic !== false;

  const group: DocumentTypeGroup = {
    id: crypto.randomUUID(),
    workspaceId,
    documentType,
    name,
    isPublic,
    createdAt: new Date().toISOString(),
  };

  await insertDoc(DB_NAMES.documentTypeGroups, group);
  res.status(201).json(group);
});

router.put('/:id', workspaceAdminRequired, async (req, res) => {
  const workspaceId = req.workspaceId!;
  const groupId = routeParam(req.params.id);
  const existing = await getDocumentTypeGroupInWorkspace(workspaceId, groupId);
  if (!existing) {
    res.status(404).json({ error: 'Grupo no encontrado' });
    return;
  }

  const name =
    typeof req.body?.name === 'string' ? req.body.name.trim() : existing.name;
  if (!name) {
    res.status(400).json({ error: 'El nombre del grupo es obligatorio' });
    return;
  }

  const isPublic =
    existing.documentType === 'invoice'
      ? false
      : req.body?.isPublic === undefined
        ? existing.isPublic
        : req.body.isPublic !== false;

  const updated = await updateDoc<DocumentTypeGroup>(DB_NAMES.documentTypeGroups, groupId, {
    name,
    isPublic,
  });
  if (!updated) {
    res.status(404).json({ error: 'Grupo no encontrado' });
    return;
  }

  res.json(updated);
});

router.delete('/:id', workspaceAdminRequired, async (req, res) => {
  const groupId = routeParam(req.params.id);
  const documentsAction: DeleteDocumentTypeGroupDocumentsAction =
    req.body?.documentsAction === 'delete_documents' ? 'delete_documents' : 'keep';
  const result = await deleteDocumentTypeGroupInWorkspace(
    req.workspaceId!,
    groupId,
    documentsAction,
  );

  if (result === 'not_found') {
    res.status(404).json({ error: 'Grupo no encontrado' });
    return;
  }

  res.status(204).send();
});

export default router;
