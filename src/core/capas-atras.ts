/**
 * Vende Fácil — Pop-ups y el botón «Atrás» de Android (lógica pura)
 * ------------------------------------------------------------
 * Cada pop-up abierto (detalle de un pedido, menú de ticket, opciones de un cliente, confirmaciones) se apunta en
 * esta pila. Al tocar «Atrás» solo se cierra el de más arriba; si no hay ninguno, el «Atrás» sigue su camino normal
 * (subir de pantalla). Así «Atrás» con el detalle de un pedido abierto lo cierra y te deja viendo los pedidos, en
 * vez de saltar a Inicio.
 */
export interface CapaAtras {
  id: number;
  cerrar: () => void;
}

export class PilaCapasAtras {
  private capas: CapaAtras[] = [];
  private contador = 0;

  /** Apunta un pop-up recién abierto (queda encima de los demás). Devuelve su número para quitarlo después. */
  abrir(cerrar: () => void): number {
    this.contador += 1;
    this.capas.push({ id: this.contador, cerrar });
    return this.contador;
  }

  /** Lo quita (se cerró por cualquier camino: ✕, tocar fuera, un botón…). Quitar uno que ya no está no hace nada. */
  quitar(id: number): void {
    this.capas = this.capas.filter((c) => c.id !== id);
  }

  get cantidad(): number {
    return this.capas.length;
  }

  /** «Atrás»: cierra SOLO el pop-up de más arriba. Devuelve true si había uno (y entonces «Atrás» no debe cambiar de pantalla). */
  cerrarUltima(): boolean {
    const ultima = this.capas[this.capas.length - 1];
    if (!ultima) return false;
    ultima.cerrar();
    return true;
  }
}

/** La pila de la app: una sola para toda la ventana. */
export const pilaCapasAtras = new PilaCapasAtras();
