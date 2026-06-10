# Changelog local

## Electronic Invoicing Gate - Fase 2A (infra provider, sin produccion)

Fecha: 2026-06-10

Cambios:
- `ElectronicInvoicingProvider` + registry en `backend/src/services/electronicInvoicing/`.
- Provider `es_verifactu`: `esVerifactuConfig`, `esVerifactuCertificateHealth`, `esVerifactuProvider`.
- Gate delega en `esVerifactuProvider.approveDocument()` (wrapper sobre sandbox existente).
- `GET /api/electronic-invoicing/providers/es_verifactu/health` (admin).
- `shared/electronicInvoicingProviderHealth.ts`: tipos health.
- Tests: cert health, provider, health smoke.
- Docs: `ELECTRONIC_INVOICING_GATE_ARCHITECTURE.md`, `VERIFACTU_READY_FOR_PHASE2_CHECKLIST.md`.

Sin cambios funcionales en sandbox:
- `submitDocumentToVerifactu` intacto; hash/PDF/estados/historicos sin reescritura.
- `POST /api/documents/:id/verifactu/submit` intacto (legacy).
- Sin AEAT real, sin firma, sin mTLS, sin produccion.
- `productionReady` siempre `false` en Fase 2A.

Validacion:
- `npm run test` (x2) -> 119/119 OK
- `npm run test:verifactu` -> 59/59 OK
- `npm run smoke:documents-bootstrap` -> 5/5 OK
- `npm run preflight:ci` -> OK
- `npm run typecheck:backend` -> OK
- `npm run build` -> OK

Estado:
- Backup previo: `C:\Users\Carlos\Desktop\crm-cetreria_BACKUP_PRE_EINVOICING_PHASE2A`
- Fase 2B (cliente AEAT sandbox real): cerrada hasta spec/certificado.

---

## Electronic Invoicing Approval Gate � M1b cerrado

Fecha: 2026-06-10

Cambios (M1b):
- `shared/electronicInvoicing.ts` + `shared/electronicInvoicingGate.ts`: tipos y resolucion de provider.
- `backend/src/services/electronicInvoicing/electronicInvoicingGate.ts`: gate de aprobacion fiscal.
- `POST /api/documents/:id/electronic-invoicing/approve`: ruta canonica del gate.
- UI: "Aprobar registro fiscal" / modal "Aprobacion fiscal de la factura"; Veri*Factu solo como provider (Espana � AEAT).
- Tests gate: `electronicInvoicingGate.test.ts`, `documents.electronicInvoicing.smoke.test.ts`.

Sin cambios funcionales en sandbox:
- Veri*Factu pasa a provider espanol (`es_verifactu`); delega en `submitDocumentToVerifactu`.
- `POST /api/documents/:id/verifactu/submit` intacto (alias legacy).
- Sin AEAT real, certificado, produccion ni proveedores internacionales.
- Fase 2 AEAT no abierta.

Validacion:
- `npm run test` -> 109/109 OK
- `npm run test:verifactu` -> 49/49 OK
- `npm run smoke:documents-bootstrap` -> 5/5 OK
- `npm run preflight:ci` -> OK
- `npm run typecheck:backend` -> OK
- `npm run build` -> OK

Estado:
- Backup: `C:\Users\Carlos\Desktop\crm-cetreria_BACKUP_EINVOICING_GATE_M1B_OK`
- QA manual: `docs/ELECTRONIC_INVOICING_GATE_QA_MANUAL.md` (10 items OK/KO; ejecucion operador pendiente).
- Fase 2 AEAT: cerrada hasta PASS QA + checklist Veri*Factu.

---

## Veri*Factu � cierre global Fase 1 + QR (listo para Fase 2)

Fecha: 2026-06-10

Cambios:
- `docs/VERIFACTU_READY_FOR_PHASE2_CHECKLIST.md`: checklist operativo (cerrado / pendiente / backups / validacion / decisiones Fase 2 / docs AEAT).

Sin cambios funcionales:
- Sandbox intacto; Fase 2 no abierta.

Estado:
- Backup global: `C:\Users\Carlos\Desktop\crm-cetreria_BACKUP_VERIFACTU_PHASE1_QR_OK`
- Pendiente: checklist manual navegador (seccion 6 del nuevo doc).

---

## Veri*Factu � QR header v15 OK

Fecha: 2026-06-10

