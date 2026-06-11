import { useCallback, useEffect, useRef, useState } from 'react';

import { Camera, ChevronDown, CircleMinus, CloudUpload, Plus, X } from 'lucide-react';

import type { Activity, ActivityWorkReportZone, ActivityWorkReportZoneImage } from '@shared/types';
import {
  getActivityWorkReport,
  getActivityWorkReportZones,
  MAX_WORK_REPORT_ZONES,
  MAX_WORK_REPORT_ZONE_IMAGES,
} from '@shared/types';

import { activitiesService } from '@/api/activities';
import { ApiError } from '@/api/client';
import { Input, Textarea } from '@/components/forms';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from '@/pages/Calendar.module.css';

export type WorkReportZoneDraft = {
  id: string;
  title: string;
  notes: string;
  images: ActivityWorkReportZoneImage[];
};

type ZonesChangeArg =
  | WorkReportZoneDraft[]
  | ((prev: WorkReportZoneDraft[]) => WorkReportZoneDraft[]);

type ActivityWorkReportZonesEditorProps = {
  activityId: string;
  zones: WorkReportZoneDraft[];
  readOnly?: boolean;
  disabled?: boolean;
  onZonesChange: (zones: ZonesChangeArg) => void;
  onActivityUpdated: (activity: Activity) => void;
  /** Guarda borrador de zonas en servidor antes de subir imagenes. */
  ensureZonesPersisted?: () => Promise<Activity | null>;
  reportUserId?: string;
  onError?: (message: string | null) => void;
};

const DEFAULT_WORK_REPORT_ZONE_ID = 'work-report-zone-default';

function createZoneDraft(index: number): WorkReportZoneDraft {
  return {
    id: index === 0 ? DEFAULT_WORK_REPORT_ZONE_ID : crypto.randomUUID(),
    title: index === 0 ? 'Zona 1' : `Zona ${index + 1}`,
    notes: '',
    images: [],
  };
}

function formatZoneSummaryMeta(zone: WorkReportZoneDraft): string | null {
  const parts: string[] = [];
  const notes = zone.notes.trim();
  if (notes) {
    parts.push(notes.length > 48 ? `${notes.slice(0, 48)}...` : notes);
  }
  if (zone.images.length > 0) {
    parts.push(
      zone.images.length === 1 ? '1 foto' : `${zone.images.length} fotos`,
    );
  }
  return parts.length > 0 ? parts.join('  ') : null;
}

function WorkReportZoneImageThumb({
  activityId,
  image,
  readOnly,
  disabled,
  onRemove,
}: {
  activityId: string;
  image: ActivityWorkReportZoneImage;
  readOnly?: boolean;
  disabled?: boolean;
  onRemove: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setLoading(true);

    void activitiesService.getWorkReportImageBlob(activityId, image.id).then(
      (blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
        setLoading(false);
      },
      () => {
        if (!active) return;
        setLoading(false);
      },
    );

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [activityId, image.id]);

  return (
    <figure className={styles.activityWorkReportZoneImage}>
      {loading ? (
        <div className={styles.activityWorkReportZoneImagePlaceholder} aria-hidden />
      ) : previewUrl ? (
        <img src={previewUrl} alt={image.filename ?? 'Imagen del informe'} />
      ) : (
        <div className={styles.activityWorkReportZoneImagePlaceholder} aria-hidden />
      )}
      {!readOnly ? (
        <button
          type="button"
          className={styles.activityWorkReportZoneImageRemove}
          disabled={disabled}
          onClick={onRemove}
          aria-label="Eliminar imagen"
        >
          <X size={14} aria-hidden />
        </button>
      ) : null}
    </figure>
  );
}

