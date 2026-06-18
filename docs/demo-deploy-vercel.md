# Demo en Vercel — checklist del dia

Guia operativa para publicar una demo estable (1–2 usuarios, flujos reales). No sustituye un despliegue productivo.

---

## 1. Validacion local (antes de push)

```bash
npm install
npm run ci:demo
```

Debe pasar sin errores: preflight, typecheck backend, tests, build produccion.

---

## 2. Recursos en la nube

### Opcion A — solo Vercel (recomendada para demo)

| Recurso | Para que |
|---------|----------|
| **Proyecto Vercel** | Frontend estatico + funcion serverless `/api` |
| **Vercel Blob store** | PDFs + snapshot `db.json` (LowDB) entre invocaciones |

En el dashboard: **Storage → Create Blob store → Connect to project**. Vercel inyecta `BLOB_READ_WRITE_TOKEN` automaticamente.

### Opcion B — Vercel + AWS S3 (alternativa)

| Recurso | Para que |
|---------|----------|
| **Proyecto Vercel** | Frontend estatico + funcion serverless `/api` |
| **Bucket S3** | PDFs + snapshot `db.json` |
| **Usuario IAM** | `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` |

Region recomendada: `eu-west-1`. Si existe Blob token, **Blob tiene prioridad** sobre S3.

---

## 3. Variables de entorno en Vercel (Production)

### Opcion A — Vercel Blob

| Variable | Obligatoria | Valor / notas |
|----------|-------------|---------------|
| `JWT_SECRET` | **Si** | Secreto largo aleatorio (min. 32 chars). **No** usar el default de dev. |
| `BLOB_READ_WRITE_TOKEN` | **Si** | Auto al conectar Blob store al proyecto |
| `DB_BLOB_PATHNAME` | Recomendada | `crm-cetreria/demo-db.json` (snapshot demo) |
| `VITE_API_URL` | Si | `/api` (misma origin; no URL absoluta) |
| `VERIFACTU_MODULE_ENABLED` | No | Dejar vacio/false salvo demo fiscal sandbox |

### Opcion B — AWS S3

| Variable | Obligatoria | Valor / notas |
|----------|-------------|---------------|
| `JWT_SECRET` | **Si** | Secreto largo aleatorio (min. 32 chars) |
| `S3_BUCKET` | **Si** | Nombre del bucket |
| `AWS_ACCESS_KEY_ID` | **Si** | Clave IAM |
| `AWS_SECRET_ACCESS_KEY` | **Si** | Secreto IAM |
| `AWS_REGION` | Si | `eu-west-1` |
| `DB_S3_KEY` | Recomendada | `crm-cetreria/demo-db.json` |
| `VITE_API_URL` | Si | `/api` |
| `VERIFACTU_MODULE_ENABLED` | No | Dejar vacio/false |

Opcional local: `vercel env pull .env.local`

Referencia completa: `.env.example` en la raiz.

---

## 4. Despliegue

### Primera vez

```bash
npm i -g vercel   # si no lo tienes
vercel login
vercel link       # elegir o crear proyecto
```

Subir variables (o hacerlo en la UI) y desplegar:

```bash
vercel --prod
```

### Actualizaciones

```bash
git push origin main    # CI debe pasar
vercel --prod           # o deploy automatico si Git esta conectado
```

El build en Vercel ejecuta `npm run build` (`vercel.json`): Vite → `dist/` + bundle API → `api/index.js`.

---

## 5. Smoke test post-deploy (15 min)

Abrir la URL de produccion y marcar:

- [ ] `GET https://<tu-dominio>/api/health` → `{ "ok": true, "database": "json" }`
- [ ] Login **admin** (credenciales demo tras desbloquear candado en login)
- [ ] Login **operario** (permisos restringidos: sin facturas, si albaranes)
- [ ] Listar contactos y actividades
- [ ] Crear albaran → generar PDF → **recargar pagina** → PDF sigue disponible (Blob/S3 OK)
- [ ] Admin: crear factura → PDF
- [ ] Panel notificaciones carga (polling ~45 s en prod; no hay WebSocket en Vercel)
- [ ] Configuracion workspace (apariencia / funcionalidades) guarda y persiste tras recargar

