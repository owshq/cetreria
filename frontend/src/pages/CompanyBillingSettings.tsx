import { useEffect, useMemo, useState } from 'react';
import { workspaceBillingSettingsService } from '@/api';
import type { WorkspaceBillingSettings } from '@shared/types';
import { Input } from '@/components/forms';
import SelectMenu from '@/components/SelectMenu';
import { useWorkspace } from '@/context/useWorkspace';
import {
  COUNTRY_OTHER_VALUE,
  getCountrySelectOptions,
  getDefaultTaxRateForCountry,
  getTaxPresetOptions,
  getTaxRateForPreset,
  findTaxPresetId,
  MANUAL_TAX_PRESET_ID,
  resolveCountryTaxConfig,
} from '@/lib/countryTaxRates';
import { resolveWorkspaceBillingSettings } from '@/lib/resolveWorkspaceBillingSettings';
import ui from '@/styles/shared.module.css';

type EditableBillingFields = Pick<
  WorkspaceBillingSettings,
  | 'companyName'
  | 'email'
  | 'address'
  | 'city'
  | 'postalCode'
  | 'country'
  | 'state'
  | 'defaultTaxRate'
>;

function pickEditableFields(settings: WorkspaceBillingSettings): EditableBillingFields {
  return {
    companyName: settings.companyName,
    email: settings.email,
    address: settings.address,
    city: settings.city,
    postalCode: settings.postalCode,
    country: settings.country,
    state: settings.state,
    defaultTaxRate: settings.defaultTaxRate,
  };
}

function areEditableFieldsEqual(left: EditableBillingFields, right: EditableBillingFields) {
  return (
    left.companyName === right.companyName &&
    left.email === right.email &&
    left.address === right.address &&
    left.city === right.city &&
    left.postalCode === right.postalCode &&
    left.country === right.country &&
    left.state === right.state &&
    left.defaultTaxRate === right.defaultTaxRate
  );
}

