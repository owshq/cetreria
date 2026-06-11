import { useEffect } from 'react';
import { authService } from '@/api';
import { workspaceAppearanceSettingsService } from '@/api/workspaceAppearanceSettings';
import { APP_EVENTS } from '@/lib/appEvents';
import {
  applyDefaultWorkspaceTypography,
  applyWorkspaceTypography,
} from '@/lib/workspaceTypography';
import { useWorkspace } from '@/context/WorkspaceContext';

export function useWorkspaceTypography(): void {
  const { currentWorkspace, loading } = useWorkspace();

  useEffect(() => {
    if (!authService.isAuthenticated() || loading || !currentWorkspace) {
      applyDefaultWorkspaceTypography();
      return;
    }

    let cancelled = false;

    const loadTypography = async () => {
      try {
        const settings = await workspaceAppearanceSettingsService.get();
        if (cancelled) return;
        applyWorkspaceTypography(settings.headingFontId, settings.subtitleFontId);
      } catch {
        if (!cancelled) {
          applyDefaultWorkspaceTypography();
        }
      }
    };

    void loadTypography();

    const onTypographyUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ headingFontId: string; subtitleFontId: string }>)
        .detail;
      if (detail?.headingFontId && detail?.subtitleFontId) {
        applyWorkspaceTypography(detail.headingFontId, detail.subtitleFontId);
        return;
      }
      void loadTypography();
    };

    window.addEventListener(APP_EVENTS.workspaceTypographyUpdated, onTypographyUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(APP_EVENTS.workspaceTypographyUpdated, onTypographyUpdated);
    };
  }, [currentWorkspace?.id, loading]);
}