Si el PDF desaparece al recargar: revisar Blob store conectado o credenciales S3 en Vercel.

Si `/api/*` devuelve 404: revisar rewrites en `vercel.json` y que exista `api/index.js` tras el build.

---

## 6. Que decir en la demo (expectativas)

- CRM operativo real: contactos, actividades, documentos, roles, workspace.
- **Veri*Factu**: solo sandbox simulado; produccion AEAT devuelve `PROD_NOT_CONFIGURED`.
- **Concurrencia**: BD JSON en Blob/S3; valido para 1–2 usuarios en demo; no multi-equipo intensivo.
- **Notificaciones**: actualizacion por polling en prod (no tiempo real tipo chat).

---

## 7. Seguridad minima para URL publica

- [ ] `JWT_SECRET` unico y fuerte en Production
- [ ] No commitear `.env` ni claves AWS
- [ ] Valorar ocultar el bloque de credenciales demo en login si la URL es abierta (PR aparte)
- [ ] Rotar `JWT_SECRET` si se filtra la URL o las credenciales demo

---

## 8. Resto del plan del dia

Orden sugerido tras este checklist:

1. **Desplegar** con Blob store (o S3) + JWT (esta guia)
2. **CI completo** — `npm run ci:demo` en GitHub Actions en cada push
3. **Consolidar** cambios locales pendientes (notificaciones, settings) → commit → redeploy
4. **Probar** smoke test en la URL real
5. **Opcional**: ocultar credenciales en login para demo publica
6. **Opcional**: reset datos demo (nuevo `DB_BLOB_PATHNAME` o `DB_S3_KEY`)

---

## Comandos utiles

```bash
npm run ci:demo              # gate local pre-deploy
npm run preflight:ci         # solo integridad/cableado
npm test                     # suite principal
npm run test:deploy          # auth settings + notificaciones
npm run build                # build igual que Vercel
curl https://<dominio>/api/health
npm run smoke:demo-deploy   # smoke API contra DEMO_URL (default cetreria.vercel.app)
```

---

## Auditoria 2026-06-16 — cetreria.vercel.app

### Variables Vercel (Production)

| Variable | Estado |
|----------|--------|
| `JWT_SECRET` | Configurada |
| `VITE_API_URL` | Configurada |
| `S3_BUCKET` | **Falta** |
| `AWS_ACCESS_KEY_ID` | **Falta** |
| `AWS_SECRET_ACCESS_KEY` | **Falta** |
| `AWS_REGION` | **Falta** |
| `DB_S3_KEY` | **Falta** |

### Smoke API (`npm run smoke:demo-deploy`)

| Paso | Resultado |
|------|-----------|
| Health | OK |
| Login admin | OK |
| Login operario (Sara) | OK |
| Crear actividad | OK |
| Crear albaran (operario) | OK |
| PDF albaran | OK (~4 MB) |
| Crear factura (admin) | OK (tipo actividad Formacion / at-6 evita bloqueo por informes) |
| PDF factura | OK |
| Operario no ve facturas | OK |
| PDF persiste 2a lectura | OK (regenerado en /tmp sin S3) |
| `pdfStorageKey` en documento | **FAIL** — sin S3 no hay clave persistente |

### Smoke UI

| Paso | Resultado |
|------|-----------|
| Login admin en `/login` | OK → redirige a `/home` |
| Dashboard carga datos | OK (contactos, actividades, documentos) |

### Accion requerida (2026-06-16)

Anadir **Blob store** conectado al proyecto (recomendado) **o** variables S3:

```
# Opcion A — Vercel Blob (auto)
BLOB_READ_WRITE_TOKEN=<inyectado por Vercel>
DB_BLOB_PATHNAME=crm-cetreria/demo-db.json

# Opcion B — AWS S3
S3_BUCKET=<tu-bucket>
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=eu-west-1
DB_S3_KEY=crm-cetreria/demo-db.json
```

Redeploy y repetir `npm run smoke:demo-deploy` hasta que `pdfKey` en documento pase.
