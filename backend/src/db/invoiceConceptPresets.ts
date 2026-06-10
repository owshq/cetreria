import crypto from 'crypto';
import type { InvoiceConceptSetting } from '@shared/types';
import { HALCONERIA_INVOICE_CONCEPTS } from '../../../shared/halconeriaInvoiceConcepts.js';
import { DEFAULT_WORKSPACE_ID, normalizeConceptKey } from '@shared/types';
import { DB_NAMES } from '../config.js';
import {
  deleteDoc,
  findByFieldInWorkspace,
  insertDoc,
  listAll,
  listAllInWorkspace,
  updateDoc,
  withDbTransaction,
} from './repository.js';

const CORRUPT_CONCEPT_MARKER = '\uFFFD';

async function removeCorruptedInvoiceConceptDuplicates(
  workspaceId: string,
): Promise<void> {
  const items = await listAllInWorkspace<InvoiceConceptSetting>(
    DB_NAMES.invoiceConceptSettings,
    workspaceId,
  );

  await withDbTransaction(async () => {
    for (const item of items) {
      const key = item.normalizedKey;
      const label = item.label ?? '';
      if (key.includes(CORRUPT_CONCEPT_MARKER) || label.includes(CORRUPT_CONCEPT_MARKER)) {
        await deleteDoc(DB_NAMES.invoiceConceptSettings, item.id);
      }
    }
  });
}

export async function ensureHalconeriaInvoiceConceptsForWorkspace(
  workspaceId: string,
): Promise<void> {
  if (workspaceId !== DEFAULT_WORKSPACE_ID) return;

  await removeCorruptedInvoiceConceptDuplicates(workspaceId);

  let changed = false;

  await withDbTransaction(async () => {
    for (const preset of HALCONERIA_INVOICE_CONCEPTS) {
      const normalizedKey = normalizeConceptKey(preset.label);
      const existing = (
        await findByFieldInWorkspace<InvoiceConceptSetting>(
          DB_NAMES.invoiceConceptSettings,
          'normalizedKey',
          normalizedKey,
          workspaceId,
        )
      )[0];

      if (existing) {
        const updates: Partial<Pick<InvoiceConceptSetting, 'emoji' | 'label'>> = {};
        if (existing.emoji !== preset.emoji) updates.emoji = preset.emoji;
        if ((existing.label ?? '').trim() !== preset.label) updates.label = preset.label;
        if (Object.keys(updates).length > 0) {
          await updateDoc<InvoiceConceptSetting>(
            DB_NAMES.invoiceConceptSettings,
            existing.id,
            updates,
          );
          changed = true;
        }
        continue;
      }

      const setting: InvoiceConceptSetting = {
        id: crypto.randomUUID(),
        workspaceId,
        label: preset.label,
        normalizedKey,
        emoji: preset.emoji,
      };
      await insertDoc(DB_NAMES.invoiceConceptSettings, setting);
      changed = true;
    }
  });

  if (changed) {
    console.log(`Conceptos de halconeria sincronizados para workspace ${workspaceId}.`);
  }
}

export async function ensureHalconeriaInvoiceConcepts(): Promise<void> {
  const workspaces = await listAll<{ id: string }>(DB_NAMES.workspaces);
  for (const workspace of workspaces) {
    await ensureHalconeriaInvoiceConceptsForWorkspace(workspace.id);
  }
}
