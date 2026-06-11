import type { ChartDatum } from '@/components/clientCharts/utils';
import { CHART_MODE_LABELS, type ChartMode } from '@/components/clientCharts/chartTypes';
import {
  formatChangePercent,
  getComparisonPeriodLabel,
  type MetricComparisonContext,
} from '@/lib/metricDelta';
import { formatDocumentAmount, type DocumentConceptSummary } from '@shared/types';
import type { ReportKind } from '@shared/types';

export function isSingleDayReport(dateFrom: string, dateTo: string): boolean {
  return dateFrom === dateTo;
}

export function getReportPeriodScopeLabel(dateFrom: string, dateTo: string): string {
  return isSingleDayReport(dateFrom, dateTo) ? 'Informe del día' : 'Informe del periodo';
}

export type ReportBreakdownRow = {
  name: string;
  activities: number;
  hours: number;
  /** Total documentos cuando no hay desglose por tipo (snapshots legacy). */
  documents: number;
  deliveryNoteCount?: number;
  invoiceCount?: number;
  paidAmount: number;
  /** Horas firmadas (desglose de operarios). */
  signedHours?: number;
  pendingHours?: number;
  signedActivities?: number;
  unsignedActivities?: number;
};

export type TeamShiftBreakdownRow = {
  shiftLabel: string;
  assignedHours: number;
  signedHours: number;
};

export type ReportFeatureFlags = {
  workerSignaturesEnabled?: boolean;
  shiftSchedulingEnabled?: boolean;
};

export type ReportNarrativeInput = ReportFeatureFlags & {
  reportKind: ReportKind;
  companyName: string;
  periodLabel: string;
  clientScope: string;
  totalClients: number;
  totalWorkers: number;
  totalActivities: number;
  totalHours: number;
  paidAmount: number;
  paidCount: number;
  sentCount: number;
  sentAmount: number;
  draftCount: number;
  draftAmount: number;
  invoiceConcepts: DocumentConceptSummary[];
  chartMode: ChartMode;
  chartData: ChartDatum[];
  comparison: MetricComparisonContext;
  activitiesChangePercent: number | null;
  hoursChangePercent: number | null;
  clientBreakdown?: ReportBreakdownRow[];
  workerBreakdown?: ReportBreakdownRow[];
  teamAssignedHours?: number;
  teamSignedHours?: number;
  teamPendingHours?: number;
  teamSignedActivities?: number;
  teamUnsignedActivities?: number;
  teamShiftBreakdown?: TeamShiftBreakdownRow[];
};

const REPORT_SUBTITLE: Record<Exclude<ReportKind, 'workers_global'>, string> = {
  general: 'Visión consolidada de operaciones, contactos y documentación',
  contacts_global: 'Comparativa de dedicación y facturación por cliente',
  contact: 'Seguimiento individual de actividad y ciclo documental',
  worker: 'Productividad, cartera atendida y documentación del operario',
};

function buildWorkersGlobalSubtitle(flags?: ReportFeatureFlags): string {
  const extra: string[] = [];
  if (flags?.workerSignaturesEnabled) extra.push('firmas');
  if (flags?.shiftSchedulingEnabled) extra.push('turnos');
  if (extra.length === 0) return 'Carga de trabajo y actividades por operario';
  return `Carga de trabajo, ${extra.join(', ')} y actividades por operario`;
}

function workersGlobalIntroScopeLine(input: ReportNarrativeInput): string {
  const parts = ['actividades'];
  if (input.shiftSchedulingEnabled) parts.push('horas por turno');
  if (input.workerSignaturesEnabled) parts.push('estado de firmas (firmadas vs pendientes)');
  return `Incluye ${parts.join(', ')}.`;
}

export function getReportSubtitle(kind: ReportKind, flags?: ReportFeatureFlags): string {
  if (kind === 'workers_global') return buildWorkersGlobalSubtitle(flags);
  return REPORT_SUBTITLE[kind];
}

