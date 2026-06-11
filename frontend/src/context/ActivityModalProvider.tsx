import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useMatch, useNavigate, useSearchParams } from 'react-router';
import type { Activity, CalendarEvent } from '@shared/types';
import { aggregateEventTimeRange, getAssigneeIdsFromSlots } from '@shared/types';
import { activitiesService, eventsService } from '@/api';
import ActivityFormModal from '@/components/ActivityFormModal';
import { activityDetailPath, newActivityPath } from '@/lib/activityPaths';
import {
  consumeActivitiesReturnUrl,
  storeActivitiesReturnUrl,
} from '@/lib/activitiesReturnUrl';
import { activitiesListPathForTeamFilterSegment } from '@/lib/activitiesTeamFilter';
import { useCloseAllPopups } from '@/context/PopupStackContext';
import {
  ActivityModalContext,
  type ActivityModalFocusSection,
  type OpenActivityModalOptions,
} from './activityModalContext';

function findEventForActivity(activity: Activity, events: CalendarEvent[]) {
  return (
    events.find((event) => event.activityId === activity.id) ??
    events.find(
      (event) =>
        event.clientId === activity.clientId &&
        event.date === activity.date &&
        event.description === activity.description,
    )
  );
}

export function ActivityModalProvider({ children }: { children: React.ReactNode }) {
  const closeAllPopups = useCloseAllPopups();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const newRouteMatch = useMatch('/activities/new');
  const detailRouteMatch = useMatch('/activities/:id');
  const activityIdFromUrl = detailRouteMatch?.params.id;

  const [open, setOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<CalendarEvent | null>(null);
  const [activityToEdit, setActivityToEdit] = useState<Activity | null>(null);
  const [initialDate, setInitialDate] = useState<string | undefined>();
  const [directForm, setDirectForm] = useState(false);
  const [initialEditMode, setInitialEditMode] = useState(false);
  const [initialFocusSection, setInitialFocusSection] = useState<
    ActivityModalFocusSection | undefined
  >();
  const activityListenersRef = useRef<Set<() => void | Promise<void>>>(new Set());
  const documentListenersRef = useRef<Set<() => void | Promise<void>>>(new Set());
  const [activitiesRefreshKey, setActivitiesRefreshKey] = useState(0);
  const resolvedUrlRef = useRef<string | null>(null);
  const suppressRouteOpenRef = useRef(false);
  const overlayModeRef = useRef(false);

  const notifyActivitySaved = useCallback(async () => {
    setActivitiesRefreshKey((key) => key + 1);
    await Promise.all(
      Array.from(activityListenersRef.current).map(async (listener) => {
        await listener();
      }),
    );
  }, []);

  const notifyDocumentSaved = useCallback(async () => {
    await Promise.all(
      Array.from(documentListenersRef.current).map(async (listener) => {
        await listener();
      }),
    );
  }, []);

  const resetModalState = useCallback(() => {
    setOpen(false);
    setEventToEdit(null);
    setActivityToEdit(null);
    setInitialDate(undefined);
    setDirectForm(false);
    setInitialEditMode(false);
    setInitialFocusSection(undefined);
  }, []);

  const applyOpenOptions = useCallback((options?: OpenActivityModalOptions) => {
    setInitialEditMode(options?.editMode ?? false);
    setInitialFocusSection(options?.focusSection);
  }, []);

  useEffect(() => {
    if (suppressRouteOpenRef.current) {
      if (!newRouteMatch && !activityIdFromUrl) {
        suppressRouteOpenRef.current = false;
      } else {
        return;
      }
    }

    if (newRouteMatch) {
      resolvedUrlRef.current = '/activities/new';
      setEventToEdit(null);
      setActivityToEdit(null);
      setInitialDate(searchParams.get('date') ?? undefined);
      setDirectForm(searchParams.get('direct') === '1');
      setOpen(true);
      return;
    }

    const teamFilterListPath = activityIdFromUrl
      ? activitiesListPathForTeamFilterSegment(activityIdFromUrl)
      : null;
    if (teamFilterListPath) {
      resolvedUrlRef.current = null;
      resetModalState();
      navigate(teamFilterListPath, { replace: true });
      return;
    }

    if (!activityIdFromUrl) {
      if (overlayModeRef.current) return;
      // Evita cerrar el modal mientras navigate() aún no ha aplicado /activities/:id
      if (resolvedUrlRef.current && location.pathname.startsWith('/activities/')) return;
      resolvedUrlRef.current = null;
      resetModalState();
      return;
    }

    if (resolvedUrlRef.current === activityIdFromUrl) {
      if (open) return;
      resolvedUrlRef.current = null;
    }

    let cancelled = false;

    (async () => {
      const activity = await activitiesService.getById(activityIdFromUrl);
      if (cancelled) return;

      if (activity) {
        const events = await eventsService.getAll();
        if (cancelled) return;
        setActivityToEdit(activity);
        setEventToEdit(findEventForActivity(activity, events));
        setInitialDate(undefined);
        setDirectForm(false);
        setOpen(true);
        resolvedUrlRef.current = activityIdFromUrl;
        return;
      }

      const event = await eventsService.getById(activityIdFromUrl);
      if (cancelled) return;

      if (event) {
        setActivityToEdit(null);
        setEventToEdit(event);
        setInitialDate(undefined);
        setDirectForm(false);
        setOpen(true);
        resolvedUrlRef.current = activityIdFromUrl;
        return;
      }

      resolvedUrlRef.current = null;
      resetModalState();
      navigate('/activities', { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [newRouteMatch, activityIdFromUrl, searchParams, navigate, resetModalState, open, location.pathname]);

  const openNew = useCallback(
    (date?: string, options?: OpenNewActivityOptions) => {
      storeActivitiesReturnUrl(location.pathname, location.search);
      navigate(newActivityPath(date, options?.directForm));
    },
    [navigate, location.pathname, location.search],
  );

  const openEdit = useCallback(
    (event: CalendarEvent, options?: OpenActivityModalOptions) => {
      const routeId = event.activityId ?? event.id;
      if (options?.navigate !== false) {
        storeActivitiesReturnUrl(location.pathname, location.search);
      }
      resolvedUrlRef.current = routeId;
      applyOpenOptions(options);
      setActivityToEdit(null);
      setEventToEdit(event);
      setInitialDate(undefined);
      setDirectForm(false);
      setOpen(true);

      if (options?.navigate === false) {
        overlayModeRef.current = true;
        return;
      }

      overlayModeRef.current = false;
      navigate(activityDetailPath(routeId));
    },
    [navigate, applyOpenOptions, location.pathname, location.search],
  );

  const openEditByActivity = useCallback(
    (activity: Activity, events?: CalendarEvent[], options?: OpenActivityModalOptions) => {
      const event = events ? (findEventForActivity(activity, events) ?? null) : null;
      if (options?.navigate !== false) {
        storeActivitiesReturnUrl(location.pathname, location.search);
      }
      resolvedUrlRef.current = activity.id;
      applyOpenOptions(options);
      setActivityToEdit(activity);
      setEventToEdit(event);
      setInitialDate(undefined);
      setDirectForm(false);
      setOpen(true);

      if (options?.navigate === false) {
        overlayModeRef.current = true;
        return;
      }

      overlayModeRef.current = false;
      navigate(activityDetailPath(activity.id));
    },
    [navigate, applyOpenOptions, location.pathname, location.search],
  );

  const close = useCallback(() => {
    suppressRouteOpenRef.current = true;
    resolvedUrlRef.current = null;
    const wasOverlay = overlayModeRef.current;
    overlayModeRef.current = false;
    resetModalState();
    if (wasOverlay) return;
    navigate(consumeActivitiesReturnUrl());
  }, [navigate, resetModalState]);

  const onActivitySaved = useCallback((listener: () => void) => {
    activityListenersRef.current.add(listener);
    return () => {
      activityListenersRef.current.delete(listener);
    };
  }, []);

  const onDocumentSaved = useCallback((listener: () => void) => {
    documentListenersRef.current.add(listener);
    return () => {
      documentListenersRef.current.delete(listener);
    };
  }, []);

  const handleActivityUpdated = useCallback((activity: Activity) => {
    setActivityToEdit((prev) => (prev?.id === activity.id ? activity : prev));
    const slots = activity.assigneeSlots;
    if (!slots?.length) return;
    const { startTime, endTime } = aggregateEventTimeRange(slots);
    const assignedTo = getAssigneeIdsFromSlots(slots);
    setEventToEdit((prev) =>
      prev?.activityId === activity.id
        ? { ...prev, startTime, endTime, assignedTo, date: activity.date }
        : prev,
    );
  }, []);

  const handleSaved = useCallback(async () => {
    closeAllPopups();
    await notifyActivitySaved();
    suppressRouteOpenRef.current = true;
    resolvedUrlRef.current = null;
    const wasOverlay = overlayModeRef.current;
    overlayModeRef.current = false;
    resetModalState();
    if (!wasOverlay) {
      navigate(consumeActivitiesReturnUrl());
    }
  }, [closeAllPopups, notifyActivitySaved, resetModalState, navigate]);

  return (
    <ActivityModalContext.Provider
      value={{
        openNew,
        openEdit,
        openEditByActivity,
        activeEventId: open ? (eventToEdit?.id ?? null) : null,
        activeActivityId: open ? (activityToEdit?.id ?? null) : null,
        close,
        onActivitySaved,
        onDocumentSaved,
        notifyActivitySaved,
        notifyDocumentSaved,
        activitiesRefreshKey,
      }}
    >
      {children}
      {open && (
        <ActivityFormModal
          eventToEdit={eventToEdit}
          activityToEdit={activityToEdit}
          initialDate={initialDate}
          directForm={directForm}
          initialEditMode={initialEditMode}
          initialFocusSection={initialFocusSection}
          onClose={close}
          onSaved={handleSaved}
          onActivityUpdated={handleActivityUpdated}
        />
      )}
    </ActivityModalContext.Provider>
  );
}
