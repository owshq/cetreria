# CRM Cetreria

CRM para gestion operativa: contactos, actividades, documentos financieros, equipos y ajustes por workspace.

## Estructura

- `frontend/` — interfaz React (Vite)
- `backend/` — API Express + persistencia JSON
- `shared/` — tipos y logica compartida

## Requisitos

- Node.js >= 20

## Comandos

```bash
npm install
npm run dev          # backend + frontend
npm run build        # build de produccion del frontend
npm test             # tests principales
npm run preflight:ci # comprobacion de cableado / fixture CI
```

## Que incluye (resumen)

- **Contactos y actividades** — seguimiento de trabajo en campo, partes y estados.
- **Documentos** — facturas, albaranes, PDF, plantillas y numeracion.
- **Facturacion electronica** — gate generico con provider espanol (Veri*Factu) en sandbox; sin integracion AEAT real en produccion.
- **Workspace** — usuarios, roles, apariencia y funcionalidades opcionales por empresa.

La configuracion de entorno va en `.env` (ver variables usadas en `backend/` y `frontend/`).
