'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Dibuja a sus hijos directamente en <body>. Las ventanas de permiso/PIN viven dentro de cada pantalla, y la pantalla
 * (con su animación) queda DEBAJO de los pop-ups que van en <body> (detalle de un pedido, cliente…): sin esto, al
 * pedir el PIN desde un pop-up la ventana del PIN quedaba escondida detrás de él.
 */
export function EnCuerpo({ children }: { children: ReactNode }) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;
  return createPortal(children, document.body);
}
