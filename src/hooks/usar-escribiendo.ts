import { useEffect, useState } from 'react';
import { esCampoDeTexto } from '@/core/navegacion';

/**
 * true mientras el usuario tiene el foco en un campo que abre el teclado. Los botones fijos de abajo (barra de
 * navegación y botón flotante) se ocultan entonces, para que el teclado de Android no los suba sobre el formulario.
 */
export function usarEscribiendo(): boolean {
  const [escribiendo, setEscribiendo] = useState(false);

  useEffect(() => {
    function revisar() {
      const el = document.activeElement as HTMLElement | null;
      setEscribiendo(Boolean(el) && esCampoDeTexto(el?.tagName, (el as HTMLInputElement | null)?.type, el?.isContentEditable));
    }
    function alSalir() {
      // Al pasar de un campo a otro, el nuevo ya tiene el foco cuando corre esto: no parpadea.
      window.setTimeout(revisar, 0);
    }
    document.addEventListener('focusin', revisar);
    document.addEventListener('focusout', alSalir);
    return () => {
      document.removeEventListener('focusin', revisar);
      document.removeEventListener('focusout', alSalir);
    };
  }, []);

  return escribiendo;
}
