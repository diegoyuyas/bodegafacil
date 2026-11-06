import type { ReactNode } from 'react';

/**
 * Íconos propios de la app (SVG de línea, sin librerías). Todos usan el color del texto
 * (`currentColor`), así que se tiñen solos según el estado y el modo claro/oscuro.
 */
export interface PropsIcono {
  tamano?: number;
  className?: string;
}

function Svg({ tamano = 22, className, children }: PropsIcono & { children: ReactNode }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export const IconoInicio = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="M4 11.5 12 5l8 6.5M6 10v8.5h4V14h4v4.5h4V10" />
  </Svg>
);

/** Pedidos: tablilla con lista (reemplaza al carrito del antiguo acceso «Venta»). */
export const IconoPedidos = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="M9 4h6a1 1 0 0 1 1 1v1.5H8V5a1 1 0 0 1 1-1Z" />
    <path d="M8 6H6.5A1.5 1.5 0 0 0 5 7.5v11A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 17.5 6H16" />
    <path d="M9 11h6M9 14.5h6M9 18h3" />
  </Svg>
);

export const IconoProductos = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" />
    <path d="M4 8.5 12 13l8-4.5M12 13v7" />
  </Svg>
);

export const IconoClientes = (p: PropsIcono) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 19c0-3 2.7-5.2 6-5.2s6 2.2 6 5.2" />
    <circle cx="17" cy="9" r="2.4" />
    <path d="M16.5 13.9c2.6.2 4.5 2 4.5 4.6" />
  </Svg>
);

export const IconoMas = (p: PropsIcono) => (
  <Svg {...p}>
    <circle cx="5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="19" cy="12" r="1.2" fill="currentColor" />
  </Svg>
);

export const IconoFiados = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="M6 4h11a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6V4ZM6 4v16M9.5 9h5M9.5 13h5" />
  </Svg>
);

export const IconoCaja = (p: PropsIcono) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6.5 9.5h.01M17.5 14.5h.01" />
  </Svg>
);

export const IconoCompras = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="M5 8h14l-1 11H6L5 8Z" />
    <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
  </Svg>
);

export const IconoReportes = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="M3 20h18M6 20v-7M12 20V5M18 20v-10" />
  </Svg>
);

export const IconoActividad = (p: PropsIcono) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const IconoProveedores = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="M3 7h10v9H3V7ZM13 10h4l3 3.2V16h-7v-6Z" />
    <circle cx="7" cy="17.5" r="1.6" />
    <circle cx="17" cy="17.5" r="1.6" />
  </Svg>
);

export const IconoImportar = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="M12 4v10M8 10.5l4 4 4-4M5 19h14" />
  </Svg>
);

export const IconoRespaldo = (p: PropsIcono) => (
  <Svg {...p}>
    <ellipse cx="12" cy="6" rx="7" ry="3" />
    <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
  </Svg>
);

export const IconoConfiguracion = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Svg>
);

export const IconoImpresora = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2" />
    <rect x="7" y="14" width="10" height="6" />
  </Svg>
);

/** Anular / eliminar: tacho de basura. */
export const IconoTacho = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V4.5h6V7M6.5 7l.9 12a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9l.9-12M10 11v5.5M14 11v5.5" />
  </Svg>
);

/** Ticket / comprobante: recibo con líneas. */
export const IconoTicket = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="M6 3h12v18l-2.2-1.5L13.6 21 12 19.5 10.4 21l-2.2-1.5L6 21V3z" />
    <path d="M9 8h6M9 12h6" />
  </Svg>
);

export const IconoPreferencias = (p: PropsIcono) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4a8 8 0 0 0 0 16V4Z" fill="currentColor" />
  </Svg>
);

export const IconoPlan = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L12 4Z" />
  </Svg>
);

/**
 * Logotipo de WhatsApp (el globo de chat con el teléfono). Es un ícono RELLENO, no de línea: toma el color del
 * texto, así que se pinta de verde WhatsApp con `text-[#25D366]` o en blanco sobre un botón de color.
 */
export const COLOR_WHATSAPP = '#25D366';

export function IconoWhatsApp({ tamano = 22, className }: PropsIcono) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23-1.48 0-2.93-.39-4.19-1.15l-.3-.17-3.12.82.83-3.04-.2-.32a8.188 8.188 0 0 1-1.26-4.38c.01-4.54 3.7-8.24 8.25-8.24M8.53 7.33c-.16 0-.43.06-.66.31-.22.25-.87.86-.87 2.07 0 1.22.89 2.39 1 2.56.14.17 1.76 2.67 4.25 3.73.59.27 1.05.42 1.41.53.59.19 1.13.16 1.56.1.48-.07 1.46-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.07-.1-.23-.16-.48-.27-.25-.14-1.47-.74-1.69-.82-.23-.08-.37-.12-.56.12-.16.25-.64.81-.78.97-.15.17-.29.19-.53.07-.26-.13-1.06-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.12-.24-.01-.39.11-.5.11-.11.27-.29.37-.44.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.11-.56-1.35-.77-1.84-.2-.48-.4-.42-.56-.43-.14 0-.3-.01-.47-.01Z" />
    </svg>
  );
}

export const IconoInfo = (p: PropsIcono) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);
