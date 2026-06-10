import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Download,
  Maximize2,
  Minimize2,
  PanelLeft,
  Printer,
  RotateCw,
  Search,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  getDocument,
  TextLayer,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type PageViewport,
  type RenderTask,
} from 'pdfjs-dist';
import '@/lib/pdfjsSetup';
import { triggerFileDownload } from '@/api/documents';
import { apiFetchBlob } from '@/api/client';
import { cx } from '@/lib/cx';
import './pdfTextLayer.css';
import {
  bindPdfTextLayerSelection,
  unbindAllPdfTextLayerSelections,
  unbindPdfTextLayerSelection,
} from './pdfTextLayerSelection';
import styles from './PdfViewer.module.css';

type ZoomMode = 'fit-width' | 'fit-page' | number;

type SearchMatch = {
  page: number;
};

type PdfViewerProps = {
  src: string;
  fileName?: string;
  className?: string;
  title?: string;
};

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const ZOOM_WHEEL_STEP = 0.1;

const ZOOM_PRESETS: Array<{ value: ZoomMode; label: string }> = [
  { value: 'fit-width', label: 'Ancho' },
  { value: 'fit-page', label: 'Página' },
  { value: 0.5, label: '50%' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' },
  { value: 1.25, label: '125%' },
  { value: 1.5, label: '150%' },
  { value: 2, label: '200%' },
];

function zoomModeKey(mode: ZoomMode): string {
  return typeof mode === 'number' ? String(mode) : mode;
}

function parseZoomMode(value: string): ZoomMode {
  if (value === 'fit-width' || value === 'fit-page') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 'fit-width';
}

function applyZoomDelta(current: ZoomMode, resolvedScale: number, delta: number): ZoomMode {
  const base =
    current === 'fit-width' || current === 'fit-page' ? resolvedScale : current;
  return Math.min(
    Math.max(Math.round((base + delta) * 100) / 100, MIN_ZOOM),
    MAX_ZOOM,
  );
}

/** Rotacion adicional del usuario (0/90/180/270) sumada a la del PDF. */
function resolvePageRotation(userRotation: number, pageRotation: number): number {
  return (userRotation + pageRotation) % 360;
}

function applyViewportScaleFactor(element: HTMLElement, viewport: PageViewport) {
  element.style.setProperty('--scale-factor', String(viewport.scale));
}

function syncPageSurfaceLayout(pageSurface: HTMLElement, viewport: PageViewport) {
  applyViewportScaleFactor(pageSurface, viewport);
  const cssWidth = Math.round(viewport.width);
  const cssHeight = Math.round(viewport.height);
  pageSurface.style.width = `${cssWidth}px`;
  pageSurface.style.height = `${cssHeight}px`;
}

async function renderPageTextLayer(
  page: PDFPageProxy,
  container: HTMLDivElement,
  viewport: PageViewport,
  activeLayers: Map<string, TextLayer>,
  taskKey: string,
) {
  activeLayers.get(taskKey)?.cancel();
  unbindPdfTextLayerSelection(container);
  container.replaceChildren();
  applyViewportScaleFactor(container, viewport);

  const layer = new TextLayer({
    textContentSource: page.streamTextContent({
      includeMarkedContent: true,
      disableNormalization: true,
    }),
    container,
    viewport,
  });
  activeLayers.set(taskKey, layer);

  try {
    await layer.render();
    const endOfContent = document.createElement('div');
    endOfContent.className = 'endOfContent';
    container.append(endOfContent);
    bindPdfTextLayerSelection(container, endOfContent);
  } finally {
    if (activeLayers.get(taskKey) === layer) {
      activeLayers.delete(taskKey);
    }
  }
}

async function renderPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  viewport: PageViewport,
  activeTasks: Map<string, RenderTask>,
  taskKey: string,
) {
  activeTasks.get(taskKey)?.cancel();

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return;

  const cssWidth = Math.round(viewport.width);
  const cssHeight = Math.round(viewport.height);

  canvas.width = cssWidth;
  canvas.height = cssHeight;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  const task = page.render({
    canvasContext: context,
    viewport,
  });
  activeTasks.set(taskKey, task);

  try {
    await task.promise;
  } finally {
    if (activeTasks.get(taskKey) === task) {
      activeTasks.delete(taskKey);
    }
  }
}

