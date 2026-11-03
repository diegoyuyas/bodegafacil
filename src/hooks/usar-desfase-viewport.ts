import { useEffect } from 'react';
import { calcularDesfaseAbajo } from '@/core/navegacion';

/**
 * Mantiene al día la variable CSS `--desfase-viewport-abajo` (en píxeles): lo que hay que subir los elementos
 * fijos de abajo para que sigan pegados al borde visible, aunque el WebView calcule «fixed» sobre un área más
 * alta que la que se ve (así su parte de abajo —por ejemplo los nombres de la barra— quedaría escondida detrás
 * de la barra de navegación de Android). Normalmente vale 0.
 */
export function usarDesfaseViewport(): void {
  useEffect(() => {
    const visual = window.visualViewport;
    function actualizar() {
      const desfase = visual ? calcularDesfaseAbajo(window.innerHeight, visual.height, visual.offsetTop) : 0;
      document.documentElement.style.setProperty('--desfase-viewport-abajo', `${desfase}px`);
    }
    actualizar();
    visual?.addEventListener('resize', actualizar);
    visual?.addEventListener('scroll', actualizar);
    window.addEventListener('resize', actualizar);
    window.addEventListener('orientationchange', actualizar);
    return () => {
      visual?.removeEventListener('resize', actualizar);
      visual?.removeEventListener('scroll', actualizar);
      window.removeEventListener('resize', actualizar);
      window.removeEventListener('orientationchange', actualizar);
    };
  }, []);
}
