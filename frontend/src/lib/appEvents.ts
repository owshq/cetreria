export const APP_EVENTS = {
  authSessionChanged: 'app:auth-session-changed',
  userUpdated: 'app:user-updated',
  colorSchemeUpdated: 'app:color-scheme-updated',
  appAccentUpdated: 'app:app-accent-updated',
  appLogoUpdated: 'app:app-logo-updated',
  appLogoSizeUpdated: 'app:app-logo-size-updated',
  appFaviconUpdated: 'app:app-favicon-updated',
  workspaceTypographyUpdated: 'app:workspace-typography-updated',
  notificationsReceived: 'app:notifications-received',
} as const;

export type AppEventName = (typeof APP_EVENTS)[keyof typeof APP_EVENTS];
