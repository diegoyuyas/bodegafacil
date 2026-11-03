/**
 * Vende Fácil — Estado de cuenta de un cliente con fiados (lógica pura)
 * ------------------------------------------------------------
 * Arma la ficha del cliente: deuda actual, compras fiadas y pagos (con anulaciones) en orden de fecha y con
 * el saldo después de cada movimiento. De ahí salen los dos formatos para compartir: la imagen del
 * estado de cuenta (líneas de texto monoespaciado, igual que el ticket) y el mensaje de WhatsApp.
 * Sin UI ni base de datos: se prueba con `tsx`. Es un documento interno, sin valor tributario.
 */
import { LEYENDA_DOCUMENTO_INTERNO, TITULO_DOCUMENTO_INTERNO } from './comprobantes';
import {
  ETIQUETAS_METODO_PAGO_TICKET,
  columnas,
  envolverTexto,
  lineaSeparadora,
  type LineaTexto,
} from './comprobante-impresion';
import { formatearMonto } from './moneda';
import { redondear } from './reglas-negocio';
import type { Cliente, DeudaPendienteDetalle, PagoFiado } from './tipos';
import { textoCantidad } from './ventas-semana';

/** Para que la imagen no salga interminable: se muestran los últimos movimientos y lo anterior se resume en un saldo. */
export const MAXIMO_MOVIMIENTOS_ESTADO = 30;

export type TipoMovimiento = 'saldo_anterior' | 'ajuste' | 'compra' | 'pago' | 'pago_anulado';

export interface MovimientoCuenta {
  tipo: TipoMovimiento;
  /** 'YYYY-MM-DD HH:MM:SS' ('' en el saldo anterior). */
  fecha: string;
  titulo: string;
  detalle: string | null;
  /** Con signo: compras (+), pagos vigentes (−), anulados y saldos iniciales sin efecto propio. */
  monto: number;
  /** Lo que debía el cliente justo después de este movimiento. */
  saldoDespues: number;
}

export interface CompraPendiente {
  ventaId: number | null;
  fecha: string;
  productos: string;
  montoOriginal: number;
  saldoPendiente: number;
}

export interface EstadoCuenta {
  clienteNombre: string;
  clienteDocumento: string | null;
  /** Lo que debe hoy (el saldo del cliente). */
  saldoActual: number;
  /** Suma de las compras fiadas vigentes (sin las ventas anuladas). */
  totalFiado: number;
  /** Suma de los pagos vigentes (sin los anulados). */
  totalPagado: number;
  movimientos: MovimientoCuenta[];
  /** Cuántos movimientos viejos quedaron resumidos en el «saldo anterior». */
  movimientosOmitidos: number;
  comprasPendientes: CompraPendiente[];
  /** Últimos pagos vigentes, del más reciente al más viejo (para el mensaje de WhatsApp). */
  ultimosPagos: { fecha: string; monto: number; metodo: string }[];
}

function etiquetaMetodo(metodo: string): string {
  return ETIQUETAS_METODO_PAGO_TICKET[metodo] ?? metodo;
}

function productosDe(d: DeudaPendienteDetalle): string {
  return d.lineas.map((l) => `${textoCantidad(l.cantidad)} ${l.producto}`).join(', ');
}

/**
 * Arma el estado de cuenta con TODO el historial del cliente (no el rango de fechas de la pantalla).
 * El saldo de cada movimiento parte de un «saldo anterior» que cuadra con la deuda real del cliente, así
 * el último saldo siempre coincide con lo que debe hoy aunque haya datos antiguos o ventas anuladas.
 */
