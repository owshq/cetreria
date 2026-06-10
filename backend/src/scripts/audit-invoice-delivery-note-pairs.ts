import type { Document } from '@shared/types';
import { listActivitiesWithInvoiceWithoutDeliveryNote } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { migrateData } from '../db/migrate.js';
import { migrateWorkspaces } from '../db/migrateWorkspaces.js';
import { listAll, updateDoc } from '../db/repository.js';
import { initJsonDb } from '../db/store.js';

function parseArgs(argv: string[]): { fix: boolean } {
  return { fix: argv.includes('--fix') };
}

async function main() {
  const { fix } = parseArgs(process.argv.slice(2));

  await initJsonDb();
  await migrateData();
  await migrateWorkspaces();

  const documents = await listAll<Document>(DB_NAMES.documents);
  const violations = listActivitiesWithInvoiceWithoutDeliveryNote(documents);

  if (violations.length === 0) {
    console.log('OK: no hay actividades con factura vinculada sin albaran.');
    return;
  }

  console.log(
    `Encontradas ${violations.length} actividad(es) con factura vinculada sin albaran:`,
  );

  for (const violation of violations) {
    const invoiceLabels = violation.invoices.map((doc) => doc.number).join(', ');
    console.log(`- actividad ${violation.activityId}: factura(s) ${invoiceLabels}`);
  }

  if (!fix) {
    console.log('');
    console.log('Ejecuta con --fix para desvincular esas facturas de la actividad.');
    process.exitCode = 1;
    return;
  }

  let fixed = 0;
  for (const violation of violations) {
    for (const invoice of violation.invoices) {
      const updated = await updateDoc<Document>(DB_NAMES.documents, invoice.id, {
        activityId: undefined,
      });
      if (updated) {
        fixed += 1;
        console.log(`Desvinculada ${invoice.number} de actividad ${violation.activityId}`);
      }
    }
  }

  console.log(`Listo: ${fixed} factura(s) desvinculada(s).`);
}

main().catch((err) => {
  console.error('Error al auditar pares factura/albaran:', err);
  process.exit(1);
});