Cambios:
- `shared/documentVerifactuQr.ts`: QR 17 mm en cabecera; solo si Veri*Factu activo y hay `verifactuQrDataUrl`.
- `shared/documentPdf.ts`: QR alineado con banda de fechas (sin CSV en cabecera).
- `shared/documentHtmlTemplate.ts` + `documentCustomHtmlPdf.ts`: misma regla en plantilla HTML/custom.
- `frontend/src/lib/ensureInvoiceVerifactuQrPreview.ts`: preview de factura solo enriquece QR si modulo activo + NIF emisor.
- Vista previa generica de plantilla (`documentTemplatePreviewSample`): sin QR de ejemplo permanente.

Sin cambios:
- Hash sandbox, AEAT real, Fase 2, submit flow.

Validacion:
- `npm run test` -> 87/87 OK
- `npm run test:verifactu` -> 41/41 OK
- `npm run test:verifactu:aeat-core` -> 5/5 OK
- `npm run smoke:documents-bootstrap` -> 5/5 OK
- `npm run preflight:ci` -> OK
- `npm run typecheck:backend` -> OK, 0 errores
- `npm run build` -> OK (aviso chunks >500 kB, esperado)

Estado:
- Backup: `C:\Users\Carlos\Desktop\crm-cetreria_BACKUP_VERIFACTU_QR_HEADER_OK`

---

## Veri*Factu � Fase 1 tecnica + frontera 1.1 (documentacion)

Fecha: 2026-06-10

Cambios (Fase 1 tecnica):
- `backend/src/services/aeat/verifactuPayload.ts`: payload canonico interno `1.0-draft`.
- `backend/src/services/aeat/verifactuHash.ts`: `canonicalizePayloadForHash` + `buildSha256Hash` (Node crypto).
- `backend/src/services/aeat/verifactuAeatCore.test.ts`: golden tests (5).
- `docs/VERIFACTU_AEAT_REFERENCE.md`: referencia borrador AEAT (pendiente validacion oficial).
- Script `npm run test:verifactu:aeat-core`.

Cambios (Fase 1.1 � solo documentacion de frontera):
- `docs/VERIFACTU_PRODUCTION_PLAN.md` seccion 1.1: nucleo AEAT no cableado; sandbox intacto.
- Comentarios de frontera en `verifactuPayload.ts` y `verifactuHash.ts`.
- Esta entrada en changelog.

Sin cambios funcionales:
- `submitDocumentToVerifactu` sigue con `buildVerifactuRecordHash` (hash sandbox).
- Sin AEAT real, sin certificado, sin produccion, sin cambios PDF/estados/UI.

Validacion:
- `npm run test` -> 87/87 OK
- `npm run test:verifactu` -> 41/41 OK
- `npm run test:verifactu:aeat-core` -> 5/5 OK
- `npm run preflight:ci` -> OK
- `npm run typecheck:backend` -> OK, 0 errores

Estado:
- Backup Fase 1: `C:\Users\Carlos\Desktop\crm-cetreria_BACKUP_VERIFACTU_PHASE1_OK`

---

## P0 tecnico cerrado

Fecha: 2026-06-07

Cambios:
- `preflight:ci` ahora usa `cross-env`, compatible con Windows/Linux.
- Anadido script global `npm run test`.
- Corregido `typecheck:backend`.
- Corregidos errores de tipado en:
  - `backend/src/routes/activityWorkReport.ts`
  - `backend/src/scripts/build-preflight-ci-fixture.ts`
  - `backend/src/scripts/migrate-activity-types.ts`
  - `backend/src/db/migrate.ts`
  - `backend/src/db/migrateHalconeriaUsers.ts`
  - `backend/src/db/migrateWorkspaces.ts`
  - `backend/src/db/seed.ts`

Validacion:
- `npm run test` -> 22/22 OK
- `npm run preflight:ci` -> OK
- `npm run typecheck:backend` -> OK, 0 errores

Estado:
- Proyecto sin Git.
- Backup: `C:\Users\Carlos\Desktop\crm-cetreria_BACKUP_P0_OK`

---

## P1 DataStore � arquitectura de persistencia

Fecha: 2026-06-10

Cambios:
- Anadida interfaz `DataStore` en `backend/src/db/dataStore.ts`.
- Anadido `JsonFileStore` en `backend/src/db/jsonFileStore.ts` (wrapper sobre `repository.ts` / lowdb).
- Anadido `resetDbInstanceForTests()` en `store.ts` para tests aislados.
- Anadidos tests de contrato en `backend/src/db/jsonFileStore.test.ts`.
- `npm run test` incluye tests del store.