export function construirEstadoCuenta(
  cliente: Pick<Cliente, 'nombre' | 'documento' | 'saldoPendiente'>,
  historial: DeudaPendienteDetalle[],
  pagos: PagoFiado[],
  maximoMovimientos: number = MAXIMO_MOVIMIENTOS_ESTADO,
): EstadoCuenta {
  const comprasVigentes = historial.filter((d) => !d.ventaAnulada);
  const pagosVigentes = pagos.filter((p) => !p.anulado);

  const totalFiado = redondear(comprasVigentes.reduce((s, d) => s + d.montoOriginal, 0));
  const totalPagado = redondear(pagosVigentes.reduce((s, p) => s + p.monto, 0));
  const saldoActual = redondear(cliente.saldoPendiente);

  // Lo que ya debía antes de lo que se ve aquí (datos antiguos) o el ajuste por pagos de ventas anuladas.
  const saldoInicial = redondear(saldoActual - totalFiado + totalPagado);

  interface Evento {
    fecha: string;
    orden: number;
    mov: Omit<MovimientoCuenta, 'saldoDespues'>;
  }
  const eventos: Evento[] = [];
  for (const d of comprasVigentes) {
    eventos.push({
      fecha: d.fecha,
      orden: 0,
      mov: {
        tipo: 'compra',
        fecha: d.fecha,
        titulo: d.ventaId ? `Compra V-${d.ventaId}` : 'Compra',
        detalle: productosDe(d) || null,
        monto: d.montoOriginal,
      },
    });
  }
  for (const p of pagos) {
    const metodo = etiquetaMetodo(p.metodoPago);
    eventos.push({
      fecha: p.fecha,
      orden: 1,
      mov: p.anulado
        ? {
            tipo: 'pago_anulado',
            fecha: p.fecha,
            titulo: 'Pago anulado',
            detalle: p.motivoAnulacion ? `${metodo}. Motivo: ${p.motivoAnulacion}` : metodo,
            monto: 0,
          }
        : { tipo: 'pago', fecha: p.fecha, titulo: `Pago ${metodo}`, detalle: null, monto: -p.monto },
    });
  }
  // Por fecha; en la misma fecha, primero las compras y luego los pagos (un pago no puede ir antes de lo que paga).
  eventos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.orden - b.orden));

  const todos: MovimientoCuenta[] = [];
  let corriente = saldoInicial;
  if (Math.abs(saldoInicial) >= 0.01) {
    // Con ventas anuladas de por medio (algún pago ya se había aplicado a ellas) es un ajuste; si no, deuda de antes.
    const esAjuste = historial.some((d) => d.ventaAnulada);
    todos.push({
      tipo: esAjuste ? 'ajuste' : 'saldo_anterior',
      fecha: '',
      titulo: esAjuste ? 'Ajuste (venta anulada)' : 'Saldo anterior',
      detalle: null,
      monto: saldoInicial,
      saldoDespues: saldoInicial,
    });
  }
  for (const e of eventos) {
    corriente = redondear(corriente + e.mov.monto);
    todos.push({ ...e.mov, saldoDespues: corriente });
  }

  // Muy largo: se dejan los últimos movimientos y lo viejo se resume en un solo «saldo anterior».
  let movimientos = todos;
  let movimientosOmitidos = 0;
  if (maximoMovimientos > 0 && todos.length > maximoMovimientos) {
    movimientosOmitidos = todos.length - maximoMovimientos;
    const ultimoOmitido = todos[movimientosOmitidos - 1];
    movimientos = [
      {
        tipo: 'saldo_anterior',
        fecha: '',
        titulo: 'Saldo anterior',
        detalle: `${movimientosOmitidos} movimientos anteriores`,
        monto: ultimoOmitido?.saldoDespues ?? 0,
        saldoDespues: ultimoOmitido?.saldoDespues ?? 0,
      },
      ...todos.slice(movimientosOmitidos),
    ];
  }

  return {
    clienteNombre: cliente.nombre,
    clienteDocumento: cliente.documento,
    saldoActual,
    totalFiado,
    totalPagado,
    movimientos,
    movimientosOmitidos,
    comprasPendientes: comprasVigentes
      .filter((d) => d.saldoPendiente > 0)
      .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
      .map((d) => ({
        ventaId: d.ventaId,
        fecha: d.fecha,
        productos: productosDe(d),
        montoOriginal: d.montoOriginal,
        saldoPendiente: d.saldoPendiente,
      })),
    ultimosPagos: pagosVigentes
      .slice()
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
      .slice(0, 3)
      .map((p) => ({ fecha: p.fecha, monto: p.monto, metodo: etiquetaMetodo(p.metodoPago) })),
  };
}