function formatTrendBullet(
  percent: number | null,
  metric: string,
  comparison: MetricComparisonContext,
): string {
  const reference = getComparisonPeriodLabel(comparison);
  const { text } = formatChangePercent(percent, comparison);
  if (percent == null) {
    return `${metric}: sin referencia en ${reference} para comparar.`;
  }
  if (percent === 0) {
    return `${metric}: estable respecto a ${reference} (${text}).`;
  }
  if (percent > 0) {
    return `${metric}: incremento del ${Math.abs(percent)}% respecto a ${reference}.`;
  }
  return `${metric}: descenso del ${Math.abs(percent)}% respecto a ${reference}.`;
}

function documentStatusLine(input: ReportNarrativeInput): string {
  const parts: string[] = [];
  if (input.paidCount > 0) {
    parts.push(`${input.paidCount} pagados (${formatDocumentAmount(input.paidAmount)})`);
  }
  if (input.sentCount > 0) {
    parts.push(
      `${input.sentCount} enviados (${formatDocumentAmount(input.sentAmount)})`,
    );
  }
  if (input.draftCount > 0) {
    parts.push(
      `${input.draftCount} borradores (${formatDocumentAmount(input.draftAmount)})`,
    );
  }
  if (parts.length === 0) return 'Documentación: ningún documento registrado en el periodo.';
  return `Documentación: ${parts.join(' · ')}.`;
}

function topConceptBullet(concepts: DocumentConceptSummary[]): string | null {
  if (concepts.length === 0) return null;
  const top = concepts[0];
  return `Principal concepto facturado: «${top.description}» — ${formatDocumentAmount(top.totalAmount)} en ${top.invoiceCount} documento${top.invoiceCount === 1 ? '' : 's'}.`;
}

function chartActivityConclusions(input: ReportNarrativeInput): string[] {
  if (input.chartData.length === 0) {
    return [
      'No hay horas registradas por tipo de actividad en el periodo analizado.',
      'Conviene revisar la planificación o ampliar el intervalo temporal.',
    ];
  }

  const leading = input.chartData[0];
  const topThree = input.chartData.slice(0, 3);
  const topThreeHours = topThree.reduce((sum, row) => sum + row.hours, 0);
  const concentration =
    input.totalHours > 0 ? Math.round((topThreeHours / input.totalHours) * 100) : 0;

  const bullets = [
    `El tipo «${leading.label}» concentra ${leading.percent}% del tiempo (${leading.hours} h).`,
  ];

  if (input.chartData.length >= 2) {
    const second = input.chartData[1];
    bullets.push(
      `Segundo en dedicación: «${second.label}» con ${second.hours} h (${second.percent}%).`,
    );
  }

  if (concentration >= 70 && input.chartData.length >= 3) {
    bullets.push(
      `Los tres tipos principales suman ${concentration}% de las horas: alta concentración de esfuerzo.`,
    );
  } else if (input.chartData.length >= 3) {
    bullets.push(
      `Distribución relativamente equilibrada entre tipos (top 3: ${concentration}% de horas).`,
    );
  }

  return bullets;
}

function chartSecondaryConclusions(input: ReportNarrativeInput): string[] {
  const { reportKind } = input;

  if (reportKind === 'contact' || reportKind === 'worker') {
    const hasDocs = input.paidCount + input.sentCount + input.draftCount > 0;
    if (!hasDocs) {
      return [
        'Sin documentos en el periodo: la actividad no tiene reflejo documental.',
        'Valorar emitir o registrar facturación vinculada a las horas trabajadas.',
      ];
    }
    if (input.draftCount > 0 && input.paidCount === 0) {
      return [
        'Predominan borradores: la facturación aún no está cerrada.',
        'Priorizar emisión y cobro para cerrar el ciclo comercial del periodo.',
      ];
    }
    if (input.sentCount > 0 && input.paidAmount < input.sentAmount) {
      return [
        'Hay documentos enviados pendientes de cobro.',
        'Hacer seguimiento de cobros para alinear facturación con la actividad registrada.',
      ];
    }
    return [
      documentStatusLine(input),
      'La documentación del periodo está alineada con la actividad registrada.',
    ];
  }

  const rows =
    reportKind === 'workers_global'
      ? input.workerBreakdown
      : input.clientBreakdown;

  if (!rows?.length) {
    return [
      'Sin desglose comparativo en el periodo.',
      'Ampliar el rango de fechas o registrar actividad para obtener comparativas.',
    ];
  }

  const top = rows[0];
  const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);
  const topShare = totalHours > 0 ? Math.round((top.hours / totalHours) * 100) : 0;
  const entityLabel =
    reportKind === 'workers_global' ? 'operario' : 'contacto';

  const bullets = [
    `${top.name} lidera con ${top.hours} h (${topShare}% del total) y ${top.activities} actividades.`,
  ];

  if (rows.length >= 2) {
    const runner = rows[1];
    bullets.push(
      `Segundo ${entityLabel}: ${runner.name} (${runner.hours} h · ${formatDocumentAmount(runner.paidAmount)} cobrados).`,
    );
  }

  const concentration = breakdownConcentrationLine(rows, entityLabel === 'operario' ? 'operarios' : 'contactos');
  if (concentration) bullets.push(concentration);

  return bullets;
}

