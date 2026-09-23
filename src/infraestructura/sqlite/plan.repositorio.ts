import type { ConfiguracionRepositorio, PlanRepositorio } from '@/core/repositorios';
import {
  calcularEstadoPlan,
  CLAVE_ADMIN_PIN_HASH,
  CLAVE_PLAN_FECHA_MAXIMA_VISTA,
  CLAVE_PLAN_VENCE_EN,
  DIAS_PREMIUM_MAXIMO,
  DIAS_PREMIUM_MINIMO,
  fechaMasAlta,
  type EstadoPlan,
} from '@/core/plan';
import { CLAVE_CODIGOS_ACTIVACION_USADOS, CLAVE_DEVICE_ID, MAXIMO_CODIGOS_USADOS_GUARDADOS } from '@/core/activacion';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import { hoyLocalSql, sumarDiasLocalSql } from '@/core/tiempo';
import { sha256Hex } from '@/infraestructura/seguridad/hash';
import {
  generarIdDispositivo,
  hashCodigoActivacion,
  idDispositivoATexto,
  textoAIdDispositivo,
  verificarCodigoActivacion,
} from '@/infraestructura/seguridad/activacion';

const MENSAJES_ERROR_CODIGO: Record<'formato' | 'firma' | 'dispositivo' | 'expirado', string> = {
  formato: 'Código inválido: revisa que esté completo y sin espacios de más.',
  firma: 'Código inválido: no corresponde a un código emitido para Vende Fácil.',
  dispositivo: 'Este código fue generado para otro dispositivo.',
  expirado: 'Este código ya venció. Pide uno nuevo.',
};

/**
 * Hash SHA-256 del PIN de fábrica del panel de administrador. Así,
 * en una instalación nueva (donde `configuracion_app` todavía no
 * tiene ningún hash guardado), el panel pide directamente ese PIN en
 * vez de mostrar la pantalla de "configurar tu PIN" — el dueño de la
 * app es el único que conoce el PIN real; acá solo vive su hash
 * (irreversible), igual que con cualquier PIN que el dueño configure
 * después a mano.
 */
const HASH_PIN_POR_DEFECTO = '085b8afcdc8c13982c3ec1b7f41aaef2776d427052aba533b7066e3c917fa3b5';

/**
 * No hay backend: esto vive enteramente en el dispositivo. El dueño
 * de la app activa Premium a mano en cada visita a una tienda, desde
 * un panel oculto protegido por un PIN (nunca se guarda en texto
 * plano, solo su hash SHA-256 — ver infraestructura/seguridad/hash),
 * o a distancia mandando un código de activación firmado por
 * WhatsApp (ver infraestructura/seguridad/activacion.ts).
 */
export class PlanRepositorioSqlite implements PlanRepositorio {
  constructor(private readonly configuracion: ConfiguracionRepositorio) {}

  obtenerEstado(): EstadoPlan {
    // Mitigación contra retroceder el reloj del celular para "revivir"
    // un Premium vencido (ver el comentario de CLAVE_PLAN_FECHA_MAXIMA_VISTA
    // en core/plan.ts): en vez de creerle a la fecha de hoy tal cual,
    // se usa la más alta entre "hoy" y la última fecha que la app haya
    // visto. Si el celular retrocedió, sigue mandando la guardada.
    //
    // El nuevo valor queda en memoria de una (se ve reflejado ya
    // mismo en el resto de la sesión); se guarda en disco recién en
    // el próximo `contenedor.persistir()` que dispare cualquier otra
    // acción (una venta, un backup, un cambio de configuración, etc.)
    // — este método no llama a persistir() él solo porque es síncrono
    // y se usa en decenas de pantallas.
    const hoy = hoyLocalSql();
    const fechaMaximaVista = this.configuracion.obtenerValor(CLAVE_PLAN_FECHA_MAXIMA_VISTA);
    const hoyEfectivo = fechaMasAlta(fechaMaximaVista, hoy);
    if (hoyEfectivo !== fechaMaximaVista) {
      this.configuracion.establecerValor(CLAVE_PLAN_FECHA_MAXIMA_VISTA, hoyEfectivo);
    }
    return calcularEstadoPlan(this.configuracion.obtenerValor(CLAVE_PLAN_VENCE_EN), hoyEfectivo);
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
    // Siempre "true": si no hay un hash guardado todavía, el PIN de
    // fábrica (ver HASH_PIN_POR_DEFECTO) cuenta como ya configurado —
    // así el panel nunca ofrece la pantalla de "crear tu propio PIN".
    return true;
  }

  async configurarPin(pinNuevo: string): Promise<void> {
    this.configuracion.establecerValor(CLAVE_ADMIN_PIN_HASH, await sha256Hex(pinNuevo));
  }

  async verificarPin(pin: string): Promise<boolean> {
    const hashGuardado = this.configuracion.obtenerValor(CLAVE_ADMIN_PIN_HASH) ?? HASH_PIN_POR_DEFECTO;
    return (await sha256Hex(pin)) === hashGuardado;
  }

  async cambiarPin(pinActual: string, pinNuevo: string): Promise<boolean> {
    if (!(await this.verificarPin(pinActual))) return false;
    await this.configurarPin(pinNuevo);
    return true;
  }

  obtenerIdDispositivoTexto(): string {
    const guardado = this.configuracion.obtenerValor(CLAVE_DEVICE_ID);
    if (guardado) return guardado;
    const texto = idDispositivoATexto(generarIdDispositivo());
    this.configuracion.establecerValor(CLAVE_DEVICE_ID, texto);
    return texto;
  }

  async activarConCodigo(codigoTexto: string): Promise<void> {
    const idDispositivoActual = textoAIdDispositivo(this.obtenerIdDispositivoTexto());
    const resultado = await verificarCodigoActivacion(codigoTexto, idDispositivoActual, hoyLocalSql());
    if (!resultado.ok) {
      throw new ErrorDeNegocio(MENSAJES_ERROR_CODIGO[resultado.motivo]);
    }

    const hash = await hashCodigoActivacion(codigoTexto);
    const usados = this.obtenerCodigosUsados();
    if (usados.includes(hash)) {
      throw new ErrorDeNegocio('Este código ya fue usado en este dispositivo.');
    }

    this.activarPremium(resultado.diasPremium);
    this.guardarCodigoUsado(hash, usados);
  }

  private obtenerCodigosUsados(): string[] {
    const guardado = this.configuracion.obtenerValor(CLAVE_CODIGOS_ACTIVACION_USADOS);
    if (!guardado) return [];
    return guardado.split(',').filter(Boolean);
  }

  private guardarCodigoUsado(hash: string, actuales: string[]): void {
    const nuevos = [...actuales, hash].slice(-MAXIMO_CODIGOS_USADOS_GUARDADOS);
    this.configuracion.establecerValor(CLAVE_CODIGOS_ACTIVACION_USADOS, nuevos.join(','));
  }
}