/** Nombre del archivo de la imagen: «estado-cuenta-ana-lopez.png» (sin tildes, espacios ni símbolos). */
export function nombreArchivoEstadoCuenta(nombreCliente: string): string {
  const base = nombreCliente
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '');
  return `estado-cuenta-${base || 'cliente'}.png`;
}

/** '2026-10-11 09:00:00' → '11/10/2026'. */
export function fechaCompleta(fechaSql: string): string {
  const [anio = '', mes = '', dia = ''] = fechaSql.slice(0, 10).split('-');
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : '';
}

/** '2026-10-11 09:00:00' → '11/10/26'. */
export function fechaCorta(fechaSql: string): string {
  const [anio = '', mes = '', dia = ''] = fechaSql.slice(0, 10).split('-');
  return anio && mes && dia ? `${dia}/${mes}/${anio.slice(2)}` : '';
}

export interface DatosEstadoCuenta {
  tienda: {
    nombre: string;
    documento: string | null;
    ubicacion: string | null;
    contacto: string | null;
    leyenda: string | null;
  };
  simboloMoneda: string;
  /** Fecha de hoy ya escrita, 'dd/mm/aaaa'. */
  fecha: string;
  estado: EstadoCuenta;
}

function conSigno(valor: number, simbolo: string): string {
  const texto = `${simbolo} ${Math.abs(valor).toFixed(2)}`;
  return valor > 0 ? `+${texto}` : valor < 0 ? `-${texto}` : texto;
}

/**
 * Las líneas del estado de cuenta, en monoespaciado (`ancho` caracteres), para dibujarlas en la imagen con
 * el mismo dibujante del ticket. Los textos largos se envuelven en vez de cortarse.
 */
