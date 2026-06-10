import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_DURATION_MS = 700;

export function useSavedReportHighlight(durationMs = DEFAULT_DURATION_MS) {
  const [highlightedReportId, setHighlightedReportId] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const highlightReport = useCallback(
    (reportId: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setHighlightedReportId(reportId);
      timeoutRef.current = setTimeout(() => setHighlightedReportId(null), durationMs);
    },
    [durationMs],
  );

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  return { highlightedReportId, highlightReport };
}
