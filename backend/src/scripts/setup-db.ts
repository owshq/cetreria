import { bootstrapDb } from '../db/bootstrapDb.js';

async function main() {
  await bootstrapDb();
  console.log('Base de datos JSON lista.');
}

main().catch((err) => {
  console.error('No se pudo inicializar la base de datos JSON.', err);
  process.exit(1);
});
