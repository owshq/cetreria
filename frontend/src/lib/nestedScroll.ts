export const SCROLL_LOCAL_SELECTOR = '[data-scroll-local]';
export const SCROLL_IGNORE_TOPBAR_SELECTOR = '[data-scroll-ignore-topbar]';

const SCROLL_EPSILON = 1;

function isDomElement(target: EventTarget | null): target is HTMLElement {
  if (!target || typeof target !== 'object') return false;
  const candidate = target as {
    nodeType?: number;
    hasAttribute?: (name: string) => boolean;
    parentElement?: HTMLElement | null;
  };
  return candidate.nodeType === 1 && typeof candidate.hasAttribute === 'function';
}

function elementContains(root: HTMLElement, target: HTMLElement): boolean {
  let element: HTMLElement | null = target;
  while (element) {
    if (element === root) return true;
    element = element.parentElement;
  }
  return false;
}

function elementClosestAttribute(target: HTMLElement, attribute: string): HTMLElement | null {
  let element: HTMLElement | null = target;
  while (element) {
    if (element.hasAttribute(attribute)) return element;
    element = element.parentElement;
  }
  return null;
}

export function isScrollableElement(element: HTMLElement): boolean {
  const { overflowY } = getComputedStyle(element);
  if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') {
    return false;
  }
  return element.scrollHeight > element.clientHeight + SCROLL_EPSILON;
}

export function canScrollInDirection(element: HTMLElement, deltaY: number): boolean {
  if (Math.abs(deltaY) < SCROLL_EPSILON) return false;
  if (deltaY > 0) {
    return element.scrollTop + element.clientHeight < element.scrollHeight - SCROLL_EPSILON;
  }
  return element.scrollTop > SCROLL_EPSILON;
}

export function getMaxNestedScrollTop(root: HTMLElement): number {
  let maxScrollTop = 0;

  const visit = (element: HTMLElement) => {
    if (element !== root && isScrollableElement(element)) {
      maxScrollTop = Math.max(maxScrollTop, element.scrollTop);
    }
    for (const child of element.children) {
      if (child instanceof HTMLElement) visit(child);
    }
  };

  visit(root);
  return maxScrollTop;
}

export function isWithinScrollRoot(target: EventTarget | null, scrollRoot: HTMLElement): boolean {
  if (!isDomElement(target)) return false;
  return target === scrollRoot || elementContains(scrollRoot, target);
}

export function findNestedScrollRegion(
  target: EventTarget | null,
  mainRoot: HTMLElement,
): HTMLElement | null {
  if (!isDomElement(target)) return null;

  let element: HTMLElement | null = target;
  while (element && element !== mainRoot) {
    if (element.hasAttribute('data-scroll-region')) {
      return element;
    }
    element = element.parentElement;
  }

  return null;
}

export function findScrollPane(
  target: EventTarget | null,
  mainRoot: HTMLElement,
): HTMLElement | null {
  if (!isDomElement(target)) return null;

  let element: HTMLElement | null = target;
  while (element && element !== mainRoot) {
    if (element.hasAttribute('data-scroll-pane')) {
      return element;
    }
    element = element.parentElement;
  }

  return null;
}

export function resolveScrollDelegateRoot(
  target: EventTarget | null,
  mainRoot: HTMLElement,
): HTMLElement {
  return findScrollPane(target, mainRoot) ?? mainRoot;
}

export function resetScrollTree(root: HTMLElement): void {
  root.scrollTop = 0;
  root.scrollLeft = 0;

  const visit = (element: HTMLElement) => {
    if (element !== root) {
      element.scrollTop = 0;
      element.scrollLeft = 0;
    }
    for (const child of element.children) {
      if (child instanceof HTMLElement) visit(child);
    }
  };

  visit(root);
}

export function shouldIgnoreMainScrollDelegation(target: EventTarget | null): boolean {
  if (!isDomElement(target)) return true;
  if (elementClosestAttribute(target, 'data-scroll-ignore-topbar')) return true;
  if (elementClosestAttribute(target, 'data-scroll-local')) return true;
  return false;
}

export type MainScrollWheelDecision =
  | { action: 'ignore' }
  | { action: 'default' }
  | { action: 'delegate'; deltaY: number; target: HTMLElement };

export function resolveMainScrollWheelDecision(
  target: EventTarget | null,
  mainRoot: HTMLElement,
  deltaY: number,
  minWheelDelta = 6,
): MainScrollWheelDecision {
  if (Math.abs(deltaY) < minWheelDelta) {
    return { action: 'ignore' };
  }

  if (!isWithinScrollRoot(target, mainRoot) || shouldIgnoreMainScrollDelegation(target)) {
    return { action: 'ignore' };
  }

  const nested = findNestedScrollRegion(target, mainRoot);
  if (!nested) {
    return { action: 'default' };
  }

  const isSecondary = nested.hasAttribute('data-scroll-secondary');
  const delegateRoot = resolveScrollDelegateRoot(target, mainRoot);

  if (canScrollInDirection(delegateRoot, deltaY)) {
    return { action: 'delegate', deltaY, target: delegateRoot };
  }

  if (
    !isSecondary &&
    isScrollableElement(nested) &&
    canScrollInDirection(nested, deltaY)
  ) {
    return { action: 'default' };
  }

  if (canScrollInDirection(delegateRoot, deltaY)) {
    return { action: 'delegate', deltaY, target: delegateRoot };
  }

  return { action: 'ignore' };
}
