import fs from 'node:fs';
import { config } from '../config.js';
import { initJsonDb, setDbAccessMode } from './store.js';
import { seedIfEmpty } from './seed.js';
import { migrateData } from './migrate.js';
import { migrateDbHygiene } from './migrateDbHygiene.js';
import { migrateWorkspaces } from './migrateWorkspaces.js';
import { migrateHalconeriaUsers } from './migrateHalconeriaUsers.js';
import { ensureActivityTypes } from './activityTypes.js';
import { ensureDefaultClientGroups } from './clientGroups.js';
import { ensureDefaultDocumentTypeGroupsForAllWorkspaces } from './documentTypeGroups.js';
import { ensureEventActivityLinks } from './linkEventsActivities.js';
import { ensureHalconeriaInvoiceConcepts } from './invoiceConceptPresets.js';
import { ensureWorkspaceAppearanceSettings } from './ensureWorkspaceAppearanceSettings.js';

/** `check`: solo lectura (CI). Por defecto: init + migraciones + ensures. */
export type BootstrapDbMode = 'check' | 'default';

/**
 * Inicializa y migra la BD JSON. Misma secuencia en server, setup-db y preflight (modo default).
 */
export async function bootstrapDb(mode: BootstrapDbMode = 'default'): Promise<void> {
  if (mode === 'check') {
    setDbAccessMode('read-only');
    if (fs.existsSync(config.dbPath)) {
      await initJsonDb();
    }
    return;
  }

  setDbAccessMode('read-write');
  await initJsonDb();
  await seedIfEmpty();
  await migrateData();
  await migrateDbHygiene();
  await migrateWorkspaces();
  await migrateHalconeriaUsers();
  await ensureActivityTypes();
  await ensureDefaultClientGroups();
  await ensureDefaultDocumentTypeGroupsForAllWorkspaces();
  await ensureEventActivityLinks();
  await ensureHalconeriaInvoiceConcepts();
  await ensureWorkspaceAppearanceSettings();
}
