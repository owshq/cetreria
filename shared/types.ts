import type { ShiftCode } from './userSchedule.js';
import type { ActivityAssigneeSlot } from './activityAssignees.js';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  /** Etiqueta visible del rol para cuentas no admin (por defecto "Usuario"). */
  roleLabel?: string;
  /** Foto de perfil (data URL o URL pública). */
  avatarUrl?: string;
  /** Firma manuscrita del trabajador (PNG en data URL). */
  signatureDataUrl?: string;
  /** Máximo de días de vacaciones (código V) que puede marcar al año; 0 = no puede. */
  maxVacationDays?: number;
  password: string;
}

/** Turno planificado de un usuario en un día concreto (workspace). */
export interface UserScheduleEntry {
  id: string;
  workspaceId: string;
  userId: string;
  /** Fecha local yyyy-MM-dd */
  date: string;
  shift: ShiftCode;
  updatedAt: string;
  updatedBy: string;
}

/** Festivo de empresa en el calendario de horarios (visible para todo el workspace). */
export interface WorkspaceScheduleHoliday {
  id: string;
  workspaceId: string;
  /** Fecha local yyyy-MM-dd */
  date: string;
  updatedAt: string;
  updatedBy: string;
}

/** Datos mínimos de usuario para asignación (sin gestión de cuentas). */
export type UserAssignee = Pick<User, 'id' | 'name' | 'avatarUrl' | 'maxVacationDays'>;

export type WorkspaceMemberRole = 'owner' | 'admin' | 'member';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  /** Evita volver a crear «Clientes» si el usuario eliminó todos los grupos. */
  defaultClientGroupSeeded?: boolean;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceMemberRole;
  joinedAt: string;
}

/** Workspace visible para el usuario autenticado (p. ej. tras login). */
export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceMemberRole;
}

