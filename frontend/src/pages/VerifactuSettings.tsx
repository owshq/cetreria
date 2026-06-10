import { useEffect, useMemo, useState } from 'react';

import { workspaceBillingSettingsService } from '@/api';

import type { WorkspaceBillingSettings } from '@shared/types';

import { VERIFACTU_PRODUCTION_UNAVAILABLE_MESSAGE } from '@shared/types';

import { Input } from '@/components/forms';

import SelectMenu from '@/components/SelectMenu';

import { useWorkspaceFeatureSettings } from '@/context/WorkspaceFeatureSettingsContext';

import { useWorkspace } from '@/context/useWorkspace';

import { isVerifactuProductionEnabledInClient } from '@/lib/verifactuProduction';

import { resolveWorkspaceBillingSettings } from '@/lib/resolveWorkspaceBillingSettings';

import ui from '@/styles/shared.module.css';

import styles from './VerifactuSettings.module.css';



type VerifactuEditableFields = Pick<

  WorkspaceBillingSettings,

  | 'verifactuEnvironment'

  | 'issuerNif'

  | 'verifactuSoftwareName'

  | 'verifactuSoftwareId'

  | 'verifactuSoftwareVersion'

  | 'verifactuCertificateFileName'

>;



function pickVerifactuFields(settings: WorkspaceBillingSettings): VerifactuEditableFields {

  return {

    verifactuEnvironment: settings.verifactuEnvironment ?? 'sandbox',

    issuerNif: settings.issuerNif ?? '',

    verifactuSoftwareName: settings.verifactuSoftwareName ?? '',

    verifactuSoftwareId: settings.verifactuSoftwareId ?? '',

    verifactuSoftwareVersion: settings.verifactuSoftwareVersion ?? '',

    verifactuCertificateFileName: settings.verifactuCertificateFileName ?? '',

  };

}



function areVerifactuFieldsEqual(left: VerifactuEditableFields, right: VerifactuEditableFields) {

  return JSON.stringify(left) === JSON.stringify(right);

}



type VerifactuSettingsProps = {

  subsection?: boolean;

};



