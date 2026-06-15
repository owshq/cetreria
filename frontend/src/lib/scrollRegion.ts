/** Marca un contenedor con scroll; en `scrollbars.module.css` el thumb solo se muestra con hover/focus. */
export const scrollRegionProps = { 'data-scroll-region': '' } as const;

/**
 * Region de scroll secundaria: el viewport principal (`main`) tiene prioridad.
 * El scroll interno solo aplica cuando el main ya no puede desplazarse en esa direccion.
 */
export const scrollSecondaryRegionProps = {
  'data-scroll-region': '',
  'data-scroll-secondary': '',
} as const;

/** Scroll local con prioridad sobre el viewport principal (sidebars, listas flotantes, visor PDF). */
export const scrollLocalProps = { 'data-scroll-local': '' } as const;

/**
 * Panel con scroll propio dentro del main (p. ej. cuerpo de reportes).
 * Las regiones secundarias dentro delegan aqui antes que al viewport.
 */
export const scrollPaneProps = {
  'data-scroll-region': '',
  'data-scroll-pane': '',
} as const;
