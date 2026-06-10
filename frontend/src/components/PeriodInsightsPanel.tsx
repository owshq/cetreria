import { useMemo, useState, type RefObject } from 'react';
import type { Activity, ActivityType, ClientScope, Document } from '@shared/types';
import { documentMetricsForRange } from '@shared/types';
import ClientActivityTypeChart, {
  type ChartMode,
} from '@/components/clientCharts/ClientActivityTypeChart';
import DocumentPeriodStats from '@/components/DocumentPeriodStats';
import InvoiceConceptsSection from '@/components/InvoiceConceptsSection';

type Props = {
  activities: Activity[];
  activityTypes: ActivityType[];
  documents: Document[];
  from: string;
  to: string;
  clientId?: ClientScope;
  invalidCustomRange?: boolean;
  showDocumentStats?: boolean;
  chartMode?: ChartMode;
  onChartModeChange?: (mode: ChartMode) => void;
  chartPanelRef?: RefObject<HTMLDivElement | null>;
  conceptsLayout?: 'default' | 'panel' | 'summary';
  documentStatsClassName?: string;
  /** Si es `false`, solo se muestran las métricas (p. ej. facturación del periodo). */
  chartsExpanded?: boolean;
  chartsPanelId?: string;
  chartsPanelClassName?: string;
  /** Oculta la sección de conceptos (p. ej. cuando se renderiza aparte). */
  hideConcepts?: boolean;
};

export default function PeriodInsightsPanel({
  activities,
  activityTypes,
  documents,
  from,
  to,
  clientId = 'all',
  invalidCustomRange = false,
  showDocumentStats = false,
  chartMode: controlledChartMode,
  onChartModeChange,
  chartPanelRef,
  conceptsLayout = 'summary',
  documentStatsClassName,
  chartsExpanded = true,
  chartsPanelId,
  chartsPanelClassName,
  hideConcepts = false,
}: Props) {
  const [internalChartMode, setInternalChartMode] = useState<ChartMode>('bars');
  const chartMode = controlledChartMode ?? internalChartMode;

  const handleChartModeChange = (mode: ChartMode) => {
    if (controlledChartMode === undefined) setInternalChartMode(mode);
    onChartModeChange?.(mode);
  };

  const documentMetrics = useMemo(
    () =>
      invalidCustomRange
        ? {
            paid: 0,
            sent: 0,
            draft: 0,
            total: 0,
            paidAmount: 0,
            sentAmount: 0,
            draftAmount: 0,
          }
        : documentMetricsForRange(documents, from, to, clientId),
    [documents, from, to, clientId, invalidCustomRange],
  );

  return (
    <>
      {showDocumentStats && !invalidCustomRange && (
        <DocumentPeriodStats
          paidAmount={documentMetrics.paidAmount}
          sentAmount={documentMetrics.sentAmount}
          draftCount={documentMetrics.draft}
          className={documentStatsClassName}
        />
      )}
      {chartsExpanded && (
        <div id={chartsPanelId} className={chartsPanelClassName}>
          <ClientActivityTypeChart
            activities={activities}
            activityTypes={activityTypes}
            mode={chartMode}
            onModeChange={handleChartModeChange}
            chartPanelRef={chartPanelRef}
            separated={showDocumentStats}
          />
          {!hideConcepts && (
            <InvoiceConceptsSection
              documents={documents}
              from={from}
              to={to}
              clientId={clientId}
              invalidCustomRange={invalidCustomRange}
              layout={conceptsLayout}
            />
          )}
        </div>
      )}
    </>
  );
}