export default function VerifactuSettings({ subsection = false }: VerifactuSettingsProps) {

  const { refreshWorkspaces } = useWorkspace();

  const { verifactuEnabled } = useWorkspaceFeatureSettings();

  const [formData, setFormData] = useState<WorkspaceBillingSettings | null>(null);

  const [savedBaseline, setSavedBaseline] = useState<VerifactuEditableFields | null>(null);

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

        setFormData(next);

        setSavedBaseline(pickVerifactuFields(data));

      } catch {

        if (!cancelled) setError('No se pudo cargar la configuracion Veri*Factu.');

      }

    }



    void loadSettings();

    return () => {

      cancelled = true;

    };

  }, []);



  const hasChanges = useMemo(() => {

    if (!formData || !savedBaseline) return false;

    return !areVerifactuFieldsEqual(pickVerifactuFields(formData), savedBaseline);

  }, [formData, savedBaseline]);



  const productionOperational = isVerifactuProductionEnabledInClient();

  const isProductionSelected =

    verifactuEnabled && formData?.verifactuEnvironment === 'production';

  const productionSaveBlocked = isProductionSelected && !productionOperational;



  const updateFormData = (patch: Partial<WorkspaceBillingSettings>) => {

    setSuccess(null);

    setFormData((current) => (current ? { ...current, ...patch } : current));

  };



  const handleSubmit = async (event: React.FormEvent) => {

    event.preventDefault();

    if (!formData || saving || !hasChanges || productionSaveBlocked || !verifactuEnabled) return;



    setSaving(true);

    setError(null);

    setSuccess(null);

    try {

      const saved = await workspaceBillingSettingsService.update(pickVerifactuFields(formData));

      setFormData(saved);

      setSavedBaseline(pickVerifactuFields(saved));

      await refreshWorkspaces();

      setSuccess('Configuracion Veri*Factu guardada.');

    } catch (err) {

      setError(err instanceof Error ? err.message : 'No se pudo guardar la configuracion.');

    } finally {

      setSaving(false);

    }

  };



  const TitleTag = subsection ? 'h3' : 'h2';



  if (!formData) {

    return <p className={ui.textMuted}>Cargando configuracion Veri*Factu…</p>;

  }



  return (

    <section className={ui.pageSection}>

      <TitleTag className={subsection ? ui.pageSectionTitle : ui.pageTitle}>

        Veri*Factu (Hacienda)

      </TitleTag>

      <p className={ui.textMuted}>

        Datos del emisor y del software para el registro de facturas ante la AEAT. El entorno de

        pruebas simula la respuesta de Hacienda; la integracion real en produccion aun no esta

        disponible. Activa el modulo en Funcionalidades.

      </p>



      {!verifactuEnabled ? (

        <p className={styles.disabledNotice} role="status">

          Veri*Factu esta desactivado. Activalo en Configuracion &gt; Empresa &gt; Funcionalidades

          para configurar el emisor y enviar facturas.

        </p>

      ) : null}



      <form onSubmit={(event) => void handleSubmit(event)}>

        <div className={ui.card}>

          <div className={ui.cardBody}>

            <div className={ui.formGrid2}>

              <div className={ui.field}>

                <label className={ui.label} htmlFor="verifactu-environment">

                  Entorno AEAT

                </label>

                <SelectMenu

                  id="verifactu-environment"

                  value={formData.verifactuEnvironment ?? 'sandbox'}

                  onChange={(value) =>

                    updateFormData({

                      verifactuEnvironment: value === 'production' ? 'production' : 'sandbox',

                    })

                  }

                  options={[

                    { value: 'sandbox', label: 'Pruebas (sandbox)' },

                    { value: 'production', label: 'Produccion' },

                  ]}

                  ariaLabel="Entorno AEAT"

                  disabled={!verifactuEnabled}

                />

              </div>

              {isProductionSelected ? (

                <div

                  className={styles.productionWarning}

                  role="status"

                  data-testid="verifactu-production-warning"

                >

                  <p className={styles.productionWarningTitle}>Produccion no operativa</p>

                  <p className={styles.productionWarningText}>

                    {VERIFACTU_PRODUCTION_UNAVAILABLE_MESSAGE}

                  </p>

                  {!productionOperational ? (

                    <p className={styles.productionWarningHint}>

                      Use entorno de pruebas (sandbox) hasta que exista certificado digital e

                      integracion AEAT en el servidor.

                    </p>

                  ) : null}

                </div>

              ) : null}

              <div className={ui.field}>

                <label className={ui.label} htmlFor="issuer-nif">

                  NIF/CIF emisor *

                </label>

                <Input

                  id="issuer-nif"

                  value={formData.issuerNif ?? ''}

                  onChange={(event) =>

                    updateFormData({ issuerNif: event.target.value.toUpperCase() })

                  }

                  placeholder="B12345678"

                  disabled={!verifactuEnabled}

                />

              </div>

              <div className={ui.field}>

                <label className={ui.label} htmlFor="verifactu-software-name">

                  Nombre del software

                </label>

                <Input

                  id="verifactu-software-name"

                  value={formData.verifactuSoftwareName ?? ''}

                  onChange={(event) => updateFormData({ verifactuSoftwareName: event.target.value })}

                  disabled={!verifactuEnabled}

                />

              </div>

              <div className={ui.field}>

                <label className={ui.label} htmlFor="verifactu-software-id">

                  ID software AEAT

                </label>

                <Input

                  id="verifactu-software-id"

                  value={formData.verifactuSoftwareId ?? ''}

                  onChange={(event) => updateFormData({ verifactuSoftwareId: event.target.value })}

                  disabled={!verifactuEnabled}

                />

              </div>

              <div className={ui.field}>

                <label className={ui.label} htmlFor="verifactu-software-version">

                  Version del software

                </label>

                <Input

                  id="verifactu-software-version"

                  value={formData.verifactuSoftwareVersion ?? ''}

                  onChange={(event) =>

                    updateFormData({ verifactuSoftwareVersion: event.target.value })

                  }

                  disabled={!verifactuEnabled}

                />

              </div>

              <div className={ui.field}>

                <label className={ui.label} htmlFor="verifactu-certificate">

                  Certificado digital (referencia)

                </label>

                <Input

                  id="verifactu-certificate"

                  value={formData.verifactuCertificateFileName ?? ''}

                  onChange={(event) =>

                    updateFormData({ verifactuCertificateFileName: event.target.value })

                  }

                  placeholder="nombre.p12"

                  disabled={!verifactuEnabled}

                />

              </div>

            </div>

            <p className={ui.textMuted} style={{ marginTop: '1rem', fontSize: '0.8125rem' }}>

              En sandbox el servidor simula aceptacion o rechazo sin XML ni certificado real. Produccion

              requiere certificado digital, envio AEAT y configuracion en servidor (no disponible aun).

            </p>

          </div>

        </div>



        {error && <p className={ui.alertError}>{error}</p>}

        {success && <p className={ui.alertSuccess}>{success}</p>}



        {productionSaveBlocked && hasChanges ? (

          <p className={ui.alertError} style={{ marginTop: '1rem' }} role="alert">

            No se puede guardar produccion hasta habilitar la integracion AEAT real en el servidor.

          </p>

        ) : null}



        {hasChanges && verifactuEnabled ? (

          <button

            type="submit"

            className={ui.btnPrimary}

            disabled={saving || productionSaveBlocked}

            style={{ marginTop: '1rem' }}

          >

            {saving ? 'Guardando…' : 'Guardar configuracion'}

          </button>

        ) : null}

      </form>

    </section>

  );

}


