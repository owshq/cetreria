import { useState } from 'react';

import { ShieldCheck } from 'lucide-react';

import type { Client, Document, WorkspaceBillingSettings } from '@shared/types';

import {

  VERIFACTU_INVOICE_KIND_LABELS,

  VERIFACTU_PRODUCTION_UNAVAILABLE_MESSAGE,

  resolveVerifactuInvoiceKind,

  validateVerifactuSubmit,

} from '@shared/types';

import { documentsService } from '@/api/documents';

import ModalHeader from '@/components/ModalHeader';

import { ModalActions, ModalFooter, modalBtnPrimary, modalBtnSecondary } from '@/components/ModalFooter';

import ModalOverlay from '@/components/ModalOverlay';

import { usePopupEscape } from '@/context/PopupStackContext';

import { cx } from '@/lib/cx';

import { isVerifactuProductionEnabledInClient } from '@/lib/verifactuProduction';

import ui from '@/styles/shared.module.css';

import styles from './VerifactuApproveModal.module.css';



type VerifactuApproveModalProps = {

  open: boolean;

  document: Document;

  client: Client;

  billingSettings: WorkspaceBillingSettings | null;

  onClose: () => void;

  onSubmitted: (document: Document) => void;

};



export default function VerifactuApproveModal({

  open,

  document,

  client,

  billingSettings,

  onClose,

  onSubmitted,

}: VerifactuApproveModalProps) {

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState<string | null>(null);



  usePopupEscape(open && !submitting, onClose);



  if (!open || !billingSettings) return null;



  const validation = validateVerifactuSubmit(document, client, billingSettings);

  const invoiceKind = resolveVerifactuInvoiceKind(document);

  const isProductionEnvironment = billingSettings.verifactuEnvironment === 'production';

  const productionOperational = isVerifactuProductionEnabledInClient();

  const productionBlocked = isProductionEnvironment && !productionOperational;

  const environmentLabel = isProductionEnvironment ? 'Produccion AEAT' : 'Entorno de pruebas (sandbox)';

  const canSubmit = validation.ok && !productionBlocked;



  const handleSubmit = async () => {

    if (!canSubmit || submitting) return;

    setSubmitting(true);

    setError(null);

    try {

      const result = await documentsService.approveElectronicInvoicing(document.id);

      if (result.outcome === 'accepted') {
        onSubmitted(result.document);
        onClose();
        return;
      }

      if (result.outcome === 'blocked' || result.outcome === 'rejected') {
        setError(
          result.errorMessage ?? 'No se pudo completar la aprobacion fiscal del documento.',
        );
        return;
      }

      if (result.outcome === 'pending_configuration') {
        setError('La facturacion electronica no esta configurada para este workspace.');
        return;
      }

      setError('La aprobacion fiscal no era necesaria para este documento.');

    } catch (err) {

      setError(err instanceof Error ? err.message : 'No se pudo completar la aprobacion fiscal');

    } finally {

      setSubmitting(false);

    }

  };



  return (

    <ModalOverlay

      onClick={() => {

        if (!submitting) onClose();

      }}

      role="presentation"

    >

      <div

        className={cx(ui.modal, ui.modalMd)}

        onClick={(event) => event.stopPropagation()}

        role="dialog"

        aria-modal="true"

        aria-labelledby="fiscal-approve-title"

      >

        <ModalHeader

          title={
            isProductionEnvironment
              ? 'Aprobacion fiscal de factura'
              : 'Aprobacion fiscal de factura (sandbox)'
          }

          titleId="fiscal-approve-title"

          onClose={onClose}

          closeDisabled={submitting}

        />

        <div className={ui.modalBody}>

          <div className={styles.hero}>

            <div className={styles.iconWrap} aria-hidden>

              <ShieldCheck size={22} />

            </div>

            <p className={styles.intro}>

              {isProductionEnvironment

                ? 'Registro fiscal en produccion: requiere certificado digital e integracion AEAT real. No sustituye la aprobacion comercial ni el estado interno del documento.'

                : 'En sandbox se simula el registro fiscal. No se realiza un envio real a Hacienda. Se genera el codigo QR en el PDF.'}

            </p>

          </div>



          <dl className={styles.summary}>

            <div className={styles.summaryRow}>

              <dt>Factura</dt>

              <dd>{document.number}</dd>

            </div>

            <div className={styles.summaryRow}>

              <dt>Tipo</dt>

              <dd>{VERIFACTU_INVOICE_KIND_LABELS[invoiceKind]}</dd>

            </div>

            <div className={styles.summaryRow}>

              <dt>Contacto</dt>

              <dd>{client.name}</dd>

            </div>

            <div className={styles.summaryRow}>

              <dt>Total</dt>

              <dd>{document.total.toFixed(2)} EUR</dd>

            </div>

            <div className={styles.summaryRow}>

              <dt>Proveedor fiscal</dt>

              <dd>Espana — AEAT Veri*Factu</dd>

            </div>

            <div className={styles.summaryRow}>

              <dt>Entorno</dt>

              <dd>{environmentLabel}</dd>

            </div>

            <div className={styles.summaryRow}>

              <dt>Emisor (NIF)</dt>

              <dd>{billingSettings.issuerNif || '\u2014'}</dd>

            </div>

          </dl>



          {productionBlocked ? (

            <div className={styles.productionBlocked} role="alert" data-testid="verifactu-production-blocked">

              <p className={styles.productionBlockedTitle}>Produccion no operativa</p>

              <p>{VERIFACTU_PRODUCTION_UNAVAILABLE_MESSAGE}</p>

              <p className={styles.productionBlockedHint}>

                Cambie el entorno a pruebas (sandbox) en ajustes Veri*Factu o espere a la integracion

                AEAT real.

              </p>

            </div>

          ) : null}



          {!validation.ok && (

            <div className={styles.validationErrors} role="alert">

              <p className={styles.validationTitle}>
                Revise antes del registro fiscal:
              </p>

              <ul>

                {validation.errors.map((item) => (

                  <li key={item}>{item}</li>

                ))}

              </ul>

            </div>

          )}



          {error && (

            <p className={styles.submitError} role="alert">

              {error}

            </p>

          )}

        </div>

        <ModalFooter>

          <ModalActions>

            <button

              type="button"

              className={modalBtnSecondary}

              onClick={onClose}

              disabled={submitting}

            >

              Cancelar

            </button>

            <button

              type="button"

              className={modalBtnPrimary}

              onClick={() => void handleSubmit()}

              disabled={!canSubmit || submitting}

            >

              {submitting
                ? isProductionEnvironment
                  ? 'Enviando\u2026'
                  : 'Procesando\u2026'
                : productionBlocked
                  ? 'Produccion no disponible'
                  : isProductionEnvironment
                    ? 'Aprobar registro fiscal'
                    : 'Aprobar registro fiscal'}

            </button>

          </ModalActions>

        </ModalFooter>

      </div>

    </ModalOverlay>

  );

}


