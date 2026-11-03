/**
 * Vende Fácil — Resumen, antigüedad y orden de la pantalla de Fiados (lógica pura)
 * ------------------------------------------------------------
 * Sin UI ni base de datos: recibe listas ya leídas y devuelve lo que la
 * pantalla muestra. Así se prueba con `tsx` sin celular.
 *
 * Reglas (decididas por el dueño):
 *  - Dorado desde los 15 días de la deuda más antigua pendiente.
 *  - Rojo / "vencido" cuando pasa de 30 días (31 o más). Coincide con la
 *    columna "31+ días" que ya usan los reportes (`listarDeudasPorAntiguedad`).
 */
import type { Cliente, DeudaClienteItem } from './tipos';
import { redondear } from './reglas-negocio';

export const DIAS_AVISO_FIADO = 15;
export const DIAS_VENCIDO_FIADO = 30;

export type NivelAntiguedad = 'normal' | 'aviso' | 'vencido';
export type OrdenFiados = 'mayor_deuda' | 'mas_antiguos' | 'pagaron_hace_poco';

export const ORDENES_FIADOS: { valor: OrdenFiados; etiqueta: string }[] = [
  { valor: 'mayor_deuda', etiqueta: 'Mayor deuda' },
  { valor: 'mas_antiguos', etiqueta: 'Más antiguos' },
  { valor: 'pagaron_hace_poco', etiqueta: 'Pagaron hace poco' },
];

/** Un cliente de la lista con la antigüedad de su deuda más vieja aún pendiente. */
export interface FilaFiado {
  cliente: Cliente;
  /** Días de la deuda más antigua con saldo; null si el cliente no tiene deudas abiertas. */
  diasMasAntigua: number | null;
  /** Parte de su deuda que ya pasó los 30 días. */
  montoVencido: number;
}

export interface ResumenFiados {
  totalPorCobrar: number;
  clientesQueDeben: number;
  montoVencido: number;
  clientesVencidos: number;
}

export function nivelAntiguedad(dias: number | null): NivelAntiguedad {
  if (dias === null) return 'normal';
  if (dias > DIAS_VENCIDO_FIADO) return 'vencido';
  if (dias >= DIAS_AVISO_FIADO) return 'aviso';
  return 'normal';
}

/** "Hoy", "Ayer", "Hace 20 días", y en vencidos se añade la palabra (no depender solo del color). */
export function textoAntiguedad(dias: number | null): string {
  if (dias === null) return '';
  const base = dias <= 0 ? 'Hoy' : dias === 1 ? 'Ayer' : `Hace ${dias} días`;
  return nivelAntiguedad(dias) === 'vencido' ? `${base} · Vencido` : base;
}

/** Une cada cliente con los datos de antigüedad (si no hay, queda sin etiqueta). */
export function construirFilasFiado(clientes: Cliente[], antiguedad: DeudaClienteItem[]): FilaFiado[] {
  const porCliente = new Map<number, DeudaClienteItem>();
  for (const item of antiguedad) porCliente.set(item.clienteId, item);
  return clientes.map((cliente) => {
    const item = cliente.saldoPendiente > 0 ? porCliente.get(cliente.id) : undefined;
    return {
      cliente,
      diasMasAntigua: item ? item.diasMasAntigua : null,
      montoVencido: item ? item.deuda31omas : 0,
    };
  });
}

/**
 * Totales de arriba. Se calculan con TODOS los clientes que deben (no con
 * el rango de fechas ni el buscador), para que coincidan con la suma de saldos.
 */
export function calcularResumenFiados(deudores: Cliente[], antiguedad: DeudaClienteItem[]): ResumenFiados {
  const conDeuda = deudores.filter((c) => c.saldoPendiente > 0);
  const ids = new Set(conDeuda.map((c) => c.id));
  let montoVencido = 0;
  let clientesVencidos = 0;
  for (const item of antiguedad) {
    if (!ids.has(item.clienteId) || item.deuda31omas <= 0) continue;
    montoVencido += item.deuda31omas;
    clientesVencidos += 1;
  }
  return {
    totalPorCobrar: redondear(conDeuda.reduce((suma, c) => suma + c.saldoPendiente, 0)),
    clientesQueDeben: conDeuda.length,
    montoVencido: redondear(montoVencido),
    clientesVencidos,
  };
}

export function estaVencido(fila: FilaFiado): boolean {
  return fila.diasMasAntigua !== null && fila.diasMasAntigua > DIAS_VENCIDO_FIADO;
}

export function filtrarSoloVencidos(filas: FilaFiado[]): FilaFiado[] {
  return filas.filter(estaVencido);
}

function porNombre(a: FilaFiado, b: FilaFiado): number {
  return a.cliente.nombre.localeCompare(b.cliente.nombre, 'es');
}

/** Devuelve una copia ordenada (no modifica la lista recibida). Los empates se desempatan por deuda y luego por nombre. */
export function ordenarFilasFiado(filas: FilaFiado[], orden: OrdenFiados): FilaFiado[] {
  const copia = [...filas];
  const porDeuda = (a: FilaFiado, b: FilaFiado) => b.cliente.saldoPendiente - a.cliente.saldoPendiente;

  if (orden === 'mas_antiguos') {
    // Sin deuda abierta (null) al final.
    return copia.sort((a, b) => {
      const da = a.diasMasAntigua ?? -1;
      const db = b.diasMasAntigua ?? -1;
      return db - da || porDeuda(a, b) || porNombre(a, b);
    });
  }
  if (orden === 'pagaron_hace_poco') {
    // Quien nunca pagó (null) al final; la fecha 'YYYY-MM-DD HH:MM:SS' se compara como texto.
    return copia.sort((a, b) => {
      const fa = a.cliente.fechaUltimoPago ?? '';
      const fb = b.cliente.fechaUltimoPago ?? '';
      if (fa !== fb) return fa < fb ? 1 : -1;
      return porDeuda(a, b) || porNombre(a, b);
    });
  }
  return copia.sort((a, b) => porDeuda(a, b) || porNombre(a, b));
}
