import type { BloqueoPinRepositorio, ConfiguracionRepositorio } from '@/core/repositorios';
import { CLAVE_BLOQUEO_PIN_ACTIVO, CLAVE_BLOQUEO_PIN_HASH, pinAccesoTieneFormatoValido } from '@/core/bloqueo-pin';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import { sha256Hex } from '@/infraestructura/seguridad/hash';

/**
 * Igual que `PlanRepositorioSqlite` con el PIN admin: nunca se guarda
 * el PIN en texto plano, solo su hash SHA-256. Vive enteramente en
 * `configuracion_app`, en dos claves propias (independientes de las
 * del PIN admin).
 */
export class BloqueoPinRepositorioSqlite implements BloqueoPinRepositorio {
  constructor(private readonly configuracion: ConfiguracionRepositorio) {}

  estaActivo(): boolean {
    return this.configuracion.obtenerValor(CLAVE_BLOQUEO_PIN_ACTIVO) === '1';
  }

  async activar(pinNuevo: string): Promise<void> {
    if (!pinAccesoTieneFormatoValido(pinNuevo)) {
      throw new ErrorDeNegocio('El PIN debe ser de 4 dígitos numéricos.');
    }
    this.configuracion.establecerValor(CLAVE_BLOQUEO_PIN_HASH, await sha256Hex(pinNuevo));
    this.configuracion.establecerValor(CLAVE_BLOQUEO_PIN_ACTIVO, '1');
  }

  async desactivar(pinActual: string): Promise<boolean> {
    if (!(await this.verificar(pinActual))) return false;
    this.configuracion.establecerValor(CLAVE_BLOQUEO_PIN_ACTIVO, '0');
    return true;
  }

  async verificar(pin: string): Promise<boolean> {
    const hashGuardado = this.configuracion.obtenerValor(CLAVE_BLOQUEO_PIN_HASH);
    if (!hashGuardado) return false; // nunca se configuró un PIN: nada que verificar
    return (await sha256Hex(pin)) === hashGuardado;
  }

  async cambiarPin(pinActual: string, pinNuevo: string): Promise<boolean> {
    if (!(await this.verificar(pinActual))) return false;
    await this.activar(pinNuevo); // reescribe el hash; ya estaba activo, así que no cambia ese estado
    return true;
  }
}
