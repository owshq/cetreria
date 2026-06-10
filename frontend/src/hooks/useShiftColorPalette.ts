import { useMemo } from 'react';
import { buildShiftColorMap, type ShiftColorMap } from '@/lib/shiftColorPalette';
import { useChartThemeVersion } from '@/hooks/useChartThemeVersion';

export function useShiftColorPalette(): ShiftColorMap {
  const chartThemeVersion = useChartThemeVersion();
  return useMemo(() => buildShiftColorMap(), [chartThemeVersion]);
}
