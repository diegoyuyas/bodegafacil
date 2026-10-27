import type { Permiso } from '@/core/permisos';

/** Cuánto tiempo vale una autorización de administrador para la acción que se estaba por hacer. */
const VIGENCIA_AUTORIZACION_MS = 120_000;

/**
 * Quién está usando la app en este momento y, si un administrador acaba de autorizar una acción,
 * quién fue. Lo llena la sesión (`ProveedorSesion` y `usarPermisos`) y lo leen los repositorios
 * al guardar, para anotar «lo hizo Diego, lo autorizó María». Vive solo en memoria.
 *
 * Una autorización sirve para UNA sola acción del mismo permiso y vence a los 2 minutos; cambiar de
 * usuario la descarta.
 */
export class ContextoActor {
  private usuarioId: number | null = null;
  private autorizacion: { permiso: Permiso; administradorId: number; vence: number } | null = null;

  constructor(private readonly reloj: () => number = () => Date.now()) {}

  establecerUsuario(id: number | null): void {
    if (id !== this.usuarioId) this.autorizacion = null;
    this.usuarioId = id;
  }

  usuarioActualId(): number | null {
    return this.usuarioId;
  }

  registrarAutorizacion(permiso: Permiso, administradorId: number): void {
    this.autorizacion = { permiso, administradorId, vence: this.reloj() + VIGENCIA_AUTORIZACION_MS };
  }

  /** Devuelve quién autorizó este permiso (y la gasta), o null si nadie lo hizo o ya venció. */
  consumirAutorizacion(permiso: Permiso): number | null {
    const a = this.autorizacion;
    if (!a || a.permiso !== permiso || a.vence < this.reloj()) return null;
    this.autorizacion = null;
    return a.administradorId;
  }
}
