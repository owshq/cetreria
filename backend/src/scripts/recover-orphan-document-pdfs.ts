import { initJsonDb } from '../db/store.js';
import { migrateData } from '../db/migrate.js';
import { migrateWorkspaces } from '../db/migrateWorkspaces.js';
import { recoverOrphanDocumentPdfs } from '../db/recoverOrphanDocumentPdfs.js';
import { isS3Configured } from '../storage/s3.js';

async function main() {
  await initJsonDb();
  await migrateData();
  await migrateWorkspaces();

  console.log(`Almacenamiento S3: ${isS3Configured() ? 'configurado' : 'no configurado (local)'}`);

  const recovered = await recoverOrphanDocumentPdfs();
  if (recovered === 0) {
    console.log('No hay PDFs huérfanos que recuperar (o ya existen en la base de datos).');
  } else {
    console.log(`Listo: ${recovered} documento(s) restaurado(s) en db.json.`);
  }
}

main().catch((err) => {
  console.error('Error al recuperar documentos:', err);
  process.exit(1);
});
