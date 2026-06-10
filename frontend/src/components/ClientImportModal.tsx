import { useRef, useState } from 'react';
import { Upload, X, AlertTriangle, CheckCircle2, Download } from 'lucide-react';
import ModalHeader from '@/components/ModalHeader';
import { ModalActions, ModalFooter, modalBtnPrimary, modalBtnSecondary } from '@/components/ModalFooter';
import ModalOverlay from '@/components/ModalOverlay';
import { usePopupEscape } from '@/context/PopupStackContext';
import type { Client } from '@shared/types';
import { clientsService } from '@/api';
import {
  analyzeClientsCsv,
  applyImportStatus,
  downloadSampleClientsCsv,
  findImportDuplicates,
  type ClientImportRow,
  type DuplicateStrategy,
  type ImportColumnDetection,
  type ImportDuplicate,
} from '@/lib/clientCsv';
import { CLIENT_STATUS_LABELS } from '@/lib/clientStatus';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import { Select } from '@/components/forms';
import styles from './ClientImportModal.module.css';

type Step = 'drop' | 'review' | 'done';

interface ClientImportModalProps {
  open: boolean;
  clients: Client[];
  defaultGroupId: string;
  onClose: () => void;
  onImported: () => Promise<void>;
}

const COLUMN_LABELS: Record<keyof ImportColumnDetection, string> = {
  cliente: 'Nombre',
  contacto: 'Contacto',
  direccion: 'Dirección',
  estado: 'Estado',
};

const STRATEGY_OPTIONS: { value: DuplicateStrategy; label: string; hint: string }[] = [
  {
    value: 'skip',
    label: 'Omitir duplicados',
    hint: 'No importa las filas que coinciden con contactos existentes.',
  },
  {
    value: 'create',
    label: 'Duplicar',
    hint: 'Crea un contacto nuevo aunque ya exista uno con el mismo email o nombre.',
  },
  {
    value: 'update',
    label: 'Actualizar',
    hint: 'Actualiza el contacto existente con los datos del archivo.',
  },
];

function displayValue(value: string): string {
  return value.trim() || '—';
}

function getDuplicateKey(row: ClientImportRow): string | null {
  const email = row.email.trim().toLowerCase();
  if (email) return `email:${email}`;
  const name = row.name.trim().toLowerCase();
  if (name) return `name:${name}`;
  return null;
}

function findExistingInDb(
  row: ClientImportRow,
  byEmail: Map<string, Client>,
  byName: Map<string, Client>,
): Client | null {
  const email = row.email.trim().toLowerCase();
  if (email && byEmail.has(email)) return byEmail.get(email)!;

  const name = row.name.trim().toLowerCase();
  if (name && byName.has(name)) return byName.get(name)!;

  return null;
}

async function runImport(
  rows: ClientImportRow[],
  existingClients: Client[],
  strategy: DuplicateStrategy,
  importStatus: Client['status'],
  defaultGroupId: string,
): Promise<{ created: number; updated: number; skipped: number }> {
  const byEmail = new Map<string, Client>();
  const byName = new Map<string, Client>();

  for (const client of existingClients) {
    const email = client.email.trim().toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, client);

    const name = client.name.trim().toLowerCase();
    if (name && !byName.has(name)) byName.set(name, client);
  }

  const importedByKey = new Map<string, Client>();
  const seenInFile = new Set<string>();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const basePayload = { ...row, status: importStatus };
    const key = getDuplicateKey(basePayload);
    const existingInDb = findExistingInDb(basePayload, byEmail, byName);
    const existingInBatch = key ? importedByKey.get(key) : undefined;
    const existing = existingInDb ?? existingInBatch ?? null;

    if (existing) {
      if (strategy === 'skip') {
        skipped += 1;
        continue;
      }

      if (strategy === 'update') {
        const updatedClient = await clientsService.update(existing.id, basePayload);
        updated += 1;
        if (key) importedByKey.set(key, updatedClient);
        if (existingInDb) {
          const email = updatedClient.email.trim().toLowerCase();
          if (email) byEmail.set(email, updatedClient);
          const name = updatedClient.name.trim().toLowerCase();
          if (name) byName.set(name, updatedClient);
        }
        continue;
      }
    } else if (key && seenInFile.has(key) && strategy === 'skip') {
      skipped += 1;
      continue;
    }

    const newClient = await clientsService.create({ ...basePayload, groupId: defaultGroupId });
    created += 1;
    if (key) {
      seenInFile.add(key);
      importedByKey.set(key, newClient);
      const email = newClient.email.trim().toLowerCase();
      if (email) byEmail.set(email, newClient);
      const name = newClient.name.trim().toLowerCase();
      if (name) byName.set(name, newClient);
    }
  }

  return { created, updated, skipped };
}