function breakdownTopLine(
  rows: ReportBreakdownRow[] | undefined,
  label: string,
): string | null {
  if (!rows?.length) return null;
  const top = rows[0];
  return `${label} con mayor dedicación: ${top.name} (${top.hours} h · ${top.activities} actividades).`;
}

function breakdownConcentrationLine(rows: ReportBreakdownRow[] | undefined, label: string): string | null {
  if (!rows || rows.length < 2) return null;
  const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);
  if (totalHours <= 0) return null;
  const topThreeHours = rows.slice(0, 3).reduce((sum, row) => sum + row.hours, 0);
  const share = Math.round((topThreeHours / totalHours) * 100);
  return `Los tres primeros ${label} concentran el ${share}% de las horas del periodo.`;
}

export function buildReportIntroduction(input: ReportNarrativeInput): string[] {
  const bullets = [
    `Periodo analizado: ${input.periodLabel}.`,
    `Ámbito: ${input.clientScope}.`,
    `Registro operativo: ${input.totalActivities} actividades y ${input.totalHours} horas documentadas.`,
    documentStatusLine(input),
  ];

  if (input.reportKind === 'general') {
    bullets.push(
      `Alcance: ${input.totalClients} contacto${input.totalClients === 1 ? '' : 's'} con datos · ${input.totalWorkers} operario${input.totalWorkers === 1 ? '' : 's'} con actividad.`,
      'Este informe integra contactos, operarios, tipos de actividad y documentación del periodo.',
    );
  } else if (input.reportKind === 'contacts_global') {
    bullets.push(
      `${input.totalClients} cliente${input.totalClients === 1 ? '' : 's'} con actividad o documentación en el periodo.`,
      'Permite comparar dedicación, documentos y facturación entre clientes.',
    );
  } else if (input.reportKind === 'contact') {
    bullets.push('Informe individual: evolución de dedicación, tipos de trabajo y ciclo documental.');
  } else if (input.reportKind === 'workers_global') {
    bullets.push(
      `${input.totalWorkers} operario${input.totalWorkers === 1 ? '' : 's'} con registro en el periodo.`,
      workersGlobalIntroScopeLine(input),
    );
    if (input.teamAssignedHours != null && input.teamAssignedHours > 0) {
      if (input.workerSignaturesEnabled) {
        bullets.push(
          `Horas asignadas: ${input.teamAssignedHours} h · firmadas: ${input.teamSignedHours ?? 0} h · pendientes: ${input.teamPendingHours ?? 0} h.`,
        );
      } else {
        bullets.push(`Horas registradas: ${input.teamAssignedHours} h.`);
      }
    }
    if (
      input.workerSignaturesEnabled &&
      input.teamSignedActivities != null &&
      (input.teamSignedActivities > 0 || (input.teamUnsignedActivities ?? 0) > 0)
    ) {
      bullets.push(
        `Actividades: ${input.teamSignedActivities} con firma completa · ${input.teamUnsignedActivities ?? 0} con firma pendiente.`,
      );
    }
  } else if (input.reportKind === 'worker') {
    bullets.push(
      `Cartera atendida: ${input.totalClients} contacto${input.totalClients === 1 ? '' : 's'}.`,
      'Informe individual: productividad, distribución por contacto y documentación.',
    );
  }

  return bullets;
}

