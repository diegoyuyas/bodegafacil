import type { BloqueoPinRepositorio, ConfiguracionRepositorio } from '@/core/repositorios';
import {
  CLAVE_BLOQUEO_PIN_ACTIVO,
  CLAVE_BLOQUEO_PIN_HASH,
  CLAVE_POR_DESTINO,
  pinAccesoTieneFormatoValido,
  type DestinoPin,
} from '@/core/bloqueo-pin';
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

  /**
   * ¿Se pide el PIN para este destino? Falso si no hay PIN activo. Para
   * 'ingresar', si el interruptor nunca se tocó (PIN creado antes de que
   * existieran los interruptores) se asume ENCENDIDO, como siempre funcionó;
   * 'anular' y 'modificar' arrancan APAGADOS.
   */
  requiereParaDestino(destino: DestinoPin): boolean {
    if (!this.estaActivo()) return false;
    const valor = this.configuracion.obtenerValor(CLAVE_POR_DESTINO[destino]);
    if (destino === 'ingresar') return valor === null || valor === '1';
    return valor === '1';
  }

  /** Enciende/apaga un interruptor. Apagarlo exige el PIN actual (ver `apagarDestino`). */
  encenderDestino(destino: DestinoPin): void {
    this.configuracion.establecerValor(CLAVE_POR_DESTINO[destino], '1');
  }

  async apagarDestino(destino: DestinoPin, pinActual: string): Promise<boolean> {
    if (!(await this.verificar(pinActual))) return false;
    this.configuracion.establecerValor(CLAVE_POR_DESTINO[destino], '0');
    return true;
  }

  private async guardarHash(pin: string): Promise<void> {
    if (!pinAccesoTieneFormatoValido(pin)) {
      throw new ErrorDeNegocio('El PIN debe ser de 4 dígitos numéricos.');
    }
    this.configuracion.establecerValor(CLAVE_BLOQUEO_PIN_HASH, await sha256Hex(pin));
  }

  async activar(pinNuevo: string): Promise<void> {
    await this.guardarHash(pinNuevo);
    this.configuracion.establecerValor(CLAVE_BLOQUEO_PIN_ACTIVO, '1');
    // Un PIN recién creado protege la entrada a la app, como siempre.
    this.encenderDestino('ingresar');
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
    await this.guardarHash(pinNuevo); // solo cambia el hash: los interruptores quedan como estaban
    return true;
  }
}
