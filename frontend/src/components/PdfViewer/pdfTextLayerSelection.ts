/**
 * Extiende la selección de texto de forma continua (comportamiento del visor pdf.js).
 */

const textLayers = new Map<HTMLElement, HTMLDivElement>();
let selectionAbort: AbortController | null = null;

function resetEndMarker(end: HTMLDivElement, textLayer: HTMLElement) {
  textLayer.append(end);
  end.style.width = '';
  end.style.height = '';
  textLayer.classList.remove('selecting');
}

function ensureGlobalSelectionListener() {
  if (selectionAbort) return;

  selectionAbort = new AbortController();
  const { signal } = selectionAbort;

  let isPointerDown = false;
  let prevRange: Range | null = null;

  document.addEventListener(
    'pointerdown',
    () => {
      isPointerDown = true;
    },
    { signal },
  );
  document.addEventListener(
    'pointerup',
    () => {
      isPointerDown = false;
      textLayers.forEach(resetEndMarker);
    },
    { signal },
  );
  window.addEventListener(
    'blur',
    () => {
      isPointerDown = false;
      textLayers.forEach(resetEndMarker);
    },
    { signal },
  );
  document.addEventListener(
    'keyup',
    () => {
      if (!isPointerDown) {
        textLayers.forEach(resetEndMarker);
      }
    },
    { signal },
  );

  document.addEventListener(
    'selectionchange',
    () => {
      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0) {
        textLayers.forEach(resetEndMarker);
        return;
      }

      const activeTextLayers = new Set<HTMLElement>();
      for (let i = 0; i < selection.rangeCount; i += 1) {
        const range = selection.getRangeAt(i);
        for (const textLayerDiv of textLayers.keys()) {
          if (!activeTextLayers.has(textLayerDiv) && range.intersectsNode(textLayerDiv)) {
            activeTextLayers.add(textLayerDiv);
          }
        }
      }

      for (const [textLayerDiv, endDiv] of textLayers) {
        if (activeTextLayers.has(textLayerDiv)) {
          textLayerDiv.classList.add('selecting');
        } else {
          resetEndMarker(endDiv, textLayerDiv);
        }
      }

      const range = selection.getRangeAt(0);
      const modifyStart =
        prevRange &&
        (range.compareBoundaryPoints(Range.END_TO_END, prevRange) === 0 ||
          range.compareBoundaryPoints(Range.START_TO_END, prevRange) === 0);
      let anchor: Node = modifyStart ? range.startContainer : range.endContainer;
      if (anchor.nodeType === Node.TEXT_NODE) {
        anchor = anchor.parentNode!;
      }

      const parentTextLayer = (anchor as HTMLElement).parentElement?.closest(
        '.textLayer',
      ) as HTMLElement | null;
      const endDiv = parentTextLayer ? textLayers.get(parentTextLayer) : undefined;
      if (endDiv && parentTextLayer) {
        endDiv.style.width = parentTextLayer.style.width;
        endDiv.style.height = parentTextLayer.style.height;
        anchor.parentElement?.insertBefore(
          endDiv,
          modifyStart ? anchor : anchor.nextSibling,
        );
      }

      prevRange = range.cloneRange();
    },
    { signal },
  );
}

export function bindPdfTextLayerSelection(textLayerDiv: HTMLElement, endMarker: HTMLDivElement) {
  if (textLayers.has(textLayerDiv)) return;

  textLayerDiv.addEventListener('mousedown', () => {
    textLayerDiv.classList.add('selecting');
  });

  textLayers.set(textLayerDiv, endMarker);
  ensureGlobalSelectionListener();
}

export function unbindPdfTextLayerSelection(textLayerDiv: HTMLElement) {
  const end = textLayers.get(textLayerDiv);
  if (end) {
    resetEndMarker(end, textLayerDiv);
  }
  textLayers.delete(textLayerDiv);
  if (textLayers.size === 0) {
    selectionAbort?.abort();
    selectionAbort = null;
  }
}

export function unbindAllPdfTextLayerSelections() {
  textLayers.forEach(resetEndMarker);
  textLayers.clear();
  selectionAbort?.abort();
  selectionAbort = null;
}