export interface ClientObservation {
  id: string;
  text: string;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface ClientGroup {
  id: string;
  workspaceId: string;
  name: string;
  /** Grupo por defecto al crear contactos (p. ej. «Clientes»). Solo organizacion admin. */
  isDefault: boolean;
  createdAt: string;
}

export interface DocumentTypeGroup {
  id: string;
  workspaceId: string;
  /** Tipo de documento asociado al grupo (p. ej. facturas, albaranes). */
  documentType: Document['type'];
  /** Etiqueta visible en la navegación lateral. */
  name: string;
  /** Si true, operarios ven documentos del tipo; ignorado en facturas (siempre admin). */
  isPublic?: boolean;
  createdAt: string;
}

export interface Client {
  id: string;
  workspaceId: string;
  /** Grupo de contactos al que pertenece. */
  groupId: string;
  name: string;
  /** Logo de la empresa (data URL o URL pública). */
  logoUrl?: string;
  email: string;
  phone: string;
  /** Dirección (calle y número) */
  address: string;
  city: string;
  postalCode: string;
  country: string;
  state: string;
  website: string;
  technicalInfo: string;
  observations: ClientObservation[];
  status: 'active' | 'inactive' | 'potential';
  createdAt: string;
  /** Precisión de la fecha de alta: día completo o solo año. */
  createdAtPrecision?: 'day' | 'year';
  /** Campos personalizados: nombre de columna → valor. */
  customFields?: Record<string, string>;
}

export interface DocumentBillingAddress {
  name: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  state: string;
}

export interface DocumentLineItem {
  /** Concepto reutilizable de la línea (único por workspace) */
  name: string;
  /** Descripción libre, puede variar en cada documento */
  description: string;
  quantity: number;
  price: number;
}

import type { WorkspaceDocumentFormats } from './documentNumbering.js';

/** Datos de la empresa emisora, globales por workspace (solo admin). */
export interface WorkspaceBillingSettings {
  id: string;
  workspaceId: string;
  companyName: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  state: string;
  /** IVA / impuesto por defecto en facturas (%) */
  defaultTaxRate: number;
  /** Formatos configurables de número y nombre por tipo de documento. */
  documentFormats?: WorkspaceDocumentFormats;
  /** Plantilla HTML personalizada para PDF (workspace). */
  customDocumentHtml?: string;
  customDocumentHtmlFileName?: string;
  /** Texto legal del pie de pagina en PDF (RGPD / proteccion de datos). */
  documentFooterText?: string;
  /** Logo personalizado para PDF (data URL). */
  documentLogoDataUrl?: string;
  /** Activa facturacion electronica Veri*Factu. */
  verifactuEnabled?: boolean;
  /** Entorno AEAT: pruebas o produccion. */
  verifactuEnvironment?: import('./verifactu.js').VerifactuEnvironment;
  /** NIF/CIF del emisor para Veri*Factu y QR. */
  issuerNif?: string;
  /** Nombre del software registrado ante AEAT. */
  verifactuSoftwareName?: string;
  /** Identificador del software ante AEAT. */
  verifactuSoftwareId?: string;
  /** Version del software declarada ante AEAT. */
  verifactuSoftwareVersion?: string;
  /** Referencia al certificado digital (nombre de archivo). */
  verifactuCertificateFileName?: string;
  /** Ultima huella de encadenamiento emitida. */
  verifactuLastRecordHash?: string;
}

export interface ActivityType {
  id: string;
  workspaceId: string;
  name: string;
  icon: string;
  color: string;
  /** Si true (por defecto), usa Informe de Trabajo y genera albaran al completarlo. */
  createsDeliveryNote?: boolean;
}

/** Firma del usuario asociada a una actividad (trazabilidad). */
export interface ActivityWorkerSignature {
  userId: string;
  userName: string;
  imageDataUrl: string;
  signedAt: string;
  /** Horas del tramo confirmadas al firmar; son las que se contabilizan para el operario. */
  hours: number;
}

export interface Activity {
  id: string;
  workspaceId: string;
  clientId: string;
  userId: string;
  date: string;
  /** ID del tipo de actividad (activity_types) */
  type: string;
  description: string;
  hours: number;
  /** Trabajadores con turno y tramo horario propios en esta actividad. */
  assigneeSlots?: ActivityAssigneeSlot[];
  attachments: string[];
  createdAt: string;
  /** Partes de trabajo (horas reales + notas) por operario. */
  workReports?: import('./activityWorkReport.js').ActivityWorkReport[];
  /** Conceptos adicionales del albaran generado por informes de trabajo. */
  workReportExtraItems?: DocumentLineItem[];
  /** Firma al crear o actualizar la actividad (si el usuario tenía firma guardada). */
  workerSignature?: ActivityWorkerSignature;
}

export type DocumentPdfSigner = {
  userName: string;
  imageDataUrl: string;
  signedAt?: string;
};

export type { ActivityAssigneeSlot } from './activityAssignees.js';

export interface CalendarEvent {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  assignedTo: string[];
  createdBy: string;
  clientId?: string;
  /** Actividad vinculada (registro en activities) */
  activityId?: string;
  history: {
    action: string;
    user: string;
    timestamp: string;
  }[];
}

export type { DocumentTemplateId } from './documentTemplates.js';

export interface Document {
  id: string;
  workspaceId: string;
  type: 'invoice' | 'delivery-note';
  number: string;
  clientId: string;
  /** Actividad a la que pertenece la factura o el albarán */
  activityId?: string;
  date: string;
  items: DocumentLineItem[];
  /** Base imponible (suma de líneas) */
  subtotal?: number;
  /** Porcentaje de impuesto aplicado */
  taxRate?: number;
  /** Importe del impuesto */
  taxAmount?: number;
  total: number;
  /** Notas o memo visible en el PDF */
  notes?: string;
  /** Dirección de facturación del cliente en el momento de emisión */
  billingAddress?: DocumentBillingAddress;
  status: 'draft' | 'sent' | 'paid';
  createdAt: string;
  /** Plantilla visual del PDF */
  templateId?: import('./documentTemplates.js').DocumentTemplateId;
  /** Color de acento de la plantilla (hex) */
  templateColor?: string;
  /** Origen del archivo: generado por la app o subido/capturado */
  pdfSource?: 'generated' | 'uploaded';
  /** MIME type del archivo almacenado (application/pdf, image/jpeg, etc.) */
  pdfContentType?: string;
  /** Clave del PDF en S3 (o almacenamiento local en desarrollo) */
  pdfKey?: string;
  /** Fecha de la última generación/subida del PDF */
  pdfGeneratedAt?: string;
  /** Versión del motor de renderizado PDF (regenerar al cambiar) */
  pdfRenderVersion?: number;
  /** Tipo de factura Veri*Factu (solo facturas). */
  invoiceKind?: import('./verifactu.js').VerifactuInvoiceKind;
  /** Factura original que rectifica (solo rectificativas). */
  rectifiesDocumentId?: string;
  /** Estado del registro en AEAT Veri*Factu. */
  verifactuStatus?: import('./verifactu.js').VerifactuStatus;
  /** Fecha/hora ISO del ultimo envio a AEAT. */
  verifactuSubmittedAt?: string;
  /** Huella del registro Veri*Factu. */
  verifactuHash?: string;
  /** URL embebida en el codigo QR de la factura. */
  verifactuQrUrl?: string;
  /** Imagen PNG del QR en data URL para el PDF. */
  verifactuQrDataUrl?: string;
  /** Codigo Seguro de Verificacion (CSV). */
  verifactuCsv?: string;
  /** Codigo de error AEAT si fue rechazada. */
  verifactuErrorCode?: string;
  /** Mensaje de error AEAT si fue rechazada. */
  verifactuErrorMessage?: string;
}

/** Datos iniciales de la sección documentos en una sola lectura de BD. */
export interface DocumentsBootstrap {
  documents: Document[];
  clients: Client[];
  documentTypeGroups: DocumentTypeGroup[];
  activities: Activity[];
}

/** Concepto de factura predefinido en el workspace (catálogo + emoji). */
export interface InvoiceConceptSetting {
  id: string;
  workspaceId: string;
  /** Texto visible del concepto en facturas y buscadores. */
  label: string;
  /** Clave normalizada para emparejar líneas de documento. */
  normalizedKey: string;
  emoji: string;
  /** Precio unitario por defecto (base imponible). */
  defaultPrice?: number;
}

/** Vistas guardadas de tablas (contactos, documentos, etc.) compartidas en el workspace. */
export interface WorkspaceTableViewsPage {
  id: string;
  workspaceId: string;
  /** Identificador de página: `clients`, `documents`, etc. */
  pageKey: string;
  views: unknown[];
  updatedAt: string;
}

/** Vistas privadas de tablas por usuario dentro de un workspace. */
export interface UserTableViewsPage {
  id: string;
  workspaceId: string;
  userId: string;
  pageKey: string;
  views: unknown[];
  updatedAt: string;
}

/** Estado de sesión de tabla por usuario (pins, orden, anchos, vista activa, filtros). */
export interface UserTableViewStatePage {
  id: string;
  workspaceId: string;
  userId: string;
  pageKey: string;
  config: unknown;
  activeSavedViewId: string | null;
  updatedAt: string;
}

/** Preferencias de UI por usuario (sidebar, paneles, etc.). */
export interface UserInteractionPage {
  id: string;
  workspaceId: string;
  userId: string;
  /** Clave estable, p. ej. `secondary-sidebar-sections:documents`. */
  interactionKey: string;
  payload: unknown;
  updatedAt: string;
}

export interface MonthlyReport {
  id: string;
  workspaceId: string;
  clientId: string;
  month: string;
  year: number;
  /** Intervalo exacto del informe (yyyy-MM-dd). */
  periodFrom?: string;
  periodTo?: string;
  activities: Activity[];
  totalHours: number;
  generatedAt: string;
  /** Usuario que generó el informe. */
  generatedBy?: string;
  generatedByName?: string;
  /** Tipo de informe (general, contacto, operario, etc.). */
  reportKind?: import('./reportKinds.js').ReportKind;
  /** Operario del informe individual, si aplica. */
  workerUserId?: string;
  /** Título en el listado de informes generados. */
  reportLabel?: string;
  /** Parámetros usados al generar el PDF (reabrir vista previa fiel). */
  pdfSnapshot?: Record<string, unknown>;
}

export type {
  Notification,
  NotificationAction,
  NotificationCategory,
} from './notifications.js';

export {
  NOTIFICATION_ACTION_LABELS,
  NOTIFICATION_CATEGORY_LABELS,
  getNotificationCategory,
} from './notifications.js';
