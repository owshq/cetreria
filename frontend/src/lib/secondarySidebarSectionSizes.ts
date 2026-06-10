export const SECONDARY_SIDEBAR_SECTION_MIN_HEIGHT_PX = 120;
export const SECONDARY_SIDEBAR_DIVIDER_HIT_HEIGHT_PX = 16;
/** Incrementar al cambiar el reparto por defecto para invalidar layouts guardados antiguos. */
export const SECONDARY_SIDEBAR_SECTIONS_LAYOUT_VERSION = 2;

export type SecondarySidebarSectionSpec = {
  id: string;
  minHeight?: number;
  maxHeight?: number;
};

export type StoredSecondarySidebarSizes = {
  heights: number[];
};

export type SecondarySidebarSectionHeightsPayload = StoredSecondarySidebarSizes & {
  sectionIds: string[];
  version: number;
};

export const SECONDARY_SIDEBAR_SECTIONS_INTERACTION_PREFIX = 'secondary-sidebar-sections';

export function secondarySidebarSectionsStorageKey(storageKey: string): string {
  return `secondary_sidebar_sections:${storageKey}`;
}

export function secondarySidebarSectionsInteractionKey(storageKey: string): string {
  return `${SECONDARY_SIDEBAR_SECTIONS_INTERACTION_PREFIX}:${storageKey}`;
}

export function sectionIdsFromSpecs(specs: SecondarySidebarSectionSpec[]): string[] {
  return specs.map((spec) => spec.id);
}

export function parseSecondarySidebarSectionHeightsPayload(
  payload: unknown,
  sectionIds: string[],
): number[] | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Partial<SecondarySidebarSectionHeightsPayload>;
  if (!Array.isArray(record.heights) || !Array.isArray(record.sectionIds)) return null;
  if (record.sectionIds.join('|') !== sectionIds.join('|')) return null;
  if (
    record.version != null &&
    record.version !== SECONDARY_SIDEBAR_SECTIONS_LAYOUT_VERSION
  ) {
    return null;
  }

  const resizableCount = Math.max(0, sectionIds.length - 1);
  const heights = record.heights.filter(
    (value) => typeof value === 'number' && Number.isFinite(value),
  );
  if (heights.length !== resizableCount) return null;
  return heights;
}

export function buildSecondarySidebarSectionHeightsPayload(
  heights: number[],
  sectionIds: string[],
): SecondarySidebarSectionHeightsPayload {
  return {
    heights,
    sectionIds,
    version: SECONDARY_SIDEBAR_SECTIONS_LAYOUT_VERSION,
  };
}

function legacyStorageKeyFor(key: string) {
  return `crm:secondary-sidebar-sections:${key}`;
}

