export type WorkspaceFontOption = {
  id: string;
  label: string;
  family: string;
  googleSpec: string;
  stack: string;
};

export const DEFAULT_WORKSPACE_HEADING_FONT_ID = 'oswald';
export const DEFAULT_WORKSPACE_SUBTITLE_FONT_ID = 'montserrat';

const SANS_FALLBACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export const WORKSPACE_HEADING_FONT_OPTIONS: readonly WorkspaceFontOption[] = [
  {
    id: 'oswald',
    label: 'Oswald',
    family: 'Oswald',
    googleSpec: 'Oswald:wght@600;700',
    stack: `'Oswald', ${SANS_FALLBACK}`,
  },
  {
    id: 'bebas-neue',
    label: 'Bebas Neue',
    family: 'Bebas Neue',
    googleSpec: 'Bebas+Neue',
    stack: `'Bebas Neue', ${SANS_FALLBACK}`,
  },
  {
    id: 'barlow-condensed',
    label: 'Barlow Condensed',
    family: 'Barlow Condensed',
    googleSpec: 'Barlow+Condensed:wght@600;700',
    stack: `'Barlow Condensed', ${SANS_FALLBACK}`,
  },
  {
    id: 'raleway',
    label: 'Raleway',
    family: 'Raleway',
    googleSpec: 'Raleway:wght@600;700',
    stack: `'Raleway', ${SANS_FALLBACK}`,
  },
  {
    id: 'anton',
    label: 'Anton',
    family: 'Anton',
    googleSpec: 'Anton',
    stack: `'Anton', ${SANS_FALLBACK}`,
  },
  {
    id: 'roboto-slab',
    label: 'Roboto Slab',
    family: 'Roboto Slab',
    googleSpec: 'Roboto+Slab:wght@600;700',
    stack: `'Roboto Slab', serif`,
  },
] as const;

export const WORKSPACE_SUBTITLE_FONT_OPTIONS: readonly WorkspaceFontOption[] = [
  {
    id: 'montserrat',
    label: 'Montserrat',
    family: 'Montserrat',
    googleSpec: 'Montserrat:wght@400;500;600',
    stack: `'Montserrat', ${SANS_FALLBACK}`,
  },
  {
    id: 'inter',
    label: 'Inter',
    family: 'Inter',
    googleSpec: 'Inter:wght@400;500;600',
    stack: `'Inter', ${SANS_FALLBACK}`,
  },
  {
    id: 'lato',
    label: 'Lato',
    family: 'Lato',
    googleSpec: 'Lato:wght@400;700',
    stack: `'Lato', ${SANS_FALLBACK}`,
  },
  {
    id: 'source-sans-3',
    label: 'Source Sans 3',
    family: 'Source Sans 3',
    googleSpec: 'Source+Sans+3:wght@400;500;600',
    stack: `'Source Sans 3', ${SANS_FALLBACK}`,
  },
  {
    id: 'nunito-sans',
    label: 'Nunito Sans',
    family: 'Nunito Sans',
    googleSpec: 'Nunito+Sans:wght@400;600;700',
    stack: `'Nunito Sans', ${SANS_FALLBACK}`,
  },
  {
    id: 'open-sans',
    label: 'Open Sans',
    family: 'Open Sans',
    googleSpec: 'Open+Sans:wght@400;500;600',
    stack: `'Open Sans', ${SANS_FALLBACK}`,
  },
] as const;

export function resolveWorkspaceHeadingFont(fontId: string | undefined): WorkspaceFontOption {
  return (
    WORKSPACE_HEADING_FONT_OPTIONS.find((option) => option.id === fontId) ??
    WORKSPACE_HEADING_FONT_OPTIONS.find((option) => option.id === DEFAULT_WORKSPACE_HEADING_FONT_ID)!
  );
}

export function resolveWorkspaceSubtitleFont(fontId: string | undefined): WorkspaceFontOption {
  return (
    WORKSPACE_SUBTITLE_FONT_OPTIONS.find((option) => option.id === fontId) ??
    WORKSPACE_SUBTITLE_FONT_OPTIONS.find(
      (option) => option.id === DEFAULT_WORKSPACE_SUBTITLE_FONT_ID,
    )!
  );
}

export function normalizeWorkspaceHeadingFontId(value: unknown): string {
  if (
    typeof value === 'string' &&
    WORKSPACE_HEADING_FONT_OPTIONS.some((option) => option.id === value)
  ) {
    return value;
  }
  return DEFAULT_WORKSPACE_HEADING_FONT_ID;
}

export function normalizeWorkspaceSubtitleFontId(value: unknown): string {
  if (
    typeof value === 'string' &&
    WORKSPACE_SUBTITLE_FONT_OPTIONS.some((option) => option.id === value)
  ) {
    return value;
  }
  return DEFAULT_WORKSPACE_SUBTITLE_FONT_ID;
}

export function buildWorkspaceTypographyGoogleFontsUrl(
  fonts: readonly WorkspaceFontOption[],
): string {
  const specs = [...new Set(fonts.map((font) => font.googleSpec))];
  return `https://fonts.googleapis.com/css2?family=${specs.join('&family=')}&display=swap`;
}