export function construirLineasEstadoCuenta(datos: DatosEstadoCuenta, ancho: number): LineaTexto[] {
  const s = datos.simboloMoneda;
  const e = datos.estado;
  const lineas: LineaTexto[] = [];
  const centro = (texto: string, extra: Partial<LineaTexto> = {}) => {
    const anchoEfectivo = extra.grande ? Math.round(ancho * 0.7) : ancho;
    for (const sub of envolverTexto(texto, anchoEfectivo)) lineas.push({ texto: sub, alineacion: 'centro', ...extra });
  };
  const izq = (texto: string, extra: Partial<LineaTexto> = {}, sangria = 0) => {
    for (const sub of envolverTexto(texto, ancho - sangria)) {
      lineas.push({ texto: `${' '.repeat(sangria)}${sub}`, alineacion: 'izquierda', ...extra });
    }
  };
  const fila = (izquierda: string, derecha: string, extra: Partial<LineaTexto> = {}) => {
    lineas.push({ texto: columnas(izquierda, derecha, ancho), alineacion: 'izquierda', ...extra });
  };

  centro(datos.tienda.nombre, { negrita: true, grande: true });
  if (datos.tienda.documento) centro(datos.tienda.documento);
  if (datos.tienda.ubicacion) centro(datos.tienda.ubicacion);
  centro('');
  centro('ESTADO DE CUENTA', { negrita: true });
  centro(TITULO_DOCUMENTO_INTERNO, { negrita: true });
  izq(lineaSeparadora(ancho));

  izq(`Fecha: ${datos.fecha}`);
  const documento = e.clienteDocumento ? ` / DNI: ${e.clienteDocumento}` : '';
  izq(`Cliente: ${e.clienteNombre}${documento}`);
  izq(lineaSeparadora(ancho));

  fila('DEUDA ACTUAL:', `${s} ${e.saldoActual.toFixed(2)}`, { negrita: true });
  fila('Total fiado:', `${s} ${e.totalFiado.toFixed(2)}`);
  fila('Total pagado:', `${s} ${e.totalPagado.toFixed(2)}`);
  izq(lineaSeparadora(ancho));

  if (e.movimientos.length === 0) {
    izq('Todavía no tiene movimientos.');
  } else {
    izq('MOVIMIENTOS', { negrita: true });
    for (const m of e.movimientos) {
      const fecha = m.fecha ? `${fechaCorta(m.fecha)} ` : '';
      const monto = m.tipo === 'pago_anulado' ? 'ANULADO' : conSigno(m.monto, s);
      fila(`${fecha}${m.titulo}`, monto, { negrita: m.tipo === 'pago_anulado' });
      if (m.detalle) izq(m.detalle, {}, 2);
      fila('  Saldo:', `${s} ${m.saldoDespues.toFixed(2)}`);
    }
  }
  izq(lineaSeparadora(ancho));

  if (e.comprasPendientes.length > 0) {
    izq('COMPRAS PENDIENTES DE PAGO', { negrita: true });
    for (const c of e.comprasPendientes) {
      const nombre = c.ventaId ? `V-${c.ventaId}` : 'Compra';
      fila(`${fechaCorta(c.fecha)} ${nombre}`, `${s} ${c.saldoPendiente.toFixed(2)}`);
      if (c.saldoPendiente < c.montoOriginal) izq(`de ${s} ${c.montoOriginal.toFixed(2)} (ya abonó)`, {}, 2);
    }
    izq(lineaSeparadora(ancho));
  }

  centro('');
  if (datos.tienda.contacto) centro(`Contáctanos: ${datos.tienda.contacto}`);
  if (datos.tienda.leyenda) centro(datos.tienda.leyenda);
  centro('');
  if (ancho >= LEYENDA_DOCUMENTO_INTERNO.length) {
    centro(LEYENDA_DOCUMENTO_INTERNO);
  } else {
    const [primera = '', ...resto] = LEYENDA_DOCUMENTO_INTERNO.split(', ');
    centro(`${primera},`);
    centro(resto.join(', '));
  }
  return lineas;
}

/** Versión en texto para WhatsApp: deuda actual, compras pendientes y últimos pagos. */
export function construirMensajeEstadoCuenta(datos: DatosEstadoCuenta): string {
  const s = datos.simboloMoneda;
  const e = datos.estado;
  const l: string[] = [`Hola ${e.clienteNombre} 👋`, '', `Este es tu estado de cuenta al ${datos.fecha}:`, ''];
  if (e.saldoActual > 0) {
    l.push(`*Deuda actual: ${formatearMonto(e.saldoActual, s)}*`);
  } else {
    l.push('*No tienes deuda pendiente* 🙌');
  }
  if (e.comprasPendientes.length > 0) {
    l.push('', 'Compras pendientes:');
    for (const c of e.comprasPendientes) {
      const nombre = c.ventaId ? ` (V-${c.ventaId})` : '';
      const resto =
        c.saldoPendiente < c.montoOriginal
          ? `debes ${formatearMonto(c.saldoPendiente, s)} de ${formatearMonto(c.montoOriginal, s)}`
          : `${formatearMonto(c.montoOriginal, s)}`;
      l.push(`• ${fechaCorta(c.fecha)}${nombre}: ${c.productos || 'compra al fiado'} — ${resto}`);
    }
  }
  if (e.ultimosPagos.length > 0) {
    l.push('', 'Tus últimos pagos:');
    for (const p of e.ultimosPagos) l.push(`• ${fechaCorta(p.fecha)}: ${formatearMonto(p.monto, s)} (${p.metodo})`);
  }
  l.push('', '¡Gracias! 😊');
  return l.join('\n');
}