Sin cambios:
- Rutas siguen usando `repository.ts` directamente.
- Modelo de datos intacto.
- CouchDB no implementado.

Validacion:
- `npm run test` -> 26/26 OK (22 dominio + 4 store)
- `npm run preflight:ci` -> OK
- `npm run typecheck:backend` -> OK, 0 errores

Estado:
- Backup P0: `C:\Users\Carlos\Desktop\crm-cetreria_BACKUP_P0_OK`
- Backup P1: `C:\Users\Carlos\Desktop\crm-cetreria_BACKUP_P1_OK`

---

## P2 DataStore piloto � GET /api/document-type-groups

Fecha: 2026-06-10

Cambios:
- `DataStore` ampliado con `listAllInWorkspace`.
- Helper `readDocumentTypeGroupsForWorkspaceFromStore` en `documentTypeGroups.ts`.
- GET `/api/document-type-groups` lee via `jsonFileStore` (POST/PUT/DELETE sin cambios).
- Tests en `backend/src/db/documentTypeGroups.read.test.ts`.

Validacion:
- `npm run test` -> OK
- `npm run preflight:ci` -> OK
- `npm run typecheck:backend` -> OK

---

## P2b � GET /api/client-groups

Fecha: 2026-06-10

Cambios:
- Helper `readClientGroupsForWorkspaceFromStore` en `clientGroups.ts`.
- GET `/api/client-groups` lee via `jsonFileStore` (POST/DELETE sin cambios).
- Tests en `backend/src/db/clientGroups.read.test.ts`.

Validacion:
- `npm run test` -> OK
- `npm run preflight:ci` -> OK
- `npm run typecheck:backend` -> OK

---

## P2c � documents/bootstrap via DataStore

Fecha: 2026-06-10

Cambios:
- `GET /api/documents/bootstrap` ahora lee via `jsonFileStore`.
- Helper `readDocumentsBootstrapFromStore` en `services/documentsBootstrap.ts`.
- Tests ACL del helper en `backend/src/services/documentsBootstrap.read.test.ts`.

Sin cambios:
- No se han tocado POST/PUT/DELETE de documentos.
- No se ha cambiado el modelo de datos.
- No se ha implementado CouchDB.

Reglas de visibilidad mantenidas:
- Admin ve facturas, albaranes y contactos.
- Operario no ve facturas.
- Operario ve albaranes publicos.
- Operario ve albaranes privados solo por actividad asignada.
- Operario solo ve contactos vinculados a actividades asignadas.

Validacion:
- `npm run test` -> 35/35 OK
- `npm run preflight:ci` -> OK
- `npm run typecheck:backend` -> 0 errores

Estado:
- Backup P2c: `C:\Users\Carlos\Desktop\crm-cetreria_BACKUP_P2C_OK`

---

## P2c-bis � smoke HTTP GET /api/documents/bootstrap

Fecha: 2026-06-10

Cambios:
- Extraido `createApp()` en `backend/src/app.ts` (server.ts sin cambio de comportamiento).
- Fixture de smoke en `backend/src/test/documentsBootstrapSmokeFixture.ts`.
- Smoke test HTTP real en `backend/src/routes/documents.bootstrap.smoke.test.ts`.
- Script dedicado: `npm run smoke:documents-bootstrap`.

Comando manual equivalente:

```powershell
npm run smoke:documents-bootstrap
```

Casos cubiertos (ruta real + auth + workspace middleware):
1. Admin recibe facturas, albaranes y clientes.
2. Operario no recibe facturas.
3. Operario recibe albaranes publicos.
4. Operario recibe albaranes privados solo por actividad asignada.
5. Operario solo recibe contactos vinculados a actividades asignadas.

Sin cambios:
- POST/PUT/DELETE `/documents` intactos.
- `repository.ts` intacto.
- CouchDB no implementado.

Validacion:
- `npm run test` -> 40/40 OK
- `npm run smoke:documents-bootstrap` -> 5/5 OK
- `npm run preflight:ci` -> OK
- `npm run typecheck:backend` -> OK

Proximo bloque (pausado):
- P2d repository adapter interno � solo tras validar smoke en entorno real si hace falta.

---

## Cierre de sesion � punto de control P2CBIS

Fecha: 2026-06-10