export function buildReportAnalysis(input: ReportNarrativeInput): string[] {
  const bullets: string[] = [
    formatTrendBullet(input.activitiesChangePercent, 'Actividades registradas', input.comparison),
    formatTrendBullet(input.hoursChangePercent, 'Horas documentadas', input.comparison),
    documentStatusLine(input),
  ];

  const conceptBullet = topConceptBullet(input.invoiceConcepts);
  if (conceptBullet) bullets.push(conceptBullet);

  if (input.chartData.length > 0) {
    const leading = input.chartData[0];
    bullets.push(
      `Distribución por tipo: «${leading.label}» representa el ${leading.percent}% (${leading.hours} h).`,
    );
  }

  if (input.reportKind === 'general') {
    const clientTop = breakdownTopLine(input.clientBreakdown, 'Contacto');
    const workerTop = breakdownTopLine(input.workerBreakdown, 'Operario');
    if (clientTop) bullets.push(clientTop);
    if (workerTop) bullets.push(workerTop);
    const clientConc = breakdownConcentrationLine(input.clientBreakdown, 'contactos');
    const workerConc = breakdownConcentrationLine(input.workerBreakdown, 'operarios');
    if (clientConc) bullets.push(clientConc);
    if (workerConc) bullets.push(workerConc);
  }

  if (input.reportKind === 'contacts_global') {
    const clientTop = breakdownTopLine(input.clientBreakdown, 'Contacto');
    if (clientTop) bullets.push(clientTop);
    const clientConc = breakdownConcentrationLine(input.clientBreakdown, 'contactos');
    if (clientConc) bullets.push(clientConc);
    if (input.totalClients > 0 && input.totalHours > 0) {
      const avg = (input.totalHours / input.totalClients).toFixed(1);
      bullets.push(`Media de dedicación: ${avg} h por contacto con datos.`);
    }
  }

  if (input.reportKind === 'contact') {
    if (input.totalActivities > 0) {
      const avg = (input.totalHours / input.totalActivities).toFixed(1);
      bullets.push(`Duración media por actividad: ${avg} h.`);
    }
    if (input.paidAmount > 0 && input.totalHours > 0) {
      const revenuePerHour = input.paidAmount / input.totalHours;
      bullets.push(
        `Rendimiento documentado: ${formatDocumentAmount(revenuePerHour)} de ingreso por hora trabajada.`,
      );
    }
  }

  if (input.reportKind === 'workers_global') {
    const workerTop = breakdownTopLine(input.workerBreakdown, 'Operario');
    if (workerTop) bullets.push(workerTop);
    const workerConc = breakdownConcentrationLine(input.workerBreakdown, 'operarios');
    if (workerConc) bullets.push(workerConc);
    if (
      input.workerSignaturesEnabled &&
      input.teamAssignedHours != null &&
      input.teamAssignedHours > 0
    ) {
      const signedShare = Math.round(
        ((input.teamSignedHours ?? 0) / input.teamAssignedHours) * 100,
      );
      bullets.push(
        `Cobertura de firmas: ${signedShare}% de las horas asignadas están firmadas en el periodo.`,
      );
    }
    const leadingShift = input.teamShiftBreakdown?.[0];
    if (input.shiftSchedulingEnabled && leadingShift && leadingShift.assignedHours > 0) {
      bullets.push(
        `Turno con más horas asignadas: ${leadingShift.shiftLabel} (${leadingShift.assignedHours} h).`,
      );
    }
    if (input.totalWorkers > 0 && (input.teamAssignedHours ?? 0) > 0) {
      const avg = ((input.teamAssignedHours ?? 0) / input.totalWorkers).toFixed(1);
      const loadLabel = input.workerSignaturesEnabled ? 'carga asignada' : 'horas registradas';
      bullets.push(`Media de ${loadLabel}: ${avg} h por operario con actividad.`);
    }
  }

  if (input.reportKind === 'worker') {
    if (input.totalActivities > 0) {
      const avg = (input.totalHours / input.totalActivities).toFixed(1);
      bullets.push(`Duración media por actividad asignada: ${avg} h.`);
    }
    const clientTop = breakdownTopLine(input.clientBreakdown, 'Contacto atendido');
    if (clientTop) bullets.push(clientTop);
  }

  return bullets;
}

