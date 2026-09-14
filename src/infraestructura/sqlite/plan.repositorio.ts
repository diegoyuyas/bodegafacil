import type { ConfiguracionRepositorio, PlanRepositorio } from '@/core/repositorios';
import {
  calcularEstadoPlan,
  CLAVE_ADMIN_PIN_HASH,
  CLAVE_PLAN_VENCE_EN,
  DIAS_PREMIUM_MAXIMO,
  DIAS_PREMIUM_MINIMO,
  type EstadoPlan,
} from '@/core/plan';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import { hoyLocalSql, sumarDiasLocalSql } from '@/core/tiempo';
import { sha256Hex } from '@/infraestructura/seguridad/hash';

/**
 * No hay backend: esto vive enteramente en el dispositivo. El dueño
 * de la app activa Premium a mano en cada visita a una tienda, desde
 * un panel oculto protegido por un PIN (nunca se guarda en texto
 * plano, solo su hash SHA-256 — ver infraestructura/seguridad/hash).
 */
export class PlanRepositorioSqlite implements PlanRepositorio {
  constructor(private readonly configuracion: ConfiguracionRepositorio) {}

  obtenerEstado(): EstadoPlan {
    return calcularEstadoPlan(this.configuracion.obtenerValor(CLAVE_PLAN_VENCE_EN), hoyLocalSql());
  }

  activarPremium(dias: number): void {
    if (!Number.isInteger(dias) || dias < DIAS_PREMIUM_MINIMO || dias > DIAS_PREMIUM_MAXIMO) {
      throw new ErrorDeNegocio(
        `Los días de Premium deben ser un número entero entre ${DIAS_PREMIUM_MINIMO} y ${DIAS_PREMIUM_MAXIMO}.`,
      );
    }
    this.configuracion.establecerValor(CLAVE_PLAN_VENCE_EN, sumarDiasLocalSql(dias));
  }

  desactivarPremium(): void {
    this.configuracion.eliminarValor(CLAVE_PLAN_VENCE_EN);
  }

  tienePinConfigurado(): boolean {
    return this.configuracion.obtenerValor(CLAVE_ADMIN_PIN_HASH) !== null;
  }

  async configurarPin(pinNuevo: string): Promise<void> {
    this.configuracion.establecerValor(CLAVE_ADMIN_PIN_HASH, await sha256Hex(pinNuevo));
  }

  async verificarPin(pin: string): Promise<boolean> {
    const hashGuardado = this.configuracion.obtenerValor(CLAVE_ADMIN_PIN_HASH);
    if (!hashGuardado) return false;
    return (await sha256Hex(pin)) === hashGuardado;
  }

  async cambiarPin(pinActual: string, pinNuevo: string): Promise<boolean> {
    if (!(await this.verificarPin(pinActual))) return false;
    await this.configurarPin(pinNuevo);
    return true;
  }
}
