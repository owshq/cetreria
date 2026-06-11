/**
 * Genera PDFs de operario con anexo detalle para validar paginacion.
 * Uso (PowerShell):
 * cd frontend; npx vite-node --config vite.config.ts ../scripts/validate-worker-annex-pdf.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkerActivityDetailRow } from '../frontend/src/lib/workerActivityDetailReport.ts';
import { buildSummaryReportPdf } from '../frontend/src/lib/summaryReportPdf.ts';

function mockDetailRow(index: number): WorkerActivityDetailRow {
  const day = String((index % 28) + 1).padStart(2, '0');
  return {
    activityId: `act-${index}`,
    date: `2026-01-${day}`,
    clientName: `Cliente ${index % 7}`,
    typeLabel: 'Mantenimiento',
    description: `Actividad de prueba numero ${index} con descripcion larga para validar salto de linea en PDF`,
    workerName: 'Operario Demo',
    plannedActivityHours: 4,
    plannedHours: 4,
    assignedHours: 3,
    reportedHours: index % 3 === 0 ? 2.5 : 0,
    workReportHours: index % 3 === 0 ? 2.5 : 0,
    signedHours: 0,
    reportHours: index % 3 === 0 ? 2.5 : 4,
    reportHoursSource: index % 3 === 0 ? 'work-report' : 'activity',
    reportHoursLabel: index % 3 === 0 ? 'Horas reportadas' : 'Horas registradas',
    reportStatus: index % 3 === 0 ? 'Enviado' : '-',
    zones: index % 2 === 0 ? 'Sala' : '-',
    zonesWorked: index % 2 === 0 ? 'Sala' : '-',
    notes: index % 4 === 0 ? 'Nota de prueba' : '-',
    workerNotes: index % 4 === 0 ? 'Nota de prueba' : '-',
    zonesNotes: '-',
    deliveryNoteNumber: index % 5 === 0 ? `A-${100 + index}` : null,
    deliveryNoteDate: index % 5 === 0 ? '2026-02-20' : null,
    linkedDocuments: index % 5 === 0 ? 'Albaran A-100' : '-',
    invoiceConcepts: '-',
    extraConcepts: '-',
    shiftLabel: '',
  };
}

async function main() {
  const outDir = join(process.cwd(), 'tmp', 'worker-annex-pdf');
  mkdirSync(outDir, { recursive: true });

  const counts = [1, 20, 50, 100];
  const summary: string[] = [];

  for (const count of counts) {
    const rows = Array.from({ length: count }, (_, index) => mockDetailRow(index + 1));
    const pdf = await buildSummaryReportPdf({
      reportKind: 'worker',
      periodLabel: 'Enero 2026',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      companyName: 'Demo Workspace',
      metrics: {
        clientScope: 'Operario Demo',
        clientsOrDocumentsLabel: 'Contactos atendidos',
        clientsOrDocumentsValue: 3,
        totalActivities: count,
        totalHours: count * 3,
        paidAmount: 0,
        paidCount: 0,
        sentCount: 0,
        sentAmount: 0,
        draftCount: 0,
        draftAmount: 0,
        contactsServed: 3,
      },
      invoiceConcepts: [],
      chartMode: 'hours',
      chartData: [],
      chartElement: null,
      narrative: {
        reportKind: 'worker',
        companyName: 'Demo Workspace',
        periodLabel: 'Enero 2026',
        clientScope: 'Operario Demo',
        totalClients: 3,
        totalWorkers: 1,
        totalActivities: count,
        totalHours: count * 3,
        paidAmount: 0,
        paidCount: 0,
        sentCount: 0,
        sentAmount: 0,
        draftCount: 0,
        draftAmount: 0,
        invoiceConcepts: [],
        chartMode: 'hours',
        chartData: [],
        comparison: { period: 'month', from: '2026-01-01', to: '2026-01-31' },
        activitiesChangePercent: null,
        hoursChangePercent: null,
        workerSignaturesEnabled: false,
        shiftSchedulingEnabled: false,
      },
      featureFlags: {
        workerSignaturesEnabled: false,
        shiftSchedulingEnabled: false,
      },
      workerActivityDetail: rows,
    });

    const pages = pdf.getNumberOfPages();
    const fileName = `operario-anexo-${count}-actividades.pdf`;
    const filePath = join(outDir, fileName);
    writeFileSync(filePath, Buffer.from(pdf.output('arraybuffer')));
    summary.push(`${count} actividades -> ${pages} paginas -> ${filePath}`);
  }

  console.log(summary.join('\n'));
}

void main();
