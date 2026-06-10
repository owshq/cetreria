import { useCallback, useEffect, useState } from 'react';

export function useElementWidthBelow(
  maxWidthPx: number,
  enabled = true,
): readonly [(node: HTMLElement | null) => void, boolean] {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [below, setBelow] = useState(false);

  const ref = useCallback((node: HTMLElement | null) => {
    setElement(node);
  }, []);

  useEffect(() => {
    if (!enabled || !element) {
      setBelow(false);
      return;
    }

    const update = (width: number) => {
      setBelow(width < maxWidthPx);
    };

    update(element.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width != null) update(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, maxWidthPx, enabled]);

  return [ref, below] as const;
}