export default function ActivityWorkReportZonesEditor({
  activityId,
  zones,
  readOnly = false,
  disabled = false,
  onZonesChange,
  onActivityUpdated,
  ensureZonesPersisted,
  reportUserId,
  onError,
}: ActivityWorkReportZonesEditorProps) {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const pendingZoneIdRef = useRef<string | null>(null);
  const [uploadingZoneId, setUploadingZoneId] = useState<string | null>(null);
  const [expandedZoneId, setExpandedZoneId] = useState<string | null>(null);
  const zoneIdsKey = zones.map((zone) => zone.id).join('|');

  useEffect(() => {
    if (!expandedZoneId) return;
    if (zones.some((zone) => zone.id === expandedZoneId)) return;
    setExpandedZoneId(null);
  }, [expandedZoneId, zoneIdsKey, zones]);

  const handleZoneFieldChange = useCallback(
    (zoneId: string, field: 'title' | 'notes', value: string) => {
      onZonesChange((current) =>
        current.map((zone) => (zone.id === zoneId ? { ...zone, [field]: value } : zone)),
      );
    },
    [onZonesChange],
  );

  const handleAddZone = useCallback(() => {
    onZonesChange((current) => {
      if (current.length >= MAX_WORK_REPORT_ZONES) {
        onError?.(`Maximo ${MAX_WORK_REPORT_ZONES} zonas por informe.`);
        return current;
      }
      const nextZone = createZoneDraft(current.length);
      setExpandedZoneId(nextZone.id);
      return [...current, nextZone];
    });
  }, [onError, onZonesChange]);

  const toggleZoneExpanded = useCallback((zoneId: string) => {
    setExpandedZoneId((current) => (current === zoneId ? null : zoneId));
  }, []);

  const handleRemoveZone = useCallback(
    (zoneId: string) => {
      onZonesChange((current) => current.filter((zone) => zone.id !== zoneId));
      if (expandedZoneId === zoneId) {
        setExpandedZoneId(null);
      }
    },
    [expandedZoneId, onZonesChange],
  );

  const handleUploadClick = useCallback(
    (zoneId: string, mode: 'file' | 'camera') => {
      if (disabled) return;
      pendingZoneIdRef.current = zoneId;
      if (mode === 'camera') {
        captureInputRef.current?.click();
      } else {
        uploadInputRef.current?.click();
      }
    },
    [disabled],
  );

  const uploadFilesToZone = useCallback(
    async (zoneId: string, files: File[]) => {
      if (!zoneId || disabled || files.length === 0) return;

      setExpandedZoneId(zoneId);
      setUploadingZoneId(zoneId);
      onError?.(null);

      try {
        let latestActivity: Activity | null = null;
        if (ensureZonesPersisted) {
          latestActivity = await ensureZonesPersisted();
          if (!latestActivity) return;
        }

        const resolveZoneImageCount = (activity: Activity | null): number => {
          if (activity && reportUserId) {
            const report = getActivityWorkReport(activity, reportUserId);
            const serverZone = getActivityWorkReportZones(report).find(
              (entry) => entry.id === zoneId,
            );
            if (serverZone) return serverZone.images.length;
          }
          return zones.find((entry) => entry.id === zoneId)?.images.length ?? 0;
        };

        let zoneImageCount = resolveZoneImageCount(latestActivity);

        for (const file of files) {
          if (zoneImageCount >= MAX_WORK_REPORT_ZONE_IMAGES) {
            onError?.(`Maximo ${MAX_WORK_REPORT_ZONE_IMAGES} imagenes por zona.`);
            break;
          }

          latestActivity = await activitiesService.uploadWorkReportZoneImage(
            activityId,
            zoneId,
            file,
          );
          zoneImageCount += 1;
        }

        if (latestActivity) {
          onActivityUpdated(latestActivity);
        }
      } catch (error) {
        onError?.(
          error instanceof ApiError
            ? error.message
            : 'No se pudo subir la imagen. Intentalo de nuevo.',
        );
      } finally {
        setUploadingZoneId(null);
      }
    },
    [activityId, disabled, ensureZonesPersisted, onActivityUpdated, onError, reportUserId, zones],
  );

  const handleFilesSelected = useCallback(
    (files: FileList | null, input: HTMLInputElement | null) => {
      const zoneId = pendingZoneIdRef.current;
      pendingZoneIdRef.current = null;
      if (input) input.value = '';
      if (!files?.length || !zoneId) return;
      void uploadFilesToZone(zoneId, Array.from(files));
    },
    [uploadFilesToZone],
  );

  const handleRemoveImage = useCallback(
    async (imageId: string) => {
      if (disabled) return;
      onError?.(null);
      try {
        const updated = await activitiesService.deleteWorkReportZoneImage(activityId, imageId);
        onActivityUpdated(updated);
      } catch (error) {
        onError?.(
          error instanceof ApiError
            ? error.message
            : 'No se pudo eliminar la imagen. Intentalo de nuevo.',
        );
      }
    },
    [activityId, disabled, onActivityUpdated, onError],
  );

  if (zones.length === 0 && readOnly) {
    return null;
  }

  return (
    <div className={styles.activityWorkReportZones}>
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        onChange={(event) => handleFilesSelected(event.target.files, event.currentTarget)}
        hidden
        aria-hidden
        tabIndex={-1}
      />
      <input
        ref={captureInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => handleFilesSelected(event.target.files, event.currentTarget)}
        hidden
        aria-hidden
        tabIndex={-1}
      />

      <div className={styles.activityWorkReportZonesHeader}>
        <div>
          <p className={styles.activityWorkReportFieldLabel}>Notas por zonas</p>
          <p className={styles.activityWorkReportHint}>
            Organiza el informe por zonas con titulo, notas e imagenes (max.{' '}
            {MAX_WORK_REPORT_ZONE_IMAGES} por zona).
          </p>
        </div>
        {!readOnly ? (
          <button
            type="button"
            className={ui.btnSecondary}
            disabled={disabled || zones.length >= MAX_WORK_REPORT_ZONES}
            onClick={handleAddZone}
          >
            <Plus size={16} aria-hidden />
            Anadir zona
          </button>
        ) : null}
      </div>

      {zones.length === 0 ? (
        <p className={styles.activityWorkReportZonesEmpty}>
          Sin zonas. Pulsa &quot;Anadir zona&quot; para empezar a anotar.
        </p>
      ) : (
        <div className={styles.activityWorkReportZonesList}>
          {zones.map((zone, index) => {
            const uploading = uploadingZoneId === zone.id;
            const zoneLabel = zone.title.trim() || `Zona ${index + 1}`;
            const zoneMeta = formatZoneSummaryMeta(zone);
            const hasReadOnlyBodyContent =
              Boolean(zone.notes.trim()) || zone.images.length > 0;
            const canToggleZone = !readOnly || hasReadOnlyBodyContent;
            const isExpanded = canToggleZone && expandedZoneId === zone.id;
            return (
              <section
                key={zone.id}
                className={cx(
                  styles.activityWorkReportZoneCard,
                  isExpanded && styles.activityWorkReportZoneCardExpanded,
                )}
              >
                <div className={styles.activityWorkReportZoneCardHeader}>
                  {canToggleZone ? (
                    <button
                      type="button"
                      className={styles.activityWorkReportZoneToggle}
                      onClick={() => toggleZoneExpanded(zone.id)}
                      aria-expanded={isExpanded}
                      aria-controls={`work-report-zone-panel-${zone.id}`}
                    >
                      <ChevronDown
                        size={18}
                        aria-hidden
                        className={cx(
                          styles.activityWorkReportZoneChevron,
                          isExpanded && styles.activityWorkReportZoneChevronOpen,
                        )}
                      />
                      <span className={styles.activityWorkReportZoneToggleText}>
                        <span className={styles.activityWorkReportZoneToggleTitle}>
                          {zoneLabel}
                        </span>
                        {!isExpanded && zoneMeta ? (
                          <span className={styles.activityWorkReportZoneToggleMeta}>
                            {zoneMeta}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ) : (
                    <div className={styles.activityWorkReportZoneToggleStatic}>
                      <span className={styles.activityWorkReportZoneToggleText}>
                        <span className={styles.activityWorkReportZoneToggleTitle}>
                          {zoneLabel}
                        </span>
                      </span>
                    </div>
                  )}
                  {!readOnly && zones.length > 1 ? (
                    <button
                      type="button"
                      className={styles.activityWorkReportZoneRemove}
                      disabled={disabled || uploading}
                      onClick={() => handleRemoveZone(zone.id)}
                      aria-label={`Eliminar zona ${index + 1}`}
                    >
                      <CircleMinus size={16} aria-hidden />
                    </button>
                  ) : null}
                </div>

                {isExpanded ? (
                  <div
                    id={`work-report-zone-panel-${zone.id}`}
                    className={styles.activityWorkReportZoneCardBody}
                  >
                    {!readOnly ? (
                      <Input
                        value={zone.title}
                        disabled={disabled || uploading}
                        onChange={(event) =>
                          handleZoneFieldChange(zone.id, 'title', event.target.value)
                        }
                        placeholder={`Zona ${index + 1}`}
                        aria-label={`Titulo zona ${index + 1}`}
                        className={styles.activityWorkReportZoneTitleInput}
                      />
                    ) : null}

                    {readOnly ? (
                  zone.notes.trim() ? (
                    <p className={styles.activityWorkReportZoneNotesReadonly}>{zone.notes}</p>
                  ) : null
                ) : (
                  <Textarea
                    rows={3}
                    value={zone.notes}
                    disabled={disabled || uploading}
                    onChange={(event) =>
                      handleZoneFieldChange(zone.id, 'notes', event.target.value)
                    }
                    placeholder="Notas de la zona: material, incidencias, observaciones..."
                    aria-label={`Notas zona ${index + 1}`}
                  />
                )}

                {zone.images.length > 0 ? (
                  <div className={styles.activityWorkReportZoneImages}>
                    {zone.images.map((image) => (
                      <WorkReportZoneImageThumb
                        key={image.id}
                        activityId={activityId}
                        image={image}
                        readOnly={readOnly}
                        disabled={disabled || uploading}
                        onRemove={() => void handleRemoveImage(image.id)}
                      />
                    ))}
                  </div>
                ) : null}

                {!readOnly ? (
                  <div className={styles.activityWorkReportZoneImageActions}>
                    <button
                      type="button"
                      className={ui.btnSecondary}
                      disabled={
                        disabled ||
                        uploading ||
                        zone.images.length >= MAX_WORK_REPORT_ZONE_IMAGES
                      }
                      onClick={() => handleUploadClick(zone.id, 'file')}
                    >
                      <CloudUpload size={16} aria-hidden />
                      {uploading ? 'Subiendo...' : 'Subir imagen'}
                    </button>
                    <button
                      type="button"
                      className={ui.btnSecondary}
                      disabled={
                        disabled ||
                        uploading ||
                        zone.images.length >= MAX_WORK_REPORT_ZONE_IMAGES
                      }
                      onClick={() => handleUploadClick(zone.id, 'camera')}
                    >
                      <Camera size={16} aria-hidden />
                      Hacer foto
                    </button>
                  </div>
                ) : null}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function mapWorkReportZonesFromActivity(
  report: { zones?: ActivityWorkReportZone[]; notes?: string } | null | undefined,
): WorkReportZoneDraft[] {
  if (!report) return [createZoneDraft(0)];
  if (Array.isArray(report.zones) && report.zones.length > 0) {
    return report.zones.map((zone) => ({
      id: zone.id,
      title: zone.title,
      notes: zone.notes,
      images: zone.images ?? [],
    }));
  }
  if (report.notes?.trim()) {
    return [{ id: 'legacy-general', title: 'General', notes: report.notes, images: [] }];
  }
  return [createZoneDraft(0)];
}

export function serializeWorkReportZoneDrafts(
  zones: WorkReportZoneDraft[],
): Array<{ id: string; title: string; notes: string }> {
  return zones.map((zone) => ({
    id: zone.id,
    title: zone.title.trim(),
    notes: zone.notes.trim(),
  }));
}

export function buildWorkReportFormSnapshot(
  zones: WorkReportZoneDraft[],
  workedMinutes: number,
): string {
  return JSON.stringify({
    workedMinutes,
    zones: zones.map((zone) => ({
      id: zone.id,
      title: zone.title.trim(),
      notes: zone.notes.trim(),
      imageIds: zone.images.map((image) => image.id).sort(),
    })),
  });
}

export function buildWorkReportSavedSnapshot(
  report:
    | { zones?: ActivityWorkReportZone[]; notes?: string; workedMinutes?: number }
    | null
    | undefined,
): string {
  if (!report) return buildWorkReportFormSnapshot([], 0);
  return buildWorkReportFormSnapshot(
    mapWorkReportZonesFromActivity(report),
    report.workedMinutes ?? 0,
  );
}

export function mergeWorkReportZoneDrafts(
  current: WorkReportZoneDraft[],
  serverZones: ActivityWorkReportZone[],
): WorkReportZoneDraft[] {
  const serverById = new Map(serverZones.map((zone) => [zone.id, zone]));
  const merged = current.map((zone) => {
    const server = serverById.get(zone.id);
    if (!server) return zone;
    return { ...zone, images: server.images };
  });

  for (const serverZone of serverZones) {
    if (!merged.some((zone) => zone.id === serverZone.id)) {
      merged.push({
        id: serverZone.id,
        title: serverZone.title,
        notes: serverZone.notes,
        images: serverZone.images,
      });
    }
  }

  return merged;
}
