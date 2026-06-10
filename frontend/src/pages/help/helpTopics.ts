export type HelpStep = {
  title?: string;
  text: string;
  detail?: string;
};

export type HelpBlock =
  | ({ type: 'text'; title: string; body: string } & HelpBlockAudience)
  | ({ type: 'list'; title: string; items: HelpStep[]; ordered?: boolean } & HelpBlockAudience)
  | ({ type: 'callout'; variant: 'tip' | 'note'; body: string } & HelpBlockAudience);

type HelpBlockAudience = {
  /** Por defecto visible para todos. */
  audience?: 'admin' | 'operator';
};

export const HELP_TOPIC_IDS = [
  'getting-started',
  'home',
  'activities',
  'contacts',
  'documents',
  'reports',
  'app-settings',
  'contact-groups',
  'document-groups',
  'saved-views',
  'company',
] as const;

export type HelpTopicId = (typeof HELP_TOPIC_IDS)[number];

export type HelpTopic = {
  id: HelpTopicId;
  title: string;
  summary: string;
  appRoute?: string;
  appRouteLabel?: string;
  adminOnly?: boolean;
  blocks: HelpBlock[];
};

export type HelpNavGroup = {
  id: string;
  label: string;
  topicIds: HelpTopicId[];
};

export const HELP_NAV_GROUPS: HelpNavGroup[] = [
  {
    id: 'start',
    label: 'Empezar',
    topicIds: ['getting-started'],
  },
  {
    id: 'modules',
    label: 'Modulos del menu',
    topicIds: ['home', 'activities', 'contacts', 'documents', 'reports', 'app-settings'],
  },
  {
    id: 'organization',
    label: 'Organizacion y filtros',
    topicIds: ['contact-groups', 'document-groups', 'saved-views'],
  },
  {
    id: 'admin',
    label: 'Administracion',
    topicIds: ['company'],
  },
];