/** Solo migración desde localStorage (legacy). */
export function readLegacyStoredSectionHeights(storageKey: string): number[] | null {
  try {
    const raw = localStorage.getItem(legacyStorageKeyFor(storageKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSecondarySidebarSizes;
    if (!parsed?.heights || !Array.isArray(parsed.heights)) return null;
    return parsed.heights.filter((value) => typeof value === 'number' && Number.isFinite(value));
  } catch {
    return null;
  }
}

export function readStoredSectionHeights(
  storageKey: string,
  sectionIds: string[],
): number[] | null {
  const resizableCount = Math.max(0, sectionIds.length - 1);
  if (resizableCount === 0) return null;

  try {
    const raw = localStorage.getItem(secondarySidebarSectionsStorageKey(storageKey));
    if (raw) {
      const parsed = parseSecondarySidebarSectionHeightsPayload(
        JSON.parse(raw) as unknown,
        sectionIds,
      );
      if (parsed) return parsed;
    }
  } catch {
    /* ignore */
  }

  const legacyHeights = readLegacyStoredSectionHeights(storageKey);
  if (legacyHeights && legacyHeights.length === resizableCount) {
    return legacyHeights;
  }

  return null;
}

export function writeStoredSectionHeights(
  storageKey: string,
  heights: number[],
  sectionIds: string[],
): void {
  try {
    const payload = buildSecondarySidebarSectionHeightsPayload(heights, sectionIds);
    localStorage.setItem(
      secondarySidebarSectionsStorageKey(storageKey),
      JSON.stringify(payload),
    );
    localStorage.removeItem(legacyStorageKeyFor(storageKey));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sectionMin(spec: SecondarySidebarSectionSpec): number {
  return spec.minHeight ?? SECONDARY_SIDEBAR_SECTION_MIN_HEIGHT_PX;
}

function sectionMax(spec: SecondarySidebarSectionSpec, cap: number): number {
  return spec.maxHeight != null ? Math.min(spec.maxHeight, cap) : cap;
}

export function getFixedSectionsAvailableHeight(
  specs: SecondarySidebarSectionSpec[],
  containerHeight: number,
): number {
  const resizableCount = Math.max(0, specs.length - 1);
  const dividerTotal = resizableCount * SECONDARY_SIDEBAR_DIVIDER_HIT_HEIGHT_PX;
  const lastMin = sectionMin(specs[specs.length - 1] ?? { id: '' });
  return Math.max(0, containerHeight - dividerTotal - lastMin);
}

export function buildDefaultHeights(
  specs: SecondarySidebarSectionSpec[],
  containerHeight: number,
): number[] {
  const resizableCount = Math.max(0, specs.length - 1);
  if (resizableCount === 0) return [];

  const dividerTotal = resizableCount * SECONDARY_SIDEBAR_DIVIDER_HIT_HEIGHT_PX;
  const sectionCount = specs.length;
  const stackHeight = Math.max(0, containerHeight - dividerTotal);
  const equalSectionHeight = Math.floor(stackHeight / sectionCount);

  return specs.slice(0, -1).map((spec) => {
    const min = sectionMin(spec);
    const max = sectionMax(spec, stackHeight);
    return clamp(equalSectionHeight, min, max);
  });
}

export function fitHeightsToContainer(
  heights: number[],
  specs: SecondarySidebarSectionSpec[],
  containerHeight: number,
): number[] {
  const resizableCount = Math.max(0, specs.length - 1);
  if (resizableCount === 0) return [];

  const available = getFixedSectionsAvailableHeight(specs, containerHeight);
  const mins = specs.slice(0, resizableCount).map(sectionMin);

  let next = heights.slice(0, resizableCount).map((height, index) => {
    const spec = specs[index]!;
    const min = mins[index]!;
    const max = sectionMax(spec, available);
    return clamp(height, min, max);
  });

  while (next.length < resizableCount) {
    const index = next.length;
    next.push(mins[index]!);
  }

  const minSum = mins.reduce((total, min) => total + min, 0);
  if (minSum >= available) {
    return mins;
  }

  let sum = next.reduce((total, height) => total + height, 0);
  if (sum <= available) {
    return next;
  }

  let excess = sum - available;
  const slacks = next.map((height, index) => height - mins[index]!);
  const totalSlack = slacks.reduce((total, slack) => total + slack, 0);

  if (totalSlack > 0) {
    next = next.map((height, index) => {
      const reduction = (slacks[index]! / totalSlack) * excess;
      return Math.max(mins[index]!, Math.round(height - reduction));
    });
  }

  sum = next.reduce((total, height) => total + height, 0);
  for (let index = next.length - 1; sum > available && index >= 0; index -= 1) {
    while (sum > available && next[index]! > mins[index]!) {
      next[index]!--;
      sum -= 1;
    }
  }

  return next;
}

export function applyDividerDrag(
  dividerIndex: number,
  deltaY: number,
  heights: number[],
  specs: SecondarySidebarSectionSpec[],
  containerHeight: number,
): number[] {
  const resizableCount = Math.max(0, specs.length - 1);
  if (dividerIndex < 0 || dividerIndex >= resizableCount) return heights;

  const available = getFixedSectionsAvailableHeight(specs, containerHeight);
  const next = heights.slice(0, resizableCount);
  while (next.length < resizableCount) {
    const index = next.length;
    next.push(sectionMin(specs[index]!));
  }

  const specTop = specs[dividerIndex]!;
  const minTop = sectionMin(specTop);
  const maxTop = sectionMax(specTop, available);
  const topHeight = next[dividerIndex] ?? minTop;

  if (dividerIndex === resizableCount - 1) {
    const othersSum = next.slice(0, dividerIndex).reduce((total, height) => total + height, 0);
    const maxAllowed = Math.max(minTop, available - othersSum);
    next[dividerIndex] = clamp(topHeight + deltaY, minTop, Math.min(maxTop, maxAllowed));
    return next;
  }

  const specBottom = specs[dividerIndex + 1]!;
  const minBottom = sectionMin(specBottom);
  const maxBottom = sectionMax(specBottom, available);
  const bottomHeight = next[dividerIndex + 1] ?? minBottom;

  const othersSum =
    next.slice(0, dividerIndex).reduce((total, height) => total + height, 0) +
    next.slice(dividerIndex + 2, resizableCount).reduce((total, height) => total + height, 0);

  const pairMax = available - othersSum;
  const pairSum = topHeight + bottomHeight;
  const maxTopHeight = Math.min(maxTop, pairMax - minBottom, pairSum - minBottom);
  const minTopHeight = Math.max(minTop, pairSum - maxBottom);

  const newTop = clamp(topHeight + deltaY, minTopHeight, maxTopHeight);
  const applied = newTop - topHeight;

  next[dividerIndex] = newTop;
  next[dividerIndex + 1] = clamp(
    bottomHeight - applied,
    minBottom,
    Math.min(maxBottom, pairMax - newTop),
  );

  return next;
}
