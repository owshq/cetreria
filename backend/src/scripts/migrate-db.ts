import { initJsonDb } from '../db/store.js';
import { migrateData } from '../db/migrate.js';

await initJsonDb();
await migrateData();
console.log('Migración completada.');
