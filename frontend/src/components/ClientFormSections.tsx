import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Client, ClientCreatedAtPrecision, ClientCustomFieldEntry, ClientGroup } from '@shared/types';
import PhoneInput from '@/components/PhoneInput';
import SelectMenu from '@/components/SelectMenu';
import { Input } from '@/components/forms';
import ClientCustomFieldsEditor from '@/components/ClientCustomFieldsEditor';
import ClientLogo from '@/components/ClientLogo';
import { CLIENT_STATUS_FORM_OPTIONS } from '@/lib/clientStatus';
import { readLogoFile } from '@/lib/logoImage';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from './ClientFormSections.module.css';

export type ClientFormData = {
  name: string;
  logoUrl: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  state: string;
  website: string;
  technicalInfo: string;
  status: Client['status'];
  groupId: string;
  createdAt: string;
  createdAtPrecision: ClientCreatedAtPrecision;
  customFieldEntries: ClientCustomFieldEntry[];
};

const CREATED_AT_PRECISION_OPTIONS = [
  { value: 'day', label: 'Día, mes y año' },
  { value: 'year', label: 'Solo año' },
] as const;

type ClientFormSectionsProps = {
  formData: ClientFormData;
  setFormData: Dispatch<SetStateAction<ClientFormData>>;
  groups: ClientGroup[];
  /** Prefijo para ids de campos (p. ej. `edit-client` o `client`). */
  idPrefix?: string;
};

