export const storageKeys = {
  token: 'token',
  user: 'user',
  workspaces: 'workspaces',
  workspace: 'workspace',
  themePreference: 'theme_preference',
  colorSchemeLegacy: 'color_scheme',
  appAccent: 'app_accent',
  appLogoSize: 'app_logo_size',
  sidebarCollapsed: 'sidebar_collapsed',
  secondarySidebarWidth: 'secondary_sidebar_width_px',
  topBarHidden: 'topbar_hidden',
  settingsTab: 'settings_tab',
  financialDocumentsTab: 'financial_documents_tab',
  dashboardPeriod: 'dashboard_metrics_period',
  dashboardChartsPanel: 'dashboard_charts_panel',
  clientDetailChartsPanel: 'client_detail_charts_panel',
  dashboardConceptsChartPanel: 'dashboard_concepts_chart_panel',
  dashboardActivitiesChartPanel: 'dashboard_activities_chart_panel',
  dashboardWorkShiftsChartPanel: 'dashboard_work_shifts_chart_panel',
  reportsPeriod: 'reports_period',
  reportsChartsPanel: 'reports_charts_panel',
  calendarViewMode: 'calendar_view_mode',
  scheduleViewMode: 'schedule_view_mode',
  activitiesDisplayMode: 'activities_display_mode',
  scheduleAllDisplayView: 'schedule_all_display_view',
  detectedCountry: 'detected_country_iso',
  tableViewsV2: 'table-views-v2',
  tableViewsV3: 'table-views-v3',
  helpTopic: 'help_topic',
} as const;

/** Claves antiguas: solo migracion automatica al leer. */
export const legacyStorageKeys = {
  token: ['crm_token'],
  user: ['crm_user'],
  workspaces: ['crm_workspaces'],
  workspace: ['crm_workspace_id'],
  themePreference: ['crm_theme_preference'],
  colorSchemeLegacy: ['crm_color_scheme'],
  appAccent: ['crm_app_accent'],
  appLogoSize: ['crm_app_logo_size'],
  sidebarCollapsed: ['crm_sidebar_collapsed'],
  secondarySidebarWidth: ['crm:secondary_sidebar_width_px'],
  topBarHidden: ['crm_topbar_hidden'],
  settingsTab: ['crm_settings_tab'],
  financialDocumentsTab: [],
  dashboardPeriod: ['crm_dashboard_metrics_period'],
  dashboardChartsPanel: [],
  clientDetailChartsPanel: [],
  dashboardConceptsChartPanel: [],
  dashboardActivitiesChartPanel: [],
  dashboardWorkShiftsChartPanel: [],
  reportsPeriod: ['crm_reports_period'],
  reportsChartsPanel: [],
  calendarViewMode: ['crm_calendar_view_mode'],
  scheduleAllDisplayView: [],
  detectedCountry: ['crm_detected_country_iso'],
  tableViewsV2: ['crm-table-views-v2'],
  tableViewsV3: ['crm-table-views-v3'],
  helpTopic: ['crm_help_topic'],
} as const satisfies Record<keyof typeof storageKeys, readonly string[]>;

export function readLocalStorage(
  key: string,
  legacyKeys: readonly string[] = [],
): string | null {
  try {
    const current = localStorage.getItem(key);
    if (current !== null) return current;

    for (const legacyKey of legacyKeys) {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy !== null) {
        localStorage.setItem(key, legacy);
        localStorage.removeItem(legacyKey);
        return legacy;
      }
    }
  } catch {
    // Ignore quota / private mode errors.
  }

  return null;
}

export function writeLocalStorage(
  key: string,
  value: string,
  legacyKeys: readonly string[] = [],
): void {
  try {
    localStorage.setItem(key, value);
    for (const legacyKey of legacyKeys) {
      localStorage.removeItem(legacyKey);
    }
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function removeLocalStorage(key: string, legacyKeys: readonly string[] = []): void {
  try {
    localStorage.removeItem(key);
    for (const legacyKey of legacyKeys) {
      localStorage.removeItem(legacyKey);
    }
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function readLocalStorageFor<K extends keyof typeof storageKeys>(
  storageKey: K,
): string | null {
  return readLocalStorage(storageKeys[storageKey], legacyStorageKeys[storageKey]);
}

export function writeLocalStorageFor<K extends keyof typeof storageKeys>(
  storageKey: K,
  value: string,
): void {
  writeLocalStorage(storageKeys[storageKey], value, legacyStorageKeys[storageKey]);
}

export function removeLocalStorageFor<K extends keyof typeof storageKeys>(
  storageKey: K,
): void {
  removeLocalStorage(storageKeys[storageKey], legacyStorageKeys[storageKey]);
}

/** Migra claves globales antiguas al arrancar la app. */
export function migrateLegacyStorage(): void {
  for (const key of Object.keys(storageKeys) as Array<keyof typeof storageKeys>) {
    readLocalStorageFor(key);
  }
}