async function renderPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  pageSurface: HTMLElement | undefined,
  canvas: HTMLCanvasElement,
  textLayer: HTMLDivElement | undefined,
  scale: number,
  userRotation: number,
  activeTasks: Map<string, RenderTask>,
  activeLayers: Map<string, TextLayer>,
  isStale?: () => boolean,
) {
  const page = await pdf.getPage(pageNumber);
  if (isStale?.()) return;

  const viewport = page.getViewport({
    scale,
    rotation: resolvePageRotation(userRotation, page.rotate),
  });

  if (pageSurface) {
    syncPageSurfaceLayout(pageSurface, viewport);
  }

  await Promise.all([
    renderPageToCanvas(page, canvas, viewport, activeTasks, `page-${pageNumber}`),
    textLayer
      ? renderPageTextLayer(page, textLayer, viewport, activeLayers, `text-${pageNumber}`)
      : Promise.resolve(),
  ]);

  if (isStale?.()) return;
}

function getViewportContentSize(element: HTMLElement) {
  const styles = getComputedStyle(element);
  const paddingX =
    parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
  const paddingY =
    parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);

  return {
    width: Math.max(element.clientWidth - paddingX, 0),
    height: Math.max(element.clientHeight - paddingY, 0),
  };
}

const MIN_VIEWPORT_WIDTH_FOR_FIT = 1;
const MAX_LAYOUT_MEASURE_ATTEMPTS = 48;

async function computeAutoScale(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  userRotation: number,
  viewportEl: HTMLElement,
  mode: 'fit-width' | 'fit-page',
): Promise<number | null> {
  const { width, height } = getViewportContentSize(viewportEl);
  if (width < MIN_VIEWPORT_WIDTH_FOR_FIT) return null;

  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({
    scale: 1,
    rotation: resolvePageRotation(userRotation, page.rotate),
  });

  if (mode === 'fit-page') {
    const fitHeight = height > 160 ? height : width * 1.35;
    return Math.min(width / base.width, fitHeight / base.height);
  }

  return width / base.width;
}

