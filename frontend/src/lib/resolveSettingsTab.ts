export type SettingsTab =
  | 'profile'
  | 'signature'
  | 'schedule'
  | 'appearance'
  | 'company'
  | 'activity-types'
  | 'financial-documents'
  | 'users';

export function isSettingsTab(value: unknown): value is SettingsTab {
  return (
    value === 'profile' ||
    value === 'signature' ||
    value === 'schedule' ||
    value === 'appearance' ||
    value === 'activity-types' ||
    value === 'financial-documents' ||
    value === 'users' ||
    value === 'company'
  );
}

function migrateSavedSettingsTab(
  saved: string | null | undefined,
  availableTabs: SettingsTab[],
): SettingsTab | null {
  if (!saved) return null;

  if (saved === 'shift-hours' && availableTabs.includes('schedule')) {
    return 'schedule';
  }
  if (saved === 'company' && availableTabs.includes('company')) {
    return 'company';
  }
  if (saved === 'features' && availableTabs.includes('company')) {
    return 'company';
  }
  if (
    (saved === 'document-formats' ||
      saved === 'document-template' ||
      saved === 'invoice-concepts') &&
    availableTabs.includes('financial-documents')
  ) {
    return 'financial-documents';
  }
  if (isSettingsTab(saved) && availableTabs.includes(saved)) {
    return saved;
  }

  return null;
}

type DefaultSettingsTabInput = {
  availableTabs: SettingsTab[];
  isAdmin: boolean;
  workerSignaturesEnabled: boolean;
  hasSignature: boolean;
};

export function resolveDefaultSettingsTab({
  availableTabs,
  isAdmin,
  workerSignaturesEnabled,
  hasSignature,
}: DefaultSettingsTabInput): SettingsTab {
  if (isAdmin && availableTabs.includes('company')) {
    return 'company';
  }
  if (
    workerSignaturesEnabled &&
    !hasSignature &&
    availableTabs.includes('signature')
  ) {
    return 'signature';
  }
  if (availableTabs.includes('schedule')) {
    return 'schedule';
  }
  if (availableTabs.includes('signature')) {
    return 'signature';
  }
  return availableTabs[0] ?? 'profile';
}

type ResolveSettingsTabInput = DefaultSettingsTabInput & {
  savedTab?: string | null;
  preferredTab?: string | null;
};

export function resolveSettingsTab({
  availableTabs,
  savedTab,
  preferredTab,
  isAdmin,
  workerSignaturesEnabled,
  hasSignature,
}: ResolveSettingsTabInput): SettingsTab {
  if (
    preferredTab &&
    isSettingsTab(preferredTab) &&
    availableTabs.includes(preferredTab)
  ) {
    return preferredTab;
  }

  const migrated = migrateSavedSettingsTab(savedTab, availableTabs);
  if (migrated) return migrated;

  return resolveDefaultSettingsTab({
    availableTabs,
    isAdmin,
    workerSignaturesEnabled,
    hasSignature,
  });
}