export const HELP_TOPICS: Record<HelpTopicId, HelpTopic> = {
  'getting-started': {
    id: 'getting-started',
    title: 'Primeros pasos',
    summary:
      'Recorrido recomendado para administradores y operarios. Sigue el orden que corresponda a tu rol la primera vez que configuras el workspace.',
    blocks: [
      {
        type: 'text',
        title: 'Antes de empezar',
        body: 'La aplicacion organiza el trabajo en modulos del menu lateral. Cada modulo tiene una funcion concreta; abajo encontraras la guia de cada uno.',
      },
      {
        type: 'list',
        title: 'Si eres administrador',
        audience: 'admin',
        ordered: true,
        items: [
          {
            title: 'Revisa Inicio',
            text: 'Consulta metricas del periodo y actividades recientes.',
          },
          {
            title: 'Organiza contactos',
            text: 'Crea clientes y asignalos a un grupo antes de planificar visitas.',
          },
          {
            title: 'Planifica actividades',
            text: 'Registra visitas, tareas y turnos con operarios asignados.',
          },
          {
            title: 'Emite documentos',
            text: 'Genera albaranes o facturas vinculados al contacto y, si aplica, a la actividad.',
          },
          {
            title: 'Consulta reportes',
            text: 'Filtra informes por periodo o contacto y exporta PDF.',
          },
        ],
      },
      {
        type: 'list',
        title: 'Si eres operario',
        audience: 'operator',
        ordered: true,
        items: [
          {
            title: 'Revisa tu cuenta',
            text: 'Ve a Configuracion > Cuenta y comprueba tu nombre y email.',
            detail: 'Si tu empresa usa firmas de horas, configura la firma en Configuracion > Firma.',
          },
          {
            title: 'Mira Inicio',
            text: 'Consulta el resumen del periodo y las actividades recientes que te afectan.',
          },
          {
            title: 'Abre Actividades',
            text: 'Usa calendario o tabla para ver visitas, tareas y turnos asignados a ti.',
            detail: 'Pulsa una actividad para abrir su detalle.',
          },
          {
            title: 'Completa el trabajo',
            text: 'Al finalizar tu tramo, firma las horas reales o envia el informe de trabajo.',
            detail: 'Depende del tipo de actividad y de los modulos activos en tu empresa.',
          },
          {
            title: 'Revisa documentos',
            text: 'En Documentos veras albaranes publicos y los de actividades donde participas.',
            detail: 'No tienes acceso a facturas. En Contactos solo veras clientes vinculados a tus actividades.',
          },
          {
            title: 'Consulta reportes',
            text: 'En Reportes puedes ver informes del periodo con tus horas y actividades.',
          },
        ],
      },
      {
        type: 'callout',
        variant: 'tip',
        body: 'Usa la barra lateral de esta pagina para saltar directamente al tema que necesites.',
      },
    ],
  },

  home: {
    id: 'home',
    title: 'Inicio',
    summary: 'Panel de control con el resumen del negocio y accesos rapidos.',
    appRoute: '/home',
    appRouteLabel: 'Ir a Inicio',
    blocks: [
      {
        type: 'text',
        title: 'Para que sirve',
        body: 'Inicio concentra las metricas del periodo seleccionado y un vistazo a la actividad reciente del workspace.',
      },
      {
        type: 'list',
        title: 'Que puedes hacer',
        items: [
          { text: 'Ver metricas de contactos, actividades, horas y documentos.' },
          { text: 'Desplegar graficos para comparar tendencias del periodo.' },
          { text: 'Buscar contactos y actividades con la busqueda global.' },
          { text: 'Crear actividad, contacto o documento con el boton + de la barra superior.' },
        ],
      },
      {
        type: 'callout',
        variant: 'note',
        body: 'Cambia el periodo (semana, mes, trimestre, etc.) desde los filtros de fecha en la parte superior.',
      },
    ],
  },

  activities: {
    id: 'activities',
    title: 'Actividades',
    summary: 'Planificacion diaria: visitas, tareas, turnos y seguimiento de horas.',
    appRoute: '/activities',
    appRouteLabel: 'Ir a Actividades',
    blocks: [
      {
        type: 'text',
        title: 'Para que sirve',
        body: 'Una actividad registra un trabajo concreto: tipo, contacto, fecha, operarios y horarios. Es el nucleo operativo del dia a dia.',
      },
      {
        type: 'list',
        title: 'Vistas disponibles',
        items: [
          {
            text: 'Calendario: dia, semana, mes o ano con actividades en cada celda.',
            detail: 'La barra lateral secundaria lista las del periodo visible.',
          },
          {
            text: 'Tabla: listado denso con filtros, columnas y exportacion CSV.',
          },
          {
            text: 'Filtro por operario (administradores): revisa la agenda de una persona o de todo el equipo.',
          },
        ],
      },
      {
        type: 'list',
        title: 'Crear una actividad',
        ordered: true,
        items: [
          {
            title: 'Abrir Actividades',
            text: 'Menu lateral > Actividades, o boton + en Inicio > Actividad.',
          },
          {
            title: 'Nueva actividad',
            text: 'Pulsa + en la barra superior o un dia vacio en calendario.',
          },
          {
            title: 'Elegir tipo',
            text: 'Visita, tarea, turno u otro tipo configurado en tu empresa.',
          },
          {
            title: 'Completar datos',
            text: 'Fecha, horario, descripcion y contacto. Asigna operarios y tramos si aplica.',
          },
          {
            title: 'Registrar',
            text: 'Guarda la actividad; aparecera en calendario y tabla.',
          },
        ],
      },
      {
        type: 'list',
        title: 'Despues de crear',
        items: [
          { text: 'Editar mientras la actividad siga vigente (segun permisos).' },
          { text: 'Vincular documentos desde la ficha de la actividad.' },
          { text: 'Firmar horas reales al finalizar el tramo asignado.' },
          { text: 'Completar informe de trabajo en tipos que lo requieran.' },
          { text: 'Exportar calendario (.ics) o tabla (.csv) desde el menu de opciones.' },
        ],
      },
    ],
  },

  contacts: {
    id: 'contacts',
    title: 'Contactos',
    summary: 'Fichas de clientes y empresas con historial, actividades y documentos.',
    appRoute: '/clients',
    appRouteLabel: 'Ir a Contactos',
    adminOnly: true,
    blocks: [
      {
        type: 'text',
        title: 'Para que sirve',
        body: 'Contactos es el directorio de clientes. Cada ficha concentra datos comerciales, actividades vinculadas, documentos e historial.',
      },
      {
        type: 'list',
        title: 'Acciones habituales',
        items: [
          { text: 'Buscar, crear y editar contactos desde la tabla principal.' },
          { text: 'Abrir la ficha para ver actividades, documentos y metricas del cliente.' },
          { text: 'Importar o exportar CSV desde el menu de opciones (administradores).' },
          { text: 'Filtrar por grupo en la barra lateral secundaria.' },
        ],
      },
      {
        type: 'callout',
        variant: 'tip',
        body: 'Crea grupos de contactos antes de importar un CSV para clasificar los registros desde el primer dia. Ver tema "Grupos de contactos".',
      },
    ],
  },

  documents: {
    id: 'documents',
    title: 'Documentos',
    summary: 'Albaranes, facturas y otros documentos vinculados a contactos y actividades.',
    appRoute: '/docs',
    appRouteLabel: 'Ir a Documentos',
    blocks: [
      {
        type: 'text',
        title: 'Para que sirve',
        body: 'Documentos centraliza la emision y consulta de albaranes y facturas. Cada documento se asocia a un contacto y, opcionalmente, a una actividad.',
      },
      {
        type: 'list',
        title: 'Acciones habituales',
        items: [
          { text: 'Crear documento desde el listado o con el boton + de Inicio.' },
          { text: 'Filtrar por grupo de documentos o por contacto en la barra lateral.' },
          { text: 'Descargar PDF, enviar por correo o duplicar un documento existente.' },
          { text: 'Guardar vistas de listado con filtros personalizados.' },
        ],
      },
      {
        type: 'callout',
        variant: 'note',
        body: 'Los operarios ven albaranes publicos y los privados ligados a sus actividades. Las facturas solo las ven administradores.',
      },
    ],
  },

  reports: {
    id: 'reports',
    title: 'Reportes',
    summary: 'Informes de actividad, horas y documentos exportables en PDF.',
    appRoute: '/reports',
    appRouteLabel: 'Ir a Reportes',
    blocks: [
      {
        type: 'text',
        title: 'Para que sirve',
        body: 'Reportes agrega datos del workspace en informes descargables. Util para revisiones periodicas y seguimiento comercial.',
      },
      {
        type: 'list',
        title: 'Acciones habituales',
        items: [
          { text: 'Elegir tipo de informe: general, contactos, equipo u otros disponibles.' },
          { text: 'Filtrar por periodo y, si aplica, por contacto o grupo.' },
          { text: 'Generar y descargar el PDF del informe.' },
          { text: 'Consultar informes guardados previamente en el mismo periodo.' },
        ],
      },
    ],
  },

  'app-settings': {
    id: 'app-settings',
    title: 'Configuracion',
    summary: 'Perfil, apariencia, usuarios y ajustes del workspace.',
    appRoute: '/settings',
    appRouteLabel: 'Ir a Configuracion',
    blocks: [
      {
        type: 'text',
        title: 'Para que sirve',
        body: 'Configuracion concentra los ajustes personales y los del workspace. Usa su propia barra lateral para navegar entre apartados.',
      },
      {
        type: 'list',
        title: 'Apartados principales',
        items: [
          { text: 'Cuenta: nombre, email y datos de perfil.' },
          { text: 'Firma: necesaria para confirmar horas en actividades (si esta activa).' },
          { text: 'Turnos: horarios base del workspace (si estan activos).' },
          {
            text: 'Empresa, usuarios, tipos de actividad y documentos financieros (solo administradores).',
          },
        ],
      },
      {
        type: 'callout',
        variant: 'tip',
        body: 'Los datos fiscales de empresa salen en PDF de documentos y reportes. Configuralos en Configuracion > Empresa.',
      },
    ],
  },

  'contact-groups': {
    id: 'contact-groups',
    title: 'Grupos de contactos',
    summary: 'Clasifica clientes para filtrar el listado y organizar importaciones.',
    appRoute: '/clients',
    appRouteLabel: 'Ir a Contactos',
    adminOnly: true,
    blocks: [
      {
        type: 'text',
        title: 'Para que sirve',
        body: 'Cada contacto pertenece a un grupo (Clientes, Proveedores, etc.). Los grupos aparecen en la barra lateral de Contactos como filtros rapidos.',
      },
      {
        type: 'list',
        title: 'Como usarlos',
        ordered: true,
        items: [
          {
            text: 'Pulsa un grupo en la barra lateral para ver solo esos contactos.',
            detail: '"Todos" muestra el listado completo sin filtrar por grupo.',
          },
          {
            text: 'Al crear un contacto, elige su grupo en la ficha.',
            detail: 'Si no indicas otro, se usa el grupo por defecto del workspace.',
          },
          {
            text: 'Crea grupos nuevos con "Crear grupo" al pie del sidebar.',
          },
          {
            text: 'Desde el menu de opciones de un grupo: descargar CSV o eliminarlo.',
            detail: 'Al eliminar, mueves los contactos a "Todos" o los borras.',
          },
        ],
      },
    ],
  },

  'document-groups': {
    id: 'document-groups',
    title: 'Grupos de documentos',
    summary: 'Separa albaranes y facturas con nombre propio y control de visibilidad.',
    appRoute: '/docs',
    appRouteLabel: 'Ir a Documentos',
    blocks: [
      {
        type: 'text',
        title: 'Para que sirve',
        body: 'Los documentos se agrupan por tipo: albaranes o facturas. Solo puede existir un grupo por tipo en el workspace. El nombre del grupo es editable.',
      },
      {
        type: 'list',
        title: 'Visibilidad de albaranes',
        items: [
          {
            text: 'Publico: todos los operarios ven los albaranes del grupo.',
          },
          {
            text: 'Privado: cada operario solo ve albaranes de actividades donde esta asignado.',
          },
        ],
      },
      {
        type: 'list',
        title: 'Facturas',
        items: [
          {
            text: 'Las facturas son siempre solo visibles para administradores.',
            detail: 'Los operarios no acceden al grupo de facturas.',
          },
        ],
      },
      {
        type: 'callout',
        variant: 'note',
        body: 'Los administradores crean, renombran y eliminan grupos desde la barra lateral de Documentos.',
      },
    ],
  },

  'saved-views': {
    id: 'saved-views',
    title: 'Vistas guardadas',
    summary: 'Guarda filtros, columnas y orden de listados para reutilizarlos al instante.',
    blocks: [
      {
        type: 'text',
        title: 'Para que sirve',
        body: 'Las vistas guardadas memorizan como quieres ver un listado: filtros activos, columnas visibles, agrupacion y orden. Evita reconfigurar la tabla cada vez.',
      },
      {
        type: 'list',
        title: 'Donde estan disponibles',
        items: [
          { text: 'Contactos (tabla).' },
          { text: 'Documentos (tabla o tablero).' },
          { text: 'Actividades (solo en vista Tabla, no en calendario).' },
        ],
      },
      {
        type: 'list',
        title: 'Guardar una vista',
        ordered: true,
        items: [
          {
            title: 'Abrir filtros',
            text: 'Pulsa el icono de vistas y filtros en la barra superior.',
          },
          {
            title: 'Configurar',
            text: 'Elige tabla o tablero, agrupa, ordena, filtra y muestra u oculta columnas.',
          },
          {
            title: 'Aplicar',
            text: 'Previsualiza el resultado antes de guardar.',
          },
          {
            title: 'Guardar',
            text: 'Pon nombre, icono y marca si es privada (solo tu) o publica (equipo).',
          },
        ],
      },
      {
        type: 'list',
        title: 'Recuperar o restaurar',
        items: [
          { text: 'Selecciona una vista guardada en el sidebar "Vistas" o en el panel de filtros.' },
          {
            text: 'Si modificas una vista activa, usa "Restaurar vista" para volver al estado guardado.',
          },
          {
            text: 'El contador del icono de filtros indica cuantas reglas tienes activas.',
          },
        ],
      },
    ],
  },

  company: {
    id: 'company',
    title: 'Datos de empresa',
    summary: 'Informacion fiscal que aparece en documentos y reportes en PDF.',
    appRoute: '/settings?tab=company',
    appRouteLabel: 'Ir a Configuracion > Empresa',
    adminOnly: true,
    blocks: [
      {
        type: 'text',
        title: 'Para que sirve',
        body: 'Nombre comercial, direccion fiscal, email y datos impositivos se imprimen en presupuestos, facturas, albaranes e informes exportados.',
      },
      {
        type: 'list',
        title: 'Como configurarlos',
        ordered: true,
        items: [
          { text: 'Ve a Configuracion > Empresa.' },
          { text: 'Rellena nombre, email y direccion fiscal.' },
          { text: 'Elige pais e impuesto por defecto para nuevos documentos.' },
          { text: 'Guarda. El nombre tambien actualiza el workspace.' },
        ],
      },
    ],
  },
};

export function isHelpTopicId(value: string | null): value is HelpTopicId {
  return value != null && HELP_TOPIC_IDS.includes(value as HelpTopicId);
}

export function resolveHelpTopic(options: {
  preferred?: string | null;
  saved?: string | null;
  isAdmin: boolean;
}): HelpTopicId {
  const { preferred, saved, isAdmin } = options;

  const pick = (id: string | null | undefined): HelpTopicId | null => {
    if (!isHelpTopicId(id)) return null;
    const topic = HELP_TOPICS[id];
    if (topic.adminOnly && !isAdmin) return null;
    return id;
  };

  return (
    pick(preferred) ??
    pick(saved) ??
    'getting-started'
  );
}

export function visibleHelpBlocks(blocks: HelpBlock[]): HelpBlock[] {
  return blocks;
}

export function visibleHelpNavGroups(isAdmin: boolean): HelpNavGroup[] {
  return HELP_NAV_GROUPS.map((group) => ({
    ...group,
    topicIds: group.topicIds.filter((id) => !HELP_TOPICS[id].adminOnly || isAdmin),
  })).filter((group) => group.topicIds.length > 0);
}