export function buildChart1Conclusions(input: ReportNarrativeInput): string[] {
  const header = `Interpretación — distribución por tipo (${CHART_MODE_LABELS[input.chartMode]}):`;
  return [header, ...chartActivityConclusions(input)];
}

export function buildChart2Conclusions(input: ReportNarrativeInput): string[] {
  const titles: Record<ReportKind, string> = {
    general: 'Interpretación — contactos con mayor dedicación',
    contacts_global: 'Interpretación — ranking de clientes',
    contact: 'Interpretación — estado de la documentación',
    workers_global: 'Interpretación — ranking de operarios',
    worker: 'Interpretación — contactos atendidos por el operario',
  };
  return [titles[input.reportKind], ...chartSecondaryConclusions(input)];
}

export function buildReportConclusions(input: ReportNarrativeInput): string[] {
  const hasDocuments = input.paidCount + input.sentCount + input.draftCount > 0;

  if (input.totalActivities === 0 && !hasDocuments) {
    return [
      'El periodo no registra actividad ni documentación.',
      'Revisar planificación, asignaciones y calendario antes del siguiente cierre.',
      `Documento generado por ${input.companyName} — uso interno de seguimiento.`,
    ];
  }

  if (input.totalActivities === 0 && hasDocuments) {
    return [
      'Existe documentación sin actividades asociadas en el periodo.',
      'Contrastar facturación con intervenciones planificadas para detectar desajustes.',
      `Documento generado por ${input.companyName} — uso interno de seguimiento.`,
    ];
  }

  const bullets: string[] = [];

  switch (input.reportKind) {
    case 'general':
      bullets.push(
        'El informe general permite alinear esfuerzo operativo (horas y tipos) con la facturación del periodo.',
        'Utilice los desgloses y gráficos para detectar concentración de trabajo o contactos con baja documentación.',
        'Acción recomendada: revisar contactos y operarios del top 3 con borradores o envíos sin cobrar.',
      );
      break;
    case 'contacts_global':
      bullets.push(
        'Compare clientes no solo por horas, sino por actividades, documentos y importe cobrado.',
        'Priorice seguimiento en clientes con actividad pero sin facturación cerrada.',
        'Acción recomendada: planificar revisión comercial en clientes con mayor volumen de borradores.',
      );
      break;
    case 'contact':
      bullets.push(
        'Mantenga coherencia entre dedicación registrada, tipos de actividad y ciclo documental.',
        'Revise borradores pendientes y documentos enviados sin cobro antes de cerrar el periodo.',
        'Acción recomendada: confirmar próximas intervenciones y estado de cobros con el cliente.',
      );
      break;
    case 'workers_global': {
      const focusParts = ['equilibrio de carga entre operarios'];
      if (input.workerSignaturesEnabled) focusParts.push('firmas pendientes');
      if (input.shiftSchedulingEnabled) focusParts.push('distribución por turnos');
      bullets.push(`Evalúe ${focusParts.join(', ')}.`);
      if (input.workerSignaturesEnabled) {
        bullets.push(
          'Detecte operarios con horas asignadas sin firmar o actividades sin cierre de jornada.',
        );
        bullets.push(
          'Acción recomendada: priorizar firmas pendientes y revisar turnos con mayor desviación asignado/firmado.',
        );
      } else if (input.shiftSchedulingEnabled) {
        bullets.push('Compare dedicación entre turnos y operarios con mayor volumen de actividades.');
        bullets.push('Acción recomendada: revisar turnos con mayor concentración de horas.');
      } else {
        bullets.push('Compare dedicación y documentación generada entre operarios.');
        bullets.push('Acción recomendada: revisar operarios con mayor volumen y cierre documental pendiente.');
      }
      break;
    }
    case 'worker':
      bullets.push(
        'Valore productividad del operario en horas, contactos atendidos y documentación generada.',
        'Identifique contactos con actividad recurrente pero sin reflejo en facturación.',
        'Acción recomendada: alinear agenda del operario con cierre documental pendiente.',
      );
      break;
  }

  bullets.push(`Documento generado por ${input.companyName} — uso interno de seguimiento.`);

  return bullets;
}
