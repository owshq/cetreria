export function isScrollableElement(element: HTMLElement): boolean {
  const { overflowY } = getComputedStyle(element);
  if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') {
    return false;
  }
  return element.scrollHeight > element.clientHeight + 1;
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
  return target instanceof Node && (target === scrollRoot || scrollRoot.contains(target));
}