export default function ClientImportModal({
  open,
  clients,
  defaultGroupId,
  onClose,
  onImported,
}: ClientImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('drop');
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<Client['status']>('active');
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip');
  const [rows, setRows] = useState<ClientImportRow[]>([]);
  const [columns, setColumns] = useState<ImportColumnDetection | null>(null);
  const [duplicates, setDuplicates] = useState<ImportDuplicate[]>([]);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(
    null,
  );

  const resetState = () => {
    setStep('drop');
    setDragActive(false);
    setFileName('');
    setError(null);
    setImporting(false);
    setImportStatus('active');
    setDuplicateStrategy('skip');
    setRows([]);
    setColumns(null);
    setDuplicates([]);
    setResult(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  usePopupEscape(open, handleClose);

  const processFile = async (file: File) => {
    setError(null);
    setFileName(file.name);

    try {
      const text = await file.text();
      const analysis = analyzeClientsCsv(text);
      const foundDuplicates = findImportDuplicates(analysis.rows, clients);

      setRows(analysis.rows);
      setColumns(analysis.columns);
      setDuplicates(foundDuplicates);
      setStep('review');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo leer el archivo CSV.';
      setError(message);
      setStep('drop');
    }
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void processFile(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files[0];
    if (file) void processFile(file);
  };

  const handleImport = async () => {
    setImporting(true);
    setError(null);

    try {
      const rowsWithStatus = applyImportStatus(rows, importStatus);
      const importResult = await runImport(rowsWithStatus, clients, duplicateStrategy, importStatus, defaultGroupId);
      await onImported();
      setResult(importResult);
      setStep('done');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo importar el CSV.';
      setError(message);
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  return (
    <ModalOverlay>
      <div className={cx(ui.modal, ui.modalLg)}>
        <ModalHeader title="Importar contactos" onClose={handleClose} />

        <div className={ui.modalForm}>
          <div className={ui.modalScroll}>
            {step === 'drop' && (
              <>
                {error && <div className={styles.errorMessage}>{error}</div>}
                <div
                  className={cx(ui.dropzone, dragActive && styles.dropzoneActive)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  <Upload className={ui.dropzoneIcon} size={32} color="#a3a3a3" />
                  <p className={ui.textMuted}>Arrastra un archivo CSV o haz clic para seleccionar</p>
                  <p className={`${ui.textSmall} ${ui.textMuted}`}>
                    Columnas: nombre, email, teléfono, dirección, web, información técnica, estado
                  </p>
                </div>
                <p className={styles.sampleHint}>
                  <button
                    type="button"
                    className={styles.sampleDownload}
                    onClick={(event) => {
                      event.stopPropagation();
                      downloadSampleClientsCsv();
                    }}
                  >
                    <Download size={14} aria-hidden />
                    Descargar CSV de ejemplo
                  </button>
                  <span className={`${ui.textSmall} ${ui.textMuted}`}>
                    Incluye cabeceras y filas de muestra con el formato correcto.
                  </span>
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileInput}
                  hidden
                  aria-hidden
                  tabIndex={-1}
                />
              </>
            )}

            {step === 'review' && columns && (
              <>
                {error && <div className={styles.errorMessage}>{error}</div>}

                <p className={`${ui.textSmall} ${ui.textMuted}`} style={{ marginBottom: '1rem' }}>
                  Archivo: <span className={styles.fileName}>{fileName}</span> · {rows.length}{' '}
                  {rows.length === 1 ? 'fila' : 'filas'}
                </p>

                <div className={styles.columnBadges}>
                  {(Object.keys(COLUMN_LABELS) as (keyof ImportColumnDetection)[]).map((key) => (
                    <span
                      key={key}
                      className={cx(
                        styles.columnBadge,
                        columns[key] ? styles.columnBadgeDetected : styles.columnBadgeMissing,
                      )}
                    >
                      {columns[key] ? '✓' : '—'} {COLUMN_LABELS[key]}
                    </span>
                  ))}
                </div>

                {duplicates.length > 0 && (
                  <div className={styles.duplicateAlert}>
                    <div className={styles.duplicateAlertTitle}>
                      <AlertTriangle
                        size={16}
                        style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '0.375rem' }}
                      />
                      Se encontraron {duplicates.length}{' '}
                      {duplicates.length === 1 ? 'duplicado' : 'duplicados'}
                    </div>
                    <div className={styles.strategyOptions}>
                      {STRATEGY_OPTIONS.map((option) => (
                        <label
                          key={option.value}
                          className={cx(
                            styles.strategyOption,
                            duplicateStrategy === option.value && styles.strategyOptionSelected,
                          )}
                        >
                          <input
                            type="radio"
                            name="duplicateStrategy"
                            value={option.value}
                            checked={duplicateStrategy === option.value}
                            onChange={() => setDuplicateStrategy(option.value)}
                          />
                          <span>
                            <div className={styles.strategyLabel}>{option.label}</div>
                            <div className={styles.strategyHint}>{option.hint}</div>
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className={styles.previewScroll}>
                      <table className={styles.previewTable}>
                        <thead>
                          <tr>
                            <th>Fila</th>
                            <th>Importar</th>
                            <th>Existente</th>
                            <th>Coincidencia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {duplicates.map((duplicate) => (
                            <tr key={`${duplicate.rowIndex}-${duplicate.lineNumber}`}>
                              <td>{duplicate.lineNumber}</td>
                              <td>{displayValue(duplicate.row.name)}</td>
                              <td>{displayValue(duplicate.existingClient.name)}</td>
                              <td>{duplicate.matchField === 'email' ? 'Email' : 'Nombre'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className={ui.field} style={{ marginBottom: '1rem' }}>
                  <label className={ui.label}>Estado para todos los contactos importados</label>
                  <Select
                    value={importStatus}
                    onChange={(event) => setImportStatus(event.target.value as Client['status'])}
                  >
                    <option value="active">{CLIENT_STATUS_LABELS.active}</option>
                    <option value="inactive">{CLIENT_STATUS_LABELS.inactive}</option>
                    <option value="potential">{CLIENT_STATUS_LABELS.potential}</option>
                  </Select>
                </div>

                <div className={ui.sectionTitle}>Vista previa</div>
                <div className={styles.previewScroll}>
                  <table className={styles.previewTable}>
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Contacto</th>
                        <th>Dirección</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 10).map((row, index) => (
                        <tr key={index}>
                          <td>
                            {row.name.trim() ? (
                              row.name
                            ) : (
                              <span className={styles.emptyValue}>vacío</span>
                            )}
                          </td>
                          <td>
                            {[row.email, row.phone].filter(Boolean).join(' · ') || (
                              <span className={styles.emptyValue}>vacío</span>
                            )}
                          </td>
                          <td>
                            {row.address.trim() ? (
                              row.address
                            ) : (
                              <span className={styles.emptyValue}>vacío</span>
                            )}
                          </td>
                          <td>{CLIENT_STATUS_LABELS[importStatus]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > 10 && (
                  <p className={`${ui.textSmall} ${ui.textMuted}`} style={{ marginTop: '0.5rem' }}>
                    Mostrando 10 de {rows.length} filas
                  </p>
                )}
              </>
            )}

            {step === 'done' && result && (
              <div className={styles.resultSummary}>
                <CheckCircle2
                  size={18}
                  style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '0.375rem' }}
                />
                Importación completada: {result.created} creado{result.created === 1 ? '' : 's'}
                {result.updated > 0 && `, ${result.updated} actualizado${result.updated === 1 ? '' : 's'}`}
                {result.skipped > 0 && `, ${result.skipped} omitido${result.skipped === 1 ? '' : 's'}`}
                .
              </div>
            )}
          </div>

          <ModalFooter>
            <ModalActions>
              {step === 'review' && (
                <>
                  <button
                    type="button"
                    onClick={() => void handleImport()}
                    disabled={importing || rows.length === 0}
                    className={modalBtnPrimary}
                  >
                    {importing ? 'Importando…' : `Importar ${rows.length} contacto${rows.length === 1 ? '' : 's'}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetState();
                    }}
                    className={modalBtnSecondary}
                    disabled={importing}
                  >
                    Elegir otro archivo
                  </button>
                </>
              )}
              {step === 'done' && (
                <button type="button" onClick={handleClose} className={modalBtnPrimary}>
                  Cerrar
                </button>
              )}
              {(step === 'drop' || step === 'review') && (
                <button type="button" onClick={handleClose} className={modalBtnSecondary} disabled={importing}>
                  Cancelar
                </button>
              )}
            </ModalActions>
          </ModalFooter>
        </div>
      </div>
    </ModalOverlay>
  );
}