export default function CompanyBillingSettings() {
  const { refreshWorkspaces } = useWorkspace();
  const [formData, setFormData] = useState<WorkspaceBillingSettings | null>(null);
  const [savedBaseline, setSavedBaseline] = useState<EditableBillingFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        const data = await workspaceBillingSettingsService.get();
        if (cancelled) return;

        const next = await resolveWorkspaceBillingSettings(data);
        if (cancelled) return;

        setFormData(next);
        setSavedBaseline(pickEditableFields(data));
      } catch {
        if (!cancelled) setError('No se pudieron cargar los datos de la empresa.');
      }
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasChanges = useMemo(() => {
    if (!formData || !savedBaseline) return false;
    return !areEditableFieldsEqual(pickEditableFields(formData), savedBaseline);
  }, [formData, savedBaseline]);

  const updateFormData = (patch: Partial<WorkspaceBillingSettings>) => {
    setSuccess(null);
    setFormData((current) => (current ? { ...current, ...patch } : current));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData || saving || !hasChanges) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await workspaceBillingSettingsService.update(formData);
      setFormData(saved);
      setSavedBaseline(pickEditableFields(saved));
      await refreshWorkspaces();
      setSuccess('Datos de la empresa guardados.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar los datos.');
    } finally {
      setSaving(false);
    }
  };

  const countryOptions = useMemo(() => getCountrySelectOptions(), []);

  const countrySelectValue = useMemo(() => {
    if (!formData?.country) return '';
    const config = resolveCountryTaxConfig(formData.country);
    if (config) return config.label;
    return COUNTRY_OTHER_VALUE;
  }, [formData?.country]);

  const showCustomCountry = countrySelectValue === COUNTRY_OTHER_VALUE;

  const taxPresetOptions = useMemo(
    () => (formData ? getTaxPresetOptions(formData.country) : []),
    [formData?.country],
  );

  const taxPresetId = useMemo(() => {
    if (!formData) return MANUAL_TAX_PRESET_ID;
    return findTaxPresetId(formData.country, formData.defaultTaxRate);
  }, [formData]);

  const isManualTax = taxPresetId === MANUAL_TAX_PRESET_ID;

  const handleCountrySelect = (value: string) => {
    if (!value) {
      updateFormData({ country: '' });
      return;
    }
    if (value === COUNTRY_OTHER_VALUE) {
      updateFormData({ country: formData?.country ?? '' });
      return;
    }
    const defaultRate = getDefaultTaxRateForCountry(value);
    updateFormData({
      country: value,
      ...(defaultRate != null ? { defaultTaxRate: defaultRate } : {}),
    });
  };

  const handleTaxPresetSelect = (presetId: string) => {
    const rate = getTaxRateForPreset(presetId, formData?.country ?? '');
    if (rate != null) {
      updateFormData({ defaultTaxRate: rate });
    }
  };

  return (
    <section className={ui.pageSection} aria-labelledby="profile-company-title">
      <h2 id="profile-company-title" className={ui.pageSectionTitle}>
        Empresa
      </h2>
      <div className={ui.card}>
        <div className={ui.cardBody}>
          {!formData ? (
            <p className={ui.textMuted}>Cargando datos de la empresa{'\u2026'}</p>
          ) : (
            <form onSubmit={handleSubmit} className={ui.form}>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="company-name">
                  Nombre de la empresa
                </label>
                <Input
                  id="company-name"
                  value={formData.companyName}
                  onChange={(e) => updateFormData({ companyName: e.target.value })}
                  placeholder="Nombre de la empresa"
                  required
                />
              </div>

              <div className={ui.field}>
                <label className={ui.label} htmlFor="company-email">
                  Email *
                </label>
                <Input
                  id="company-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateFormData({ email: e.target.value })}
                  placeholder="email@empresa.com"
                  required
                />
              </div>

              <div className={ui.field}>
                <label className={ui.label} htmlFor="company-address">
                  Dirección *
                </label>
                <Input
                  id="company-address"
                  value={formData.address}
                  onChange={(e) => updateFormData({ address: e.target.value })}
                  placeholder="Calle y número"
                  required
                />
              </div>

              <div className={ui.formGrid2}>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="company-city">
                    Ciudad
                  </label>
                  <Input
                    id="company-city"
                    value={formData.city}
                    onChange={(e) => updateFormData({ city: e.target.value })}
                  />
                </div>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="company-postal">
                    Código postal
                  </label>
                  <Input
                    id="company-postal"
                    value={formData.postalCode}
                    onChange={(e) => updateFormData({ postalCode: e.target.value })}
                  />
                </div>
              </div>

              <div className={ui.formGrid2}>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="company-state">
                    Provincia / Estado
                  </label>
                  <Input
                    id="company-state"
                    value={formData.state}
                    onChange={(e) => updateFormData({ state: e.target.value })}
                  />
                </div>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="company-country">
                    País / Región
                  </label>
                  <SelectMenu
                    id="company-country"
                    value={countrySelectValue}
                    onChange={handleCountrySelect}
                    options={[
                      { value: '', label: 'Seleccionar país' },
                      ...countryOptions,
                      { value: COUNTRY_OTHER_VALUE, label: 'Otro' },
                    ]}
                    ariaLabel="País / Región"
                  />
                  {showCustomCountry && (
                    <Input
                      id="company-country-custom"
                      value={formData.country}
                      onChange={(e) => {
                        const country = e.target.value;
                        const defaultRate = getDefaultTaxRateForCountry(country);
                        updateFormData({
                          country,
                          ...(defaultRate != null ? { defaultTaxRate: defaultRate } : {}),
                        });
                      }}
                      placeholder="Nombre del país"
                      aria-label="País personalizado"
                      style={{ marginTop: '0.5rem' }}
                    />
                  )}
                </div>
              </div>

              <div className={ui.field}>
                <label className={ui.label} htmlFor="company-tax-preset">
                  Impuesto por defecto (%)
                </label>
                <SelectMenu
                  id="company-tax-preset"
                  value={taxPresetId}
                  onChange={handleTaxPresetSelect}
                  options={taxPresetOptions}
                  ariaLabel="Tipo de impuesto por defecto"
                />
                {isManualTax && (
                  <Input
                    id="company-tax-rate"
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={formData.defaultTaxRate}
                    onChange={(e) =>
                      updateFormData({
                        defaultTaxRate: parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder="Introduce el porcentaje"
                    aria-label="Impuesto personalizado (%)"
                    style={{ marginTop: '0.5rem' }}
                  />
                )}
              </div>

              {error && <p className={ui.alertError}>{error}</p>}
              {success && <p className={ui.alertSuccess}>{success}</p>}

              {hasChanges && (
                <button type="submit" className={ui.btnPrimary} disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar datos de la empresa'}
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