Comprobacion `backend/data/db.json`:
- Tamano: 165023 bytes (coincide con backup P2C_OK).
- Sin IDs ni emails del fixture smoke (`f6000005`, `smoke-admin@test.local`, etc.).
- No requiere restauracion; uso normal de `npm run dev` tras el fix de imports dinamicos.

Backup estable:
- `C:\Users\Carlos\Desktop\crm-cetreria_BACKUP_P2CBIS_OK`

Validacion final:
- `npm run test` -> 40/40 OK
- `npm run smoke:documents-bootstrap` -> 5/5 OK
- `npm run preflight:ci` -> OK
- `npm run typecheck:backend` -> 0 errores

P2d (repository adapter) permanece en pausa.

---

## Veri*Factu sandbox � UI no misleading

Fecha: 2026-06-10

Cambios:
- `shared/verifactu.ts`: constantes `VERIFACTU_PROD_NOT_CONFIGURED_CODE`,
  `VERIFACTU_PRODUCTION_UNAVAILABLE_MESSAGE` y helper `isVerifactuProductionOperational`.
- `VerifactuSettings.tsx`: aviso al seleccionar produccion; bloqueo de guardar produccion
  salvo `VITE_VERIFACTU_PRODUCTION_ENABLED=true`.
- `VerifactuApproveModal.tsx`: bloqueo y aviso antes de enviar en produccion sin flag.
- `VerifactuDocumentMetaPanel.tsx` + `DocumentDetail.tsx`: panel de rechazo (codigo, motivo,
  fecha) y de aceptacion (CSV, huella, QR, fecha).
- `backend/src/services/verifactu.ts`: mensaje unificado y flag servidor
  `VERIFACTU_PRODUCTION_ENABLED`.
- Tests: `shared/tests/verifactuSandbox.test.ts`.

Pruebas manuales (sin infra de componentes React):
1. Ajustes Veri*Factu: activar modulo, elegir Produccion -> aviso visible; Guardar deshabilitado.
2. Cambiar a sandbox y guardar -> OK.
3. Factura pendiente en sandbox: Aprobar Veri*Factu -> aceptacion simulada; panel con CSV,
   huella, enlace QR y fecha.
4. Con entorno produccion guardado previamente (BD): modal bloquea envio con mensaje claro.
5. Rechazo `PROD_NOT_CONFIGURED` (si se fuerza produccion en BD): panel muestra codigo y motivo.

Validacion:
- `npm run test` -> 49/49 OK (3 nuevos en verifactuSandbox)
- `npm run preflight:ci` -> OK
- `npm run typecheck:backend` -> OK, 0 errores

---

## Veri*Factu � suite de tests sandbox

Fecha: 2026-06-10

Cambios:
- `shared/tests/verifactu.test.ts`: NIF, QR URL, hash determinista, CSV, bloqueo y validacion.
- `backend/src/services/verifactu.test.ts`: servicio sandbox/produccion, tipos y PDF.
- `backend/src/routes/documents.verifactu.smoke.test.ts`: HTTP POST submit, permisos y PUT bloqueado.
- `backend/src/test/verifactuSmokeFixture.ts`: fixture aislada (prefijo f7*, DB_PATH temporal).
- Script `npm run test:verifactu`; tests incluidos en `npm run test`.
- Eliminado `shared/tests/verifactuSandbox.test.ts` (fusionado en verifactu.test.ts).

Nota: import dinamico del fixture tras fijar `DB_PATH` para no cargar `config.js` antes de tiempo.

Validacion:
- `npm run test:verifactu` -> 22/22 OK
- `npm run test` -> 68/68 OK
- `npm run smoke:documents-bootstrap` -> 5/5 OK
- `npm run preflight:ci` -> OK
- `npm run typecheck:backend` -> OK, 0 errores

---

## Veri*Factu � plan integracion AEAT (solo documentacion)

Fecha: 2026-06-10

Cambios:
- Anadido `docs/VERIFACTU_PRODUCTION_PLAN.md`: arquitectura por fases (0-4), modulos
  `backend/src/services/aeat/*`, env vars, certificado, hash normativo, cola, auditoria,
  anulaciones/rectificativas y tests gate antes de produccion.
- Sin cambios de codigo funcional ni dependencias criptograficas nuevas.

Validacion (sin regresiones):
- `npm run test` -> 68/68 OK
- `npm run preflight:ci` -> OK
- `npm run typecheck:backend` -> OK, 0 errores
