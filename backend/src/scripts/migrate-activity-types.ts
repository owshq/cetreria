import type { Activity } from '@shared/types';
import { initJsonDb } from '../db/store.js';
import { ensureActivityTypes } from '../db/activityTypes.js';
import { listAll } from '../db/repository.js';
import { DB_NAMES } from '../config.js';

await initJsonDb();
await ensureActivityTypes();
const types = await listAll(DB_NAMES.activityTypes);
const activities = await listAll<Activity>(DB_NAMES.activities);
console.log(`Tipos: ${types.length}`);
console.log('Actividades:', activities.map((a) => ({ id: a.id, type: a.type })));
