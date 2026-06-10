import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Mic, Pause, Search, X } from 'lucide-react';
import Portal from '@/components/Portal';
import { SearchField } from '@/components/forms';
import {
  activitiesService,
  activityTypesService,
  authService,
  clientsService,
  documentsService,
} from '@/api';
import type { Activity, ActivityType, Client, Document } from '@shared/types';
import { usePopupEscape } from '@/context/PopupStackContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { cx } from '@/lib/cx';
import {
  GLOBAL_SEARCH_GROUP_LABELS,
  searchGlobal,
  type GlobalSearchResult,
  type GlobalSearchResultType,
} from '@/lib/globalSearch';
import { APP_EVENTS } from '@/lib/appEvents';
import forms from '@/styles/forms.module.css';
import styles from './GlobalSearch.module.css';

const GROUP_ORDER: GlobalSearchResultType[] = ['client', 'activity', 'document'];

type GlobalSearchProps = {
  compact?: boolean;
  /** Mismo aspecto que SearchField en toolbars de tabla (Contactos, Calendario, etc.). */
  toolbar?: boolean;
  /** Ancho intrínseco (placeholder/contenido), sin estirar en la fila del toolbar. */
  hug?: boolean;
  /** En móvil: solo icono; al pulsar expande el campo (controlado con expanded / onExpandedChange). */
  iconTrigger?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

type SearchData = {
  clients: Client[];
  activities: Activity[];
  documents: Document[];
  activityTypes: ActivityType[];
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

function formatListeningElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export default function GlobalSearch({
  compact = false,
  toolbar = false,
  hug = false,
  iconTrigger = false,
  expanded = false,
  onExpandedChange,
}: GlobalSearchProps) {
  const navigate = useNavigate();
  const resultsListId = useId();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  const voiceBaseQueryRef = useRef('');
  const {
    isListening,
    listeningElapsedSeconds,
    error: speechError,
    isSupported: isSpeechSupported,
    stop: stopSpeech,
    toggle: toggleSpeech,
    clearError: clearSpeechError,
  } = useSpeechToText();

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );

  const isIconTriggerMode = iconTrigger && isMobile;
  const isSearchExpanded = !isIconTriggerMode || expanded;

  const trimmedQuery = query.trim();
  const showDropdown = trimmedQuery.length > 0;
  const showVoiceError = Boolean(speechError);

  const collapseIconTrigger = useCallback(() => {
    if (isIconTriggerMode) onExpandedChange?.(false);
  }, [isIconTriggerMode, onExpandedChange]);

  const dismissSearchPanel = useCallback(() => {
    if (isListening) stopSpeech();
    setQuery('');
    setActiveIndex(-1);
    clearSpeechError();
    inputRef.current?.blur();
    collapseIconTrigger();
  }, [clearSpeechError, collapseIconTrigger, isListening, stopSpeech]);

  const closeOnOutsideInteraction =
    showDropdown || showVoiceError || (isIconTriggerMode && isSearchExpanded);

  usePopupEscape(closeOnOutsideInteraction, dismissSearchPanel);

  useLayoutEffect(() => {
    if (!showDropdown && !showVoiceError) {
      setPanelPosition(null);
      return;
    }

    const updatePosition = () => {
      const anchor = rootRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const horizontalInset = isMobile ? 16 : 0;
      setPanelPosition({
        top: rect.bottom + (showVoiceError ? 6 : 8),
        left: isMobile ? horizontalInset : rect.left,
        width: isMobile ? window.innerWidth - horizontalInset * 2 : rect.width,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [showDropdown, showVoiceError, isMobile]);

  const resetSearchData = useCallback(() => {
    loadPromiseRef.current = null;
    setData(null);
    setLoadError(false);
    setLoading(false);
  }, []);

  const loadData = useCallback(async () => {
    if (data) return;
    if (loadPromiseRef.current) {
      await loadPromiseRef.current;
      return;
    }

    setLoading(true);
    setLoadError(false);

    loadPromiseRef.current = (async () => {
      try {
        const [clients, activities, documents, activityTypes] = await Promise.all([
          clientsService.getAll(),
          activitiesService.getAll(),
          documentsService.getAll(),
          activityTypesService.getAll(),
        ]);
        setData({ clients, activities, documents, activityTypes });
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
        loadPromiseRef.current = null;
      }
    })();

    await loadPromiseRef.current;
  }, [data]);

  useEffect(() => {
    const handleSessionChange = () => {
      resetSearchData();
      setQuery('');
      setActiveIndex(-1);
    };

    window.addEventListener(APP_EVENTS.authSessionChanged, handleSessionChange);
    return () => window.removeEventListener(APP_EVENTS.authSessionChanged, handleSessionChange);
  }, [resetSearchData]);

  useEffect(() => {
    const user = authService.getCurrentUser();
    if (!user) {
      resetSearchData();
    }
  }, [resetSearchData]);

  useEffect(() => {
    if (!closeOnOutsideInteraction) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;

      const resultsEl = document.getElementById(resultsListId);
      if (resultsEl?.contains(target)) return;

      dismissSearchPanel();
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [closeOnOutsideInteraction, dismissSearchPanel, resultsListId]);

  const openSearch = useCallback(() => {
    void loadData();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [loadData]);

  const openFromIconTrigger = useCallback(() => {
    onExpandedChange?.(true);
    openSearch();
  }, [onExpandedChange, openSearch]);

  useEffect(() => {
    if (!isIconTriggerMode || !expanded) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [expanded, isIconTriggerMode]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key !== '@') return;
      if (isEditableTarget(event.target)) return;

      event.preventDefault();
      openSearch();
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [openSearch]);

  const results = useMemo(
    () => (data ? searchGlobal(query, data) : []),
    [query, data],
  );

  const groupedResults = useMemo(() => {
    const groups = new Map<GlobalSearchResultType, GlobalSearchResult[]>();
    for (const result of results) {
      const current = groups.get(result.type) ?? [];
      current.push(result);
      groups.set(result.type, current);
    }
    return GROUP_ORDER.flatMap((type) => {
      const items = groups.get(type);
      return items?.length ? [{ type, items }] : [];
    });
  }, [results]);

  const flatResults = useMemo(
    () => groupedResults.flatMap((group) => group.items),
    [groupedResults],
  );

  useEffect(() => {
    setActiveIndex(flatResults.length > 0 ? 0 : -1);
  }, [flatResults]);

  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(
      `[data-result-index="${activeIndex}"]`,
    );
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const showLoading = showDropdown && loading && !data;
  const showNoResults = showDropdown && !loading && !loadError && data && results.length === 0;

  const handleSelect = (result: GlobalSearchResult) => {
    setQuery('');
    setActiveIndex(-1);
    inputRef.current?.blur();
    if (result.type === 'document' && result.documentId) {
      navigate(result.href, { state: { openDocumentId: result.documentId } });
      return;
    }
    navigate(result.href);
  };

  const handleVoiceInput = useCallback(
    (transcript: string) => {
      const base = voiceBaseQueryRef.current.trim();
      const next = base ? `${base} ${transcript}` : transcript;
      setQuery(next);
      void loadData();
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [loadData],
  );

  const handleVoiceInterim = useCallback((transcript: string) => {
    const base = voiceBaseQueryRef.current.trim();
    setQuery(base ? `${base} ${transcript}` : transcript);
  }, []);

  const handleVoiceClick = () => {
    clearSpeechError();
    void loadData();
    requestAnimationFrame(() => inputRef.current?.focus());
    if (!isListening) {
      voiceBaseQueryRef.current = query;
    }
    void toggleSpeech(handleVoiceInput, handleVoiceInterim);
  };

  const showVoice = isSpeechSupported;

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (flatResults.length === 0) return;
      setActiveIndex((current) => (current + 1) % flatResults.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (flatResults.length === 0) return;
      setActiveIndex((current) => (current <= 0 ? flatResults.length - 1 : current - 1));
      return;
    }

    if (event.key === 'Enter' && activeIndex >= 0 && flatResults[activeIndex]) {
      event.preventDefault();
      handleSelect(flatResults[activeIndex]);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      dismissSearchPanel();
    }
  };

  let resultIndex = -1;

  const searchTrailing =
    trimmedQuery ? (
      <button
        type="button"
        className={styles.clearBtn}
        aria-label="Limpiar b\u00fasqueda"
        onClick={() => {
          if (isListening) stopSpeech();
          setQuery('');
          inputRef.current?.focus();
        }}
      >
        <X size={11} strokeWidth={2.5} />
      </button>
    ) : showVoice ? (
      <div className={styles.voiceTrailing}>
        {isListening && (
          <span className={styles.voiceTimer} aria-live="polite">
            {formatListeningElapsed(listeningElapsedSeconds)}
          </span>
        )}
        <button
          type="button"
          className={cx(styles.voiceBtn, isListening && styles.voiceBtnListening)}
          aria-label={isListening ? 'Detener grabación y transcribir' : 'Grabar y transcribir búsqueda'}
          aria-pressed={isListening}
          onClick={handleVoiceClick}
        >
          {isListening ? (
            <Pause size={14} strokeWidth={2.25} aria-hidden />
          ) : (
            <Mic size={14} strokeWidth={2.25} aria-hidden />
          )}
        </button>
      </div>
    ) : null;

  if (isIconTriggerMode && !isSearchExpanded) {
    return (
      <div ref={rootRef} className={cx(styles.root, styles.rootIconTrigger)}>
        <button
          type="button"
          className={styles.iconTriggerBtn}
          aria-label="Buscar contactos, actividades y documentos"
          aria-expanded={false}
          onClick={openFromIconTrigger}
        >
          <Search size={18} strokeWidth={2.25} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cx(
        styles.root,
        hug && styles.rootHug,
        isIconTriggerMode && styles.rootIconTriggerExpanded,
      )}
    >
      <SearchField
        ref={inputRef}
        wrapperClassName={
          toolbar
            ? hug
              ? styles.searchShellHug
              : forms.searchShell
            : cx(styles.searchBar, compact && styles.searchBarCompact)
        }
        className={
          toolbar
            ? hug
              ? styles.searchControlHug
              : undefined
            : compact
              ? styles.searchInputCompact
              : undefined
        }
        iconSize={toolbar ? 16 : compact ? 14 : 16}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          void loadData();
        }}
        onFocus={() => void loadData()}
        onKeyDown={handleInputKeyDown}
        placeholder="Busca lo que se te ocurra"
        aria-label="Buscar contactos, actividades y documentos"
        aria-expanded={showDropdown}
        aria-controls={resultsListId}
        aria-autocomplete="list"
        aria-activedescendant={
          activeIndex >= 0 ? `${resultsListId}-option-${activeIndex}` : undefined
        }
        role="combobox"
        trailing={searchTrailing}
      />

      {showVoiceError && panelPosition && (
        <Portal>
          <div
            className={styles.voiceErrorPortal}
            style={{
              top: panelPosition.top,
              left: panelPosition.left,
              width: panelPosition.width,
            }}
          >
            <div className={styles.voiceError} role="status">
              <p className={styles.voiceErrorText}>{speechError}</p>
              <button
                type="button"
                className={styles.voiceErrorClose}
                aria-label="Cerrar mensaje"
                onClick={clearSpeechError}
              >
                <X size={12} strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          </div>
        </Portal>
      )}

      {showDropdown && panelPosition && (
        <Portal>
          <div
            id={resultsListId}
            ref={listRef}
            className={cx(styles.dropdown, styles.dropdownPortal)}
            style={{
              top: panelPosition.top,
              left: panelPosition.left,
              width: panelPosition.width,
            }}
            role="listbox"
            aria-label="Resultados de b\u00fasqueda"
          >
          {showLoading && (
            <p className={styles.statusMessage}>Buscando...</p>
          )}

          {loadError && (
            <p className={styles.statusMessage}>No se pudieron cargar los datos.</p>
          )}

          {showNoResults && (
            <p className={styles.statusMessage}>
              Sin resultados para &quot;{trimmedQuery}&quot;
            </p>
          )}

          {!loadError && groupedResults.map(({ type, items }) => (
            <section key={type} className={styles.group}>
              <p className={styles.groupLabel}>{GLOBAL_SEARCH_GROUP_LABELS[type]}</p>
              {items.map((result) => {
                resultIndex += 1;
                const index = resultIndex;
                const isActive = index === activeIndex;

                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    id={`${resultsListId}-option-${index}`}
                    data-result-index={index}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={cx(styles.resultBtn, isActive && styles.resultBtnActive)}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => handleSelect(result)}
                  >
                    <span className={styles.resultTitle}>{result.title}</span>
                    <span className={styles.resultSubtitle}>{result.subtitle}</span>
                  </button>
                );
              })}
            </section>
          ))}
          </div>
        </Portal>
      )}
    </div>
  );
}