/** Ruta API relativa (`/documents/:id/pdf`) si `src` apunta al PDF del backend. */
function extractDocumentPdfApiPath(src: string): string | null {
  const match = src.match(/\/documents\/([^/?#]+)\/pdf(?:\?|$|#)/);
  return match ? `/documents/${match[1]}/pdf` : null;
}

async function readPdfBytes(src: string): Promise<ArrayBuffer> {
  const apiPath = extractDocumentPdfApiPath(src);
  if (apiPath) {
    return (await apiFetchBlob(apiPath)).arrayBuffer();
  }

  const response = await fetch(src);
  if (!response.ok) {
    throw new Error('No se pudo cargar el PDF.');
  }
  return response.arrayBuffer();
}

async function loadPdfSource(src: string) {
  return { data: await readPdfBytes(src) } as const;
}

async function findSearchMatches(
  pdf: PDFDocumentProxy,
  query: string,
): Promise<SearchMatch[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const matches: SearchMatch[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .toLowerCase();
    if (pageText.includes(normalized)) {
      matches.push({ page: pageNumber });
    }
  }
  return matches;
}

export default function PdfViewer({
  src,
  fileName = 'documento.pdf',
  className,
  title = 'Visor de PDF',
}: PdfViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pageCanvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const pageSurfaceRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pageTextLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const thumbCanvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const resolvedScaleRef = useRef(0);
  const renderTasksRef = useRef<Map<string, RenderTask>>(new Map());
  const textLayersRef = useRef<Map<string, TextLayer>>(new Map());

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-width');
  const [resolvedScale, setResolvedScale] = useState(0);
  const [scaleReady, setScaleReady] = useState(false);
  const [userRotation, setUserRotation] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [renderToken, setRenderToken] = useState(0);

  resolvedScaleRef.current = resolvedScale;

  const pageNumbers = useMemo(
    () => Array.from({ length: numPages }, (_, index) => index + 1),
    [numPages],
  );

  const scrollToPage = useCallback((pageNumber: number, behavior: ScrollBehavior = 'smooth') => {
    const target = pageRefs.current.get(pageNumber);
    target?.scrollIntoView({ behavior, block: 'start' });
  }, []);

  const goToPage = useCallback(
    (pageNumber: number) => {
      const clamped = Math.min(Math.max(pageNumber, 1), Math.max(numPages, 1));
      setCurrentPage(clamped);
      setPageInput(String(clamped));
      scrollToPage(clamped);
    },
    [numPages, scrollToPage],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdf(null);
    setNumPages(0);
    setCurrentPage(1);
    setPageInput('1');
    setSearchQuery('');
    setSearchMatches([]);
    setSearchIndex(0);
    setResolvedScale(0);
    setScaleReady(false);
    setUserRotation(0);

    let task: ReturnType<typeof getDocument> | null = null;

    const load = async () => {
      try {
        task = getDocument(await loadPdfSource(src));
        const doc = await task.promise;

        if (cancelled) {
          void doc.destroy();
          return;
        }

        setPdf(doc);
        setNumPages(doc.numPages);
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'No se pudo cargar el PDF.';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      void task?.destroy();
      renderTasksRef.current.forEach((renderTask) => renderTask.cancel());
      renderTasksRef.current.clear();
      textLayersRef.current.forEach((layer) => layer.cancel());
      textLayersRef.current.clear();
      unbindAllPdfTextLayerSelections();
    };
  }, [src]);

  useEffect(() => {
    if (!pdf || !searchQuery.trim()) {
      setSearchMatches([]);
      setSearchIndex(0);
      return;
    }

    let cancelled = false;
    void findSearchMatches(pdf, searchQuery).then((matches) => {
      if (cancelled) return;
      setSearchMatches(matches);
      setSearchIndex(0);
      if (matches[0]) goToPage(matches[0].page);
    });

    return () => {
      cancelled = true;
    };
  }, [pdf, searchQuery, goToPage]);

  useLayoutEffect(() => {
    if (!pdf || !viewportRef.current || !rootRef.current) return;

    let cancelled = false;
    let layoutRaf = 0;
    let layoutMeasureAttempts = 0;
    const viewportEl = viewportRef.current;
    const rootEl = rootRef.current;

    const applyResolvedScale = (scale: number) => {
      if (cancelled) return;
      layoutMeasureAttempts = 0;
      setResolvedScale(scale);
      setScaleReady(true);
    };

    const resolveScale = async () => {
      if (typeof zoomMode === 'number') {
        applyResolvedScale(zoomMode);
        return;
      }

      const scale = await computeAutoScale(pdf, 1, userRotation, viewportEl, zoomMode);
      if (cancelled) return;

      if (scale !== null && scale > 0) {
        applyResolvedScale(scale);
        return;
      }

      layoutMeasureAttempts += 1;
      if (layoutMeasureAttempts >= MAX_LAYOUT_MEASURE_ATTEMPTS) {
        applyResolvedScale(1);
        return;
      }

      // El contenedor aún no tiene ancho (flex/grid sin reflow). Reintentar en el siguiente frame.
      setScaleReady(false);
      layoutRaf = window.requestAnimationFrame(() => {
        void resolveScale();
      });
    };

    void resolveScale();

    const observer = new ResizeObserver(() => {
      void resolveScale();
    });
    observer.observe(rootEl);
    observer.observe(viewportEl);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(layoutRaf);
      observer.disconnect();
    };
  }, [pdf, zoomMode, userRotation, sidebarOpen]);

  useLayoutEffect(() => {
    if (!pdf || !scaleReady || resolvedScale <= 0) return;

    let cancelled = false;

    const isStale = () => cancelled;

    const renderAll = async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      if (isStale()) return;

      let renderedPages = 0;
      await Promise.all(
        pageNumbers.map(async (pageNumber) => {
          if (isStale()) return;
          const canvas = pageCanvasRefs.current.get(pageNumber);
          if (!canvas) return;
          await renderPage(
            pdf,
            pageNumber,
            pageSurfaceRefs.current.get(pageNumber),
            canvas,
            pageTextLayerRefs.current.get(pageNumber),
            resolvedScale,
            userRotation,
            renderTasksRef.current,
            textLayersRef.current,
            isStale,
          );
          if (isStale()) return;
          renderedPages += 1;
        }),
      );

      if (sidebarOpen && !isStale()) {
        const thumbScale = Math.max(resolvedScale * 0.22, 0.12);
        await Promise.all(
          pageNumbers.map(async (pageNumber) => {
            if (isStale()) return;
            const canvas = thumbCanvasRefs.current.get(pageNumber);
            if (!canvas) return;
            const page = await pdf.getPage(pageNumber);
            if (isStale()) return;
            const viewport = page.getViewport({
              scale: thumbScale,
              rotation: resolvePageRotation(userRotation, page.rotate),
            });
            await renderPageToCanvas(
              page,
              canvas,
              viewport,
              renderTasksRef.current,
              `thumb-${pageNumber}`,
            );
          }),
        );
      }

      if (
        !cancelled &&
        pageNumbers.length > 0 &&
        renderedPages < pageNumbers.length
      ) {
        window.requestAnimationFrame(() => {
          if (!cancelled) setRenderToken((token) => token + 1);
        });
      }
    };

    void renderAll();

    return () => {
      cancelled = true;
      renderTasksRef.current.forEach((renderTask) => renderTask.cancel());
      renderTasksRef.current.clear();
      textLayersRef.current.forEach((layer) => layer.cancel());
      textLayersRef.current.clear();
      unbindAllPdfTextLayerSelections();
    };
  }, [pdf, pageNumbers, resolvedScale, userRotation, sidebarOpen, renderToken, scaleReady]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || numPages === 0) return;

    const updateCurrentPageFromScroll = () => {
      const viewportRect = viewport.getBoundingClientRect();
      const anchorY = viewportRect.top + viewportRect.height * 0.35;
      let closestPage = 1;
      let closestDistance = Number.POSITIVE_INFINITY;

      pageRefs.current.forEach((element, pageNumber) => {
        const rect = element.getBoundingClientRect();
        const distance = Math.abs(rect.top - anchorY);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPage = pageNumber;
        }
      });

      setCurrentPage(closestPage);
      setPageInput(String(closestPage));
    };

    const onScroll = () => {
      if (scrollRafRef.current !== null) return;
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = null;
        updateCurrentPageFromScroll();
      });
    };

    viewport.addEventListener('scroll', onScroll, { passive: true });
    updateCurrentPageFromScroll();

    return () => {
      viewport.removeEventListener('scroll', onScroll);
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, [numPages, resolvedScale, sidebarOpen]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();

      const delta = event.deltaY < 0 ? ZOOM_WHEEL_STEP : -ZOOM_WHEEL_STEP;
      setZoomMode((current) =>
        applyZoomDelta(current, resolvedScaleRef.current, delta),
      );
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === rootRef.current);
      setRenderToken((value) => value + 1);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const zoomIn = useCallback(() => {
    setZoomMode((current) =>
      applyZoomDelta(current, resolvedScaleRef.current, ZOOM_WHEEL_STEP),
    );
  }, []);

  const zoomOut = useCallback(() => {
    setZoomMode((current) =>
      applyZoomDelta(current, resolvedScaleRef.current, -ZOOM_WHEEL_STEP),
    );
  }, []);

  const rotatePage = useCallback(() => {
    setUserRotation((value) => (value + 90) % 360);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const root = rootRef.current;
    if (!root) return;
    if (document.fullscreenElement === root) {
      await document.exitFullscreen();
      return;
    }
    await root.requestFullscreen();
  }, []);

  const handleDownload = useCallback(async () => {
    const blob = new Blob([await readPdfBytes(src)], { type: 'application/pdf' });
    triggerFileDownload(blob, fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
  }, [src, fileName]);

  const handlePrint = useCallback(async () => {
    const blob = new Blob([await readPdfBytes(src)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.inset = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.src = url;
    document.body.appendChild(frame);
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => {
        document.body.removeChild(frame);
        URL.revokeObjectURL(url);
      }, 1000);
    };
  }, [src]);

  const goToSearchMatch = useCallback(
    (direction: 1 | -1) => {
      if (searchMatches.length === 0) return;
      const nextIndex = (searchIndex + direction + searchMatches.length) % searchMatches.length;
      setSearchIndex(nextIndex);
      goToPage(searchMatches[nextIndex]!.page);
    },
    [searchIndex, searchMatches, goToPage],
  );

  const handleRootKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const isTyping =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT';

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      setSearchOpen(true);
      window.requestAnimationFrame(() => searchInputRef.current?.focus());
      return;
    }

    if (isTyping) return;

    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomIn();
      return;
    }
    if (event.key === '-') {
      event.preventDefault();
      zoomOut();
      return;
    }
    if (event.key === '0') {
      event.preventDefault();
      setZoomMode('fit-width');
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'PageDown') {
      event.preventDefault();
      goToPage(currentPage + 1);
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'PageUp') {
      event.preventDefault();
      goToPage(currentPage - 1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      goToPage(1);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      goToPage(numPages);
    }
  };

  const zoomLabel =
    zoomMode === 'fit-width' || zoomMode === 'fit-page'
      ? scaleReady
        ? `${Math.round(resolvedScale * 100)}%`
        : '…'
      : `${Math.round(zoomMode * 100)}%`;

  return (
    <div
      ref={rootRef}
      className={cx(styles.root, isFullscreen && styles.rootFullscreen, className)}
      aria-label={title}
      tabIndex={0}
      onKeyDown={handleRootKeyDown}
    >
      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <button
            type="button"
            className={cx(styles.toolBtn, sidebarOpen && styles.toolBtnActive)}
            onClick={() => setSidebarOpen((value) => !value)}
            aria-label={sidebarOpen ? 'Ocultar miniaturas' : 'Mostrar miniaturas'}
            aria-pressed={sidebarOpen}
            disabled={loading || !!error}
          >
            <PanelLeft size={16} />
          </button>
        </div>

        <span className={styles.toolbarDivider} aria-hidden />

        <div className={styles.toolbarGroup}>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1 || loading || !!error}
            aria-label="Página anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <div className={styles.pageIndicator}>
            <input
              className={styles.pageInput}
              value={pageInput}
              inputMode="numeric"
              aria-label="Ir a página"
              disabled={loading || !!error || numPages === 0}
              onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ''))}
              onBlur={() => goToPage(Number(pageInput) || 1)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  goToPage(Number(pageInput) || 1);
                }
              }}
            />
            <span>/ {numPages || '…'}</span>
          </div>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= numPages || loading || !!error}
            aria-label="Página siguiente"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <span className={styles.toolbarDivider} aria-hidden />

        <div className={styles.toolbarGroup} role="group" aria-label="Zoom">
          <button
            type="button"
            className={styles.toolBtn}
            onClick={(event) => {
              event.stopPropagation();
              zoomOut();
            }}
            disabled={loading || !!error}
            aria-label="Alejar"
          >
            <ZoomOut size={16} />
          </button>
          <select
            className={styles.zoomSelect}
            value={zoomModeKey(zoomMode)}
            aria-label={`Zoom (${zoomLabel})`}
            disabled={loading || !!error}
            onChange={(event) => {
              const next = parseZoomMode(event.target.value);
              if (next === 'fit-width' || next === 'fit-page') {
                setScaleReady(false);
                setResolvedScale(0);
              }
              setZoomMode(next);
            }}
          >
            {ZOOM_PRESETS.map((preset) => (
              <option key={zoomModeKey(preset.value)} value={zoomModeKey(preset.value)}>
                {preset.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={(event) => {
              event.stopPropagation();
              zoomIn();
            }}
            disabled={loading || !!error}
            aria-label="Acercar"
          >
            <ZoomIn size={16} />
          </button>
        </div>

        <span className={styles.toolbarDivider} aria-hidden />

        <div className={styles.toolbarGroup} role="group" aria-label="Orientacion">
          <button
            type="button"
            className={styles.toolBtn}
            onClick={(event) => {
              event.stopPropagation();
              rotatePage();
            }}
            disabled={loading || !!error}
            aria-label="Rotar pagina"
          >
            <RotateCw size={16} />
          </button>
        </div>

        <span className={styles.toolbarDivider} aria-hidden />

        <div className={styles.searchWrap}>
          <button
            type="button"
            className={cx(styles.toolBtn, searchOpen && styles.toolBtnActive)}
            onClick={() => {
              setSearchOpen((value) => !value);
              if (!searchOpen) {
                window.requestAnimationFrame(() => searchInputRef.current?.focus());
              }
            }}
            aria-label="Buscar en el documento"
            aria-pressed={searchOpen}
            disabled={loading || !!error}
          >
            <Search size={16} />
          </button>
          {searchOpen ? (
            <>
              <input
                ref={searchInputRef}
                className={styles.searchInput}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar texto…"
                aria-label="Buscar texto en el PDF"
              />
              {searchQuery.trim() ? (
                <>
                  <span className={styles.searchMeta}>
                    {searchMatches.length === 0
                      ? '0'
                      : `${searchIndex + 1}/${searchMatches.length}`}
                  </span>
                  <button
                    type="button"
                    className={styles.toolBtn}
                    onClick={() => goToSearchMatch(-1)}
                    disabled={searchMatches.length === 0}
                    aria-label="Coincidencia anterior"
                  >
                    <ChevronsUp size={16} />
                  </button>
                  <button
                    type="button"
                    className={styles.toolBtn}
                    onClick={() => goToSearchMatch(1)}
                    disabled={searchMatches.length === 0}
                    aria-label="Coincidencia siguiente"
                  >
                    <ChevronsDown size={16} />
                  </button>
                </>
              ) : null}
            </>
          ) : null}
        </div>

        <span className={styles.toolbarSpacer} />

        <div className={styles.toolbarGroup}>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => void handleDownload()}
            disabled={loading || !!error}
            aria-label="Descargar PDF"
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => void handlePrint()}
            disabled={loading || !!error}
            aria-label="Imprimir PDF"
          >
            <Printer size={16} />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => void toggleFullscreen()}
            disabled={loading || !!error}
            aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {loading ? (
        <div className={styles.state}>
          <div className={styles.spinner} aria-hidden />
          <p className={styles.stateText}>Cargando documento…</p>
        </div>
      ) : error ? (
        <div className={styles.state}>
          <p className={styles.stateText}>No se pudo cargar la vista previa del PDF.</p>
        </div>
      ) : (
        <div className={styles.body}>
          {sidebarOpen ? (
            <aside className={styles.sidebar} aria-label="Miniaturas de páginas">
              <div className={styles.sidebarHeader}>Páginas</div>
              <div className={styles.sidebarList}>
                {pageNumbers.map((pageNumber) => (
                  <button
                    key={`thumb-${pageNumber}`}
                    type="button"
                    className={cx(
                      styles.thumbnailBtn,
                      currentPage === pageNumber && styles.thumbnailBtnActive,
                    )}
                    onClick={() => goToPage(pageNumber)}
                    aria-label={`Ir a la página ${pageNumber}`}
                    aria-current={currentPage === pageNumber ? 'true' : undefined}
                  >
                    <canvas
                      ref={(node) => {
                        if (node) thumbCanvasRefs.current.set(pageNumber, node);
                        else thumbCanvasRefs.current.delete(pageNumber);
                      }}
                      className={styles.thumbnailCanvas}
                    />
                    <span className={styles.thumbnailLabel}>{pageNumber}</span>
                  </button>
                ))}
              </div>
            </aside>
          ) : null}

          <div ref={viewportRef} className={styles.viewport}>
            {!scaleReady ? (
              <div className={styles.stateOverlay}>
                <div className={styles.spinner} aria-hidden />
              </div>
            ) : null}
            <div
              className={styles.pages}
              aria-hidden={!scaleReady}
              style={scaleReady ? undefined : { visibility: 'hidden', position: 'absolute', pointerEvents: 'none' }}
            >
              {pageNumbers.map((pageNumber) => (
                <div
                  key={pageNumber}
                  ref={(node) => {
                    if (node) pageRefs.current.set(pageNumber, node);
                    else pageRefs.current.delete(pageNumber);
                  }}
                  className={styles.pageWrap}
                  data-page={pageNumber}
                >
                  <div
                    ref={(node) => {
                      if (node) pageSurfaceRefs.current.set(pageNumber, node);
                      else pageSurfaceRefs.current.delete(pageNumber);
                    }}
                    className={styles.pageSurface}
                  >
                    <canvas
                      ref={(node) => {
                        if (node) pageCanvasRefs.current.set(pageNumber, node);
                        else pageCanvasRefs.current.delete(pageNumber);
                      }}
                      className={styles.pageCanvas}
                    />
                    <div
                      ref={(node) => {
                        if (node) pageTextLayerRefs.current.set(pageNumber, node);
                        else pageTextLayerRefs.current.delete(pageNumber);
                      }}
                      className="textLayer"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