export default function ClientFormSections({
  formData,
  setFormData,
  groups,
  idPrefix = 'client',
}: ClientFormSectionsProps) {
  const groupId = `${idPrefix}-group`;
  const statusId = `${idPrefix}-status`;
  const createdAtId = `${idPrefix}-created-at`;
  const createdAtPrecisionId = `${idPrefix}-created-at-precision`;
  const createdAtYearId = `${idPrefix}-created-at-year`;
  const currentYear = new Date().getFullYear();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const handleCreatedAtPrecisionChange = (precision: ClientCreatedAtPrecision) => {
    if (precision === formData.createdAtPrecision) return;

    if (precision === 'year') {
      const year = formData.createdAt.slice(0, 4);
      setFormData({
        ...formData,
        createdAtPrecision: 'year',
        createdAt: /^\d{4}$/.test(year) ? year : String(currentYear),
      });
      return;
    }

    const year = formData.createdAt.slice(0, 4);
    const fallbackDate = /^\d{4}$/.test(year) ? `${year}-01-01` : formData.createdAt;
    setFormData({
      ...formData,
      createdAtPrecision: 'day',
      createdAt: fallbackDate,
    });
  };

  const handleLogoChange = async (file: File | undefined) => {
    if (!file) return;

    setLogoError(null);
    try {
      const nextLogo = await readLogoFile(file);
      setFormData({ ...formData, logoUrl: nextLogo });
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'No se pudo cargar la imagen.');
    }
  };

  return (
    <div className={styles.formSections}>
      <section className={ui.pageSection} aria-labelledby={`${idPrefix}-section-contact`}>
        <h2 id={`${idPrefix}-section-contact`} className={ui.pageSectionTitle}>
          Datos de contacto
        </h2>
        <div className={ui.card}>
          <div className={styles.sectionCardBody}>
            <div className={ui.field}>
              <label className={ui.label}>Logo</label>
              <div className={styles.logoSection}>
                {formData.logoUrl ? (
                  <ClientLogo logoUrl={formData.logoUrl} size="lg" alt="Logo del contacto" />
                ) : (
                  <div className={styles.logoPlaceholder} aria-hidden>
                    🏢
                  </div>
                )}
                <div className={styles.logoActions}>
                  <button
                    type="button"
                    className={cx(ui.btnSecondary, styles.logoBtn)}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {formData.logoUrl ? '📷 Cambiar logo' : '📷 Añadir logo'}
                  </button>
                  {formData.logoUrl && (
                    <button
                      type="button"
                      className={cx(ui.btnSecondary, styles.logoBtn)}
                      onClick={() => {
                        setFormData({ ...formData, logoUrl: '' });
                        setLogoError(null);
                      }}
                    >
                      🗑️ Quitar logo
                    </button>
                  )}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className={styles.hiddenInput}
                    onChange={(e) => {
                      void handleLogoChange(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
              {logoError && (
                <p className={styles.logoError} role="alert">
                  {logoError}
                </p>
              )}
            </div>
            <div className={ui.field}>
              <label className={ui.label}>Nombre *</label>
              <Input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className={ui.formGrid2}>
              <div className={ui.field}>
                <label className={ui.label}>Email *</label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
              <PhoneInput
                label="Teléfono"
                value={formData.phone}
                onChange={(phone) => setFormData({ ...formData, phone })}
                required
              />
            </div>
            <div className={ui.field}>
              <label className={ui.label}>Web</label>
              <Input
                type="text"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder="https://ejemplo.com"
                inputMode="url"
              />
            </div>
            <div className={ui.field}>
              <label className={ui.label}>Información Técnica</label>
              <Input
                type="text"
                value={formData.technicalInfo}
                onChange={(e) => setFormData({ ...formData, technicalInfo: e.target.value })}
              />
            </div>
          </div>
        </div>
      </section>

      <section className={ui.pageSection} aria-labelledby={`${idPrefix}-section-address`}>
        <h2 id={`${idPrefix}-section-address`} className={ui.pageSectionTitle}>
          Dirección
        </h2>
        <div className={ui.card}>
          <div className={styles.sectionCardBody}>
            <div className={ui.field}>
              <label className={ui.label}>Dirección *</label>
              <Input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                required
              />
            </div>
            <div className={ui.formGrid2}>
              <div className={ui.field}>
                <label className={ui.label}>Ciudad</label>
                <Input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
              <div className={ui.field}>
                <label className={ui.label}>Código postal</label>
                <Input
                  type="text"
                  value={formData.postalCode}
                  onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                />
              </div>
            </div>
            <div className={ui.formGrid2}>
              <div className={ui.field}>
                <label className={ui.label}>Provincia / Estado</label>
                <Input
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                />
              </div>
              <div className={ui.field}>
                <label className={ui.label}>País / Región</label>
                <Input
                  type="text"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={ui.pageSection} aria-labelledby={`${idPrefix}-section-classification`}>
        <h2 id={`${idPrefix}-section-classification`} className={ui.pageSectionTitle}>
          Clasificación
        </h2>
        <div className={ui.card}>
          <div className={styles.sectionCardBody}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor={groupId}>
                Grupo *
              </label>
              <SelectMenu
                id={groupId}
                value={formData.groupId}
                onChange={(groupIdValue) => setFormData({ ...formData, groupId: groupIdValue })}
                options={groups.map((group) => ({
                  value: group.id,
                  label: group.name,
                }))}
                ariaLabel="Grupo"
                menuPortal
              />
            </div>
            <div className={ui.formGrid2}>
              <div className={ui.field}>
                <label className={ui.label} htmlFor={statusId}>
                  Estado *
                </label>
                <SelectMenu
                  id={statusId}
                  value={formData.status}
                  onChange={(status) =>
                    setFormData({ ...formData, status: status as Client['status'] })
                  }
                  options={CLIENT_STATUS_FORM_OPTIONS}
                  ariaLabel="Estado"
                  menuPortal
                />
              </div>
              <div className={ui.field}>
                <label className={ui.label} htmlFor={createdAtPrecisionId}>
                  Fecha de alta *
                </label>
                <SelectMenu
                  id={createdAtPrecisionId}
                  value={formData.createdAtPrecision}
                  onChange={(precision) =>
                    handleCreatedAtPrecisionChange(precision as ClientCreatedAtPrecision)
                  }
                  options={[...CREATED_AT_PRECISION_OPTIONS]}
                  ariaLabel="Formato de fecha de alta"
                  menuPortal
                />
                {formData.createdAtPrecision === 'year' ? (
                  <Input
                    id={createdAtYearId}
                    type="number"
                    min={1900}
                    max={currentYear + 1}
                    step={1}
                    value={formData.createdAt}
                    onChange={(e) =>
                      setFormData({ ...formData, createdAt: e.target.value.slice(0, 4) })
                    }
                    required
                    className={styles.createdAtValueInput}
                  />
                ) : (
                  <Input
                    id={createdAtId}
                    type="date"
                    value={formData.createdAt}
                    onChange={(e) => setFormData({ ...formData, createdAt: e.target.value })}
                    required
                    className={styles.createdAtValueInput}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={ui.pageSection} aria-labelledby={`${idPrefix}-section-custom`}>
        <h2 id={`${idPrefix}-section-custom`} className={ui.pageSectionTitle}>
          Columnas personalizadas
        </h2>
        <div className={ui.card}>
          <div className={styles.sectionCardBody}>
            <ClientCustomFieldsEditor
              embedded
              entries={formData.customFieldEntries}
              onChange={(customFieldEntries) => setFormData({ ...formData, customFieldEntries })}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
