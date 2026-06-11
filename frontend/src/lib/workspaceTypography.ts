import {
  buildWorkspaceTypographyGoogleFontsUrl,
  DEFAULT_WORKSPACE_HEADING_FONT_ID,
  DEFAULT_WORKSPACE_SUBTITLE_FONT_ID,
  resolveWorkspaceHeadingFont,
  resolveWorkspaceSubtitleFont,
  type WorkspaceFontOption,
} from '@shared/types';
import { APP_EVENTS } from './appEvents';

const GOOGLE_FONTS_LINK_ID = 'workspace-typography-fonts';

function ensureGoogleFontsLoaded(fonts: readonly WorkspaceFontOption[]): void {
  if (typeof document === 'undefined') return;

  const href = buildWorkspaceTypographyGoogleFontsUrl(fonts);
  let link = document.getElementById(GOOGLE_FONTS_LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = GOOGLE_FONTS_LINK_ID;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (link.href !== href) {
    link.href = href;
  }
}

export function applyWorkspaceTypography(
  headingFontId: string = DEFAULT_WORKSPACE_HEADING_FONT_ID,
  subtitleFontId: string = DEFAULT_WORKSPACE_SUBTITLE_FONT_ID,
): void {
  if (typeof document === 'undefined') return;

  const heading = resolveWorkspaceHeadingFont(headingFontId);
  const subtitle = resolveWorkspaceSubtitleFont(subtitleFontId);

  document.documentElement.style.setProperty('--font-heading', heading.stack);
  document.documentElement.style.setProperty('--font-description', subtitle.stack);
  ensureGoogleFontsLoaded([heading, subtitle]);
}

export function applyDefaultWorkspaceTypography(): void {
  applyWorkspaceTypography();
}

export function dispatchWorkspaceTypographyUpdated(
  headingFontId: string,
  subtitleFontId: string,
): void {
  window.dispatchEvent(
    new CustomEvent(APP_EVENTS.workspaceTypographyUpdated, {
      detail: { headingFontId, subtitleFontId },
    }),
  );
}
