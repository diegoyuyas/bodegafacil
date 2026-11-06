'use client';

import Link from 'next/link';
import { useMemo, useState, useEffect, useRef } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { IconoImpresora, IconoTicket, IconoWhatsApp } from '@/components/ui/iconos';
import { imprimirComprobanteDeVenta } from '@/infraestructura/impresora-bluetooth/imprimir-venta';
import { CLAVE_IMPRESORA_ACTIVA, IMPRESION_BLUETOOTH_DISPONIBLE } from '@/core/impresora';
import { CLAVE_MONEDA, formatearMonto, obtenerSimboloMoneda } from '@/core/moneda';
import { construirVenta, ErrorDeNegocio, redondear } from '@/core/reglas-negocio';
import { calcularPrecioDesdeSubtotal, textoPrecioUnitario } from '@/core/precio-por-subtotal';
import { HojaOpciones } from '@/components/hoja-opciones';
import { LIMITE_VENTAS_PLAN_GRATIS } from '@/core/plan';
import { CLAVE_DESCRIPCION_LINEAS, CLAVE_NOMBRE_TIENDA, CLAVE_NOTIFICAR_STOCK_BAJO, CLAVE_PRECIO_EDITABLE_VENTA, estaActivado, obtenerNombreTienda } from '@/core/configuracion';
import { CLAVE_PREFIJO_PAIS, obtenerPrefijoPais } from '@/core/paises';
import { construirMensajeVenta } from '@/core/whatsapp';
import { construirEnlaceWhatsApp } from '@/infraestructura/whatsapp/enlace';
import type { Cliente, MetodoPago, Producto, Venta } from '@/core/tipos';
import { LIMITE_DESCRIPCION_LINEA, limpiarNumeroEscrito, mayusculasAlEscribir } from '@/core/texto';
import { textoCantidad } from '@/core/ventas-semana';
import { guardarTicketComoImagen } from '@/infraestructura/comprobante-imagen/compartir-ticket';
import { capturarFotoComprobantePago } from '@/infraestructura/comprobante-pago/capturar-foto';
import {
  ETIQUETA_COMPROBANTE,
  comprobantePorDefecto,
  comprobantesDisponibles,
  esRucValido,
  formatearComprobante,
  validarClienteParaFactura,
  type SerieComprobante,
  type TipoComprobante,
} from '@/core/comprobantes';
import {
  mostrarNotificacionSinStock,
  mostrarNotificacionStockBajoProducto,
  soportaNotificaciones,
} from '@/infraestructura/notificaciones/notificaciones-navegador';

interface LineaCarrito {
  productoId: number;
  nombre: string;
  cantidad: number;
  precioVenta: number;
  stockDisponible: number;
  /** Nota corta de esta línea (solo si está activo "Añadir descripción en Venta/Compra"). */
  descripcion: string;
}

const METODOS_PAGO: { valor: MetodoPago; etiqueta: string }[] = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'yape', etiqueta: 'Yape' },
  { valor: 'plin', etiqueta: 'Plin' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta' },
  { valor: 'fiado', etiqueta: 'Fiado' },
];

export default function PaginaNuevaVenta() {
  const { contenedor, cargando, error } = usarContenedor();
  const [simboloMoneda, setSimboloMoneda] = useState(obtenerSimboloMoneda(null));

  useEffect(() => {
    if (!contenedor) return;
    setSimboloMoneda(obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)));
  }, [contenedor]);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [texto, setTexto] = useState('');
  const inputBusquedaProductoRef = useRef<HTMLInputElement>(null);

  // Al entrar a la pantalla, foco automático en el buscador para
  // poder escribir de una vez (en Android/Capacitor no siempre alcanza
  // a abrir el teclado solo, pero el cursor sí queda listo).
  useEffect(() => {
    const id = setTimeout(() => inputBusquedaProductoRef.current?.focus(), 100);
    return () => clearTimeout(id);
  }, []);
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo');

  // Cliente: opcional para cualquier método de pago, obligatorio si es fiado.
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [clientesEncontrados, setClientesEncontrados] = useState<Cliente[]>([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);

  // WhatsApp, ticket e impresión se ofrecen DESPUÉS de cobrar, en la pantalla «Venta guardada».
  const [telefonoCelular, setTelefonoCelular] = useState('');
  const [pidiendoCelular, setPidiendoCelular] = useState(false);
  const [accionOcupada, setAccionOcupada] = useState<'ticket' | 'imprimir' | null>(null);
  const [mensajeTicket, setMensajeTicket] = useState<string | null>(null);
  const [impresoraActiva, setImpresoraActiva] = useState(false);
  const [ventaGuardada, setVentaGuardada] = useState<Venta | null>(null);
  const [prefijoPais, setPrefijoPais] = useState(obtenerPrefijoPais(null));

  const [etapa, setEtapa] = useState<'armando' | 'revisando' | 'guardada'>('armando');
  const [totalGuardado, setTotalGuardado] = useState(0);
  const [ventaGuardadaId, setVentaGuardadaId] = useState<number | null>(null);
  const [metodoPagoGuardado, setMetodoPagoGuardado] = useState<MetodoPago>('efectivo');
  const [capturandoFoto, setCapturandoFoto] = useState(false);
  const [fotoComprobanteGuardada, setFotoComprobanteGuardada] = useState(false);
  // Cantidad escrita a mano en una línea del carrito. Mientras se escribe
  // se muestra este texto (puede quedar vacío un momento); la cantidad real
  // de la línea solo cambia cuando lo escrito es un número >= 1, así nunca
  // llega a ser 0. Al salir del campo se vuelve a mostrar la cantidad real.
  const [borradoCantidad, setBorradoCantidad] = useState<{ productoId: number; texto: string } | null>(null);
  const [avisoCantidad, setAvisoCantidad] = useState<{ productoId: number; texto: string } | null>(null);
  const [mensajeFotoPago, setMensajeFotoPago] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [limiteAlcanzado, setLimiteAlcanzado] = useState(false);
  const [ventasUsadas, setVentasUsadas] = useState(0);
  const [precioEditable, setPrecioEditable] = useState(false);
  const [descripcionActiva, setDescripcionActiva] = useState(false);
  // Línea cuyo precio y nota se están editando (cerrado por defecto: la mayoría de las ventas no los necesitan).
  const [lineaEditandoId, setLineaEditandoId] = useState<number | null>(null);
  // Pop-up «Editar subtotal»: la línea y lo que se va escribiendo.
  const [editandoSubtotal, setEditandoSubtotal] = useState<{ productoId: number; texto: string } | null>(null);
  const [esPremium, setEsPremium] = useState(false);
  const [notificarStockBajo, setNotificarStockBajo] = useState(false);
  // Series y comprobantes (Premium): sin series solo hay nota de venta; con series, Boleta por defecto.
  const [seriesActivas, setSeriesActivas] = useState<SerieComprobante[]>([]);
  const [tipoComprobante, setTipoComprobante] = useState<TipoComprobante>('nota_venta');
  const [comprobanteGuardado, setComprobanteGuardado] = useState('');

  useEffect(() => {
    if (!contenedor) return;
    setProductos(contenedor.productos.listarActivosParaVenta());
    const usadas = contenedor.ventas.contarTotalHistorico();
    const premium = contenedor.plan.obtenerEstado().tipo === 'premium';
    setVentasUsadas(usadas);
    setLimiteAlcanzado(!premium && usadas >= LIMITE_VENTAS_PLAN_GRATIS);
    setPrecioEditable(estaActivado(contenedor.configuracion.obtenerValor(CLAVE_PRECIO_EDITABLE_VENTA)));
    setDescripcionActiva(estaActivado(contenedor.configuracion.obtenerValor(CLAVE_DESCRIPCION_LINEAS)));
    setEsPremium(premium);
    const activas = contenedor.series.listarActivas();
    setSeriesActivas(activas);
    setTipoComprobante(comprobantePorDefecto(comprobantesDisponibles(premium, activas)));
    setNotificarStockBajo(
      estaActivado(contenedor.configuracion.obtenerValor(CLAVE_NOTIFICAR_STOCK_BAJO)),
    );
    setPrefijoPais(obtenerPrefijoPais(contenedor.configuracion.obtenerValor(CLAVE_PREFIJO_PAIS)));
    setImpresoraActiva(contenedor.configuracion.obtenerValor(CLAVE_IMPRESORA_ACTIVA) === '1');
  }, [contenedor]);

  useEffect(() => {
    if (!contenedor || !busquedaCliente.trim()) {
      setClientesEncontrados([]);
      return;
    }
    setClientesEncontrados(contenedor.clientes.buscarPorTexto(busquedaCliente));
  }, [contenedor, busquedaCliente]);

  const resultadosBusqueda = useMemo(() => {
    if (!texto.trim()) return [];
    const textoNormalizado = texto.trim().toLowerCase();
    return productos
      .filter((p) => p.nombre.toLowerCase().includes(textoNormalizado))
      .slice(0, 8);
  }, [texto, productos]);

  const calculo = useMemo(() => {
    if (carrito.length === 0) return null;
    try {
      return construirVenta(
        carrito.map((l) => ({
          productoId: l.productoId,
          cantidad: l.cantidad,
          precioUnitario: precioEditable ? l.precioVenta : undefined,
        })),
        (id) => {
          const producto = productos.find((p) => p.id === id);
          if (!producto) throw new ErrorDeNegocio(`Producto ${id} ya no existe.`);
          return producto;
        },
      );
    } catch (e) {
      return e instanceof ErrorDeNegocio ? e.message : 'No se pudo calcular la venta.';
    }
  }, [carrito, productos, precioEditable]);

  const calculoValido = calculo && typeof calculo !== 'string' ? calculo : null;
  const totalUnidades = carrito.reduce((suma, l) => suma + l.cantidad, 0);
  const lineaSubtotal = editandoSubtotal ? (carrito.find((l) => l.productoId === editandoSubtotal.productoId) ?? null) : null;
  const precioDelSubtotal =
    editandoSubtotal && lineaSubtotal && editandoSubtotal.texto.trim() !== ''
      ? calcularPrecioDesdeSubtotal(Number(editandoSubtotal.texto), lineaSubtotal.cantidad)
      : null;
  const errorCalculo = typeof calculo === 'string' ? calculo : null;

  const comprobantesPosibles = comprobantesDisponibles(esPremium, seriesActivas);
  const hayComprobantes = comprobantesPosibles.length > 1;
  const tipoEfectivo: TipoComprobante = comprobantesPosibles.includes(tipoComprobante) ? tipoComprobante : 'nota_venta';
  // La serie que le toca a quien vende (la asignada, o la predeterminada del tipo): la misma que usará el repositorio.
  const serieElegida = useMemo(() => {
    if (!contenedor || tipoEfectivo === 'nota_venta') return null;
    return contenedor.series.resolverSerie(tipoEfectivo, contenedor.actor.usuarioActualId());
  }, [contenedor, tipoEfectivo, seriesActivas]);
  const numeroPrevisto = serieElegida
    ? formatearComprobante(serieElegida.serie, serieElegida.siguienteNumero, serieElegida.digitosNumero)
    : null;
  // La factura exige un cliente registrado con RUC válido.
  let errorFactura: string | null = null;
  if (tipoEfectivo === 'factura') {
    try {
      validarClienteParaFactura(clienteSeleccionado?.id ?? null, clienteSeleccionado?.documento ?? null);
    } catch (e) {
      errorFactura = e instanceof ErrorDeNegocio ? e.message : 'La factura necesita un cliente con RUC válido.';
    }
  }

  function agregarProducto(producto: Producto) {
    setTexto('');
    setCarrito((actual) => {
      const existente = actual.find((l) => l.productoId === producto.id);
      if (existente) {
        if (producto.controlaStock && existente.cantidad >= producto.stockActual) return actual;
        return actual.map((l) =>
          l.productoId === producto.id ? { ...l, cantidad: l.cantidad + 1 } : l,
        );
      }
      if (producto.controlaStock && producto.stockActual <= 0) return actual;
      return [
        ...actual,
        {
          productoId: producto.id,
          nombre: producto.nombre,
          cantidad: 1,
          precioVenta: producto.precioVenta,
          stockDisponible: producto.controlaStock ? producto.stockActual : Infinity,
          descripcion: '',
        },
      ];
    });
    // Vuelve el foco al buscador para que quede claro que puede seguir
    // agregando productos sin tener que tocar la pantalla de nuevo.
    // El pequeño delay deja que React re-renderice el input (que se
    // vació arriba) antes de intentar enfocarlo.
    setTimeout(() => inputBusquedaProductoRef.current?.focus(), 0);
  }

  function cambiarDescripcion(productoId: number, texto: string) {
    setCarrito((actual) => actual.map((l) => (l.productoId === productoId ? { ...l, descripcion: texto } : l)));
  }

  function cambiarCantidad(productoId: number, delta: number) {
    setCarrito((actual) =>
      actual
        .map((l) => {
          if (l.productoId !== productoId) return l;
          const nueva = l.cantidad + delta;
          return { ...l, cantidad: Math.min(nueva, l.stockDisponible) };
        })
        .filter((l) => l.cantidad > 0),
    );
  }

  /**
   * Cantidad escrita por teclado en una línea del carrito. Solo acepta
   * números enteros (cualquier otro carácter se descarta), nunca 0, y no
   * pasa del stock disponible (si el producto lleva control de stock).
   */
  function escribirCantidad(linea: LineaCarrito, textoTipeado: string) {
    const soloDigitos = textoTipeado.replace(/\D/g, '').slice(0, 6).replace(/^0+(?=\d)/, '');
    const numero = Number(soloDigitos);
    setAvisoCantidad(null);

    if (soloDigitos === '') {
      // Está borrando para escribir otra: se deja vacío un momento, sin tocar la venta.
      setBorradoCantidad({ productoId: linea.productoId, texto: '' });
      return;
    }
    if (numero === 0) {
      setBorradoCantidad({ productoId: linea.productoId, texto: '' });
      setAvisoCantidad({ productoId: linea.productoId, texto: 'La cantidad mínima es 1.' });
      return;
    }

    const cantidad = Math.min(numero, linea.stockDisponible);
    if (cantidad < numero) {
      setAvisoCantidad({
        productoId: linea.productoId,
        texto: `Solo hay ${linea.stockDisponible} en stock.`,
      });
    }
    setBorradoCantidad({ productoId: linea.productoId, texto: String(cantidad) });
    setCarrito((actual) =>
      actual.map((l) => (l.productoId === linea.productoId ? { ...l, cantidad } : l)),
    );
  }

  function terminarEscrituraCantidad() {
    setBorradoCantidad(null);
    setAvisoCantidad(null);
  }

  /** Solo tiene efecto si el switch "Precio editable al vender" está activo. */
  function cambiarPrecioLinea(productoId: number, nuevoPrecioTexto: string) {
    const nuevoPrecio = nuevoPrecioTexto.trim() === '' ? 0 : Number(nuevoPrecioTexto);
    if (!Number.isFinite(nuevoPrecio) || nuevoPrecio < 0) return;
    setCarrito((actual) =>
      actual.map((l) => (l.productoId === productoId ? { ...l, precioVenta: nuevoPrecio } : l)),
    );
  }

  /** «Editar subtotal»: abre el pop-up con el subtotal actual de la línea. Solo con «Precio editable al vender». */
  function abrirEdicionSubtotal(linea: LineaCarrito) {
    setEditandoSubtotal({ productoId: linea.productoId, texto: redondear(linea.precioVenta * linea.cantidad).toFixed(2) });
  }

  /** Aplica el subtotal escrito: recalcula el precio por unidad de ESA línea (el del producto no cambia). */
  function aplicarSubtotal() {
    if (!editandoSubtotal || editandoSubtotal.texto.trim() === '') return;
    const linea = carrito.find((l) => l.productoId === editandoSubtotal.productoId);
    if (!linea) return;
    const precio = calcularPrecioDesdeSubtotal(Number(editandoSubtotal.texto), linea.cantidad);
    if (precio === null) return;
    setCarrito((actual) => actual.map((l) => (l.productoId === linea.productoId ? { ...l, precioVenta: precio } : l)));
    setEditandoSubtotal(null);
  }

  function quitarProducto(productoId: number) {
    setCarrito((actual) => actual.filter((l) => l.productoId !== productoId));
  }

  function elegirMetodoPago(valor: MetodoPago) {
    setMetodoPago(valor);
    // Corrige el bug de que un cliente elegido para una venta al fiado
    // quedara "pegado" si luego se cambia a efectivo/yape/etc: al salir
    // de fiado, se limpia la selección para no arrastrarla.
    // (Con factura el cliente se queda: es obligatorio sea cual sea el método de pago.)
    if (valor !== 'fiado' && tipoEfectivo !== 'factura') {
      setClienteSeleccionado(null);
    }
  }

  /** Nombre escrito a mano (cliente sin registrar): solo cuenta si no hay cliente elegido y la venta no es al fiado. */
  function nombreClienteLibre(): string {
    if (clienteSeleccionado || metodoPago === 'fiado') return '';
    return busquedaCliente.trim();
  }

  function seleccionarCliente(cliente: Cliente) {
    setClienteSeleccionado(cliente);
    setBusquedaCliente('');
    setClientesEncontrados([]);
  }

  /**
   * Punto 8 (notificación de stock bajo), rediseñado: en vez de avisar
   * una vez al día desde Inicio, se dispara justo aquí, por cada
   * producto cuya venta lo dejó por debajo de su stock mínimo — que es
   * exactamente cuándo "siempre que el stock disponible sea menor al
   * mínimo y se haga una venta que lo disminuya" pide que se avise. Si
   * el producto queda en 0, esa es la última alerta para él: como no
   * se puede vender con stock 0, no vuelve a dispararse sola hasta que
   * haya una próxima venta real de ese producto (tras reponer stock).
   */
  function notificarStockBajoTrasVenta(lineasVendidas: LineaCarrito[]) {
    if (!contenedor || !esPremium || !notificarStockBajo || !soportaNotificaciones()) return;
    const nombreTienda = obtenerNombreTienda(contenedor.configuracion.obtenerValor(CLAVE_NOMBRE_TIENDA));
    for (const linea of lineasVendidas) {
      let producto: Producto;
      try {
        producto = contenedor.productos.obtenerPorId(linea.productoId);
      } catch {
        continue;
      }
      if (!producto.controlaStock) continue;
      if (producto.stockActual === 0) {
        mostrarNotificacionSinStock(producto.nombre, nombreTienda);
      } else if (producto.stockActual < producto.stockMinimo) {
        mostrarNotificacionStockBajoProducto(producto.nombre, producto.stockActual, nombreTienda);
      }
    }
  }

  /** Después de cobrar: WhatsApp con el teléfono del cliente; si no tiene (o es cliente eventual), lo pide en el momento. */
  function enviarWhatsAppGuardada() {
    if (!ventaGuardada) return;
    setMensajeTicket(null);
    if (ventaGuardada.telefonoWhatsapp) {
      abrirWhatsAppDeVenta(ventaGuardada, ventaGuardada.telefonoWhatsapp);
      return;
    }
    setPidiendoCelular(true);
  }

  async function enviarWhatsAppConCelular() {
    if (!contenedor || !ventaGuardada) return;
    const telefono = telefonoCelular.trim();
    if (!telefono) {
      setMensajeTicket('Ingresa un número de celular para enviar la venta por WhatsApp.');
      return;
    }
    setMensajeTicket(null);
    // Se guarda en la venta para no volver a pedirlo al reenviarla desde Pedidos.
    contenedor.ventas.actualizarTelefonoWhatsapp(ventaGuardada.id, telefono);
    await contenedor.persistir();
    setPidiendoCelular(false);
    abrirWhatsAppDeVenta({ ...ventaGuardada, telefonoWhatsapp: telefono }, telefono);
  }

  async function guardarTicketGuardada() {
    if (!contenedor || !ventaGuardada || !esPremium) return;
    setMensajeTicket(null);
    setAccionOcupada('ticket');
    try {
      await guardarTicketComoImagen(contenedor, ventaGuardada.id);
    } catch {
      setMensajeTicket('No se pudo generar la imagen del ticket.');
    } finally {
      setAccionOcupada(null);
    }
  }

  async function imprimirGuardada() {
    if (!contenedor || !ventaGuardada) return;
    setMensajeTicket(null);
    setAccionOcupada('imprimir');
    try {
      await imprimirComprobanteDeVenta(contenedor, ventaGuardada.id);
    } catch {
      setMensajeTicket('No está correctamente configurada la impresora.');
    } finally {
      setAccionOcupada(null);
    }
  }

  function abrirWhatsAppDeVenta(venta: Venta, telefono: string) {
    if (!contenedor) return;
    const lineasMensaje = contenedor.ventas.obtenerLineasParaMensaje(venta.id);
    const nombreTiendaActual = obtenerNombreTienda(contenedor.configuracion.obtenerValor(CLAVE_NOMBRE_TIENDA));
    const mensaje = construirMensajeVenta(nombreTiendaActual, venta, lineasMensaje, simboloMoneda);
    const enlace = construirEnlaceWhatsApp(telefono, mensaje, prefijoPais);
    window.open(enlace, '_blank');
  }

  async function confirmarVenta() {
    if (!contenedor || !calculoValido) return;
    if (metodoPago === 'fiado' && !clienteSeleccionado) {
      setMensajeError('Elige un cliente para la venta al fiado.');
      return;
    }
    if (errorFactura) {
      setMensajeError(errorFactura);
      return;
    }

    setGuardando(true);
    setMensajeError(null);
    try {
      const venta = contenedor.ventas.registrarVenta({
        lineas: carrito.map((l) => ({
          productoId: l.productoId,
          cantidad: l.cantidad,
          precioUnitario: precioEditable ? l.precioVenta : undefined,
          descripcion: descripcionActiva ? l.descripcion : null,
        })),
        metodoPago,
        clienteId: clienteSeleccionado?.id ?? null,
        clienteNombreLibre: nombreClienteLibre() || null,
        telefonoWhatsapp: clienteSeleccionado?.telefono ?? null,
        tipoComprobante: tipoEfectivo,
        serieId: serieElegida?.id ?? null,
      });
      await contenedor.persistir();
      notificarStockBajoTrasVenta(carrito);
      setTotalGuardado(venta.total);
      setVentaGuardadaId(venta.id);
      setVentaGuardada(venta);
      setMetodoPagoGuardado(venta.metodoPago);
      setComprobanteGuardado(`${ETIQUETA_COMPROBANTE[venta.tipoComprobante]} ${venta.comprobante}`);
      setEtapa('guardada');
    } catch (e) {
      setMensajeError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo guardar la venta.');
    } finally {
      setGuardando(false);
    }
  }

  async function adjuntarFotoComprobante(origen: 'camara' | 'galeria') {
    if (!contenedor || !ventaGuardadaId) return;
    setMensajeFotoPago(null);
    setCapturandoFoto(true);
    try {
      const ruta = await capturarFotoComprobantePago(origen);
      if (!ruta) return; // el bodeguero canceló — no es un error
      contenedor.ventas.guardarComprobantePago(ventaGuardadaId, ruta);
      await contenedor.persistir();
      setFotoComprobanteGuardada(true);
    } catch (e) {
      setMensajeFotoPago(e instanceof Error ? e.message : 'No se pudo adjuntar la foto.');
    } finally {
      setCapturandoFoto(false);
    }
  }

  function empezarNuevaVenta() {
    setCarrito([]);
    setClienteSeleccionado(null);
    setBusquedaCliente('');
    setMetodoPago('efectivo');
    setTelefonoCelular('');
    setPidiendoCelular(false);
    setMensajeTicket(null);
    setVentaGuardadaId(null);
    setVentaGuardada(null);
    setFotoComprobanteGuardada(false);
    setMensajeFotoPago(null);
    setMensajeError(null);
    setEtapa('armando');
    if (contenedor) {
      setProductos(contenedor.productos.listarActivosParaVenta());
      // Las series pudieron cambiar (el siguiente número avanzó): se vuelven a leer y vuelve el comprobante por defecto.
      const activas = contenedor.series.listarActivas();
      setSeriesActivas(activas);
      setTipoComprobante(comprobantePorDefecto(comprobantesDisponibles(esPremium, activas)));
      setComprobanteGuardado('');
    }
  }

  if (cargando) {
    return <p className="p-5 text-sm text-tinta-suave">Cargando…</p>;
  }
  if (error) {
    return <p className="p-5 text-sm text-alerta">No se pudo abrir la base de datos: {error.message}</p>;
  }

  if (limiteAlcanzado) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-app flex-col items-center justify-center gap-4 px-5 text-center">
        <p className="text-5xl">🔒</p>
        <h1 className="text-lg font-extrabold text-tinta">Límite del Plan Gratis alcanzado</h1>
        <p className="text-sm text-tinta-suave">
          Ya registraste {ventasUsadas} de {LIMITE_VENTAS_PLAN_GRATIS} pedidos disponibles en el
          Plan Gratis. Contacta a soporte para activar Premium y seguir vendiendo.
        </p>
        <Link
          href="/"
          className="mt-2 flex h-12 items-center justify-center rounded-full border border-linea px-6 text-sm font-semibold text-tinta"
        >
          Volver a inicio
        </Link>
      </div>
    );
  }

  if (etapa === 'guardada') {
    return (
      <div className="mx-auto flex min-h-dvh max-w-app flex-col items-center justify-center gap-6 px-5 text-center">
        <div className="animar-exito flex h-16 w-16 items-center justify-center rounded-full bg-ok/10 text-3xl text-ok">
          ✓
        </div>
        <div>
          <p className="text-sm text-tinta-suave">Venta guardada</p>
          <p className="text-4xl font-extrabold text-tinta">{formatearMonto(totalGuardado, simboloMoneda)}</p>
          {comprobanteGuardado && <p className="mt-1 text-sm font-semibold text-tinta/70">{comprobanteGuardado}</p>}
        </div>
        {mensajeTicket && <p className="text-sm text-alerta">{mensajeTicket}</p>}

        {esPremium && (metodoPagoGuardado === 'yape' || metodoPagoGuardado === 'plin') && (
          <div className="w-full rounded-xl border border-linea p-4">
            <p className="text-sm font-semibold text-tinta">Foto del comprobante de pago</p>
            <p className="mt-0.5 text-xs text-tinta-suave">Opcional — queda guardada junto a esta venta.</p>
            {fotoComprobanteGuardada ? (
              <p className="mt-2 text-sm text-bodega-oscuro">✓ Foto guardada.</p>
            ) : (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => adjuntarFotoComprobante('camara')}
                  disabled={capturandoFoto}
                  className="h-11 flex-1 rounded-xl border border-bodega text-sm font-semibold text-bodega-oscuro disabled:opacity-40"
                >
                  📷 Tomar foto
                </button>
                <button
                  onClick={() => adjuntarFotoComprobante('galeria')}
                  disabled={capturandoFoto}
                  className="h-11 flex-1 rounded-xl border border-bodega text-sm font-semibold text-bodega-oscuro disabled:opacity-40"
                >
                  🖼️ Elegir de galería
                </button>
              </div>
            )}
            {mensajeFotoPago && <p className="mt-2 text-sm text-alerta">{mensajeFotoPago}</p>}
          </div>
        )}

        <div className="w-full">
          <div className="grid auto-cols-fr grid-flow-col gap-2">
            <button
              type="button"
              onClick={enviarWhatsAppGuardada}
              className="flex h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 border-[#25D366] bg-white text-xs font-semibold text-tinta"
            >
              <IconoWhatsApp tamano={24} className="text-[#25D366]" />
              WhatsApp
            </button>
            <button
              type="button"
              onClick={guardarTicketGuardada}
              disabled={!esPremium || accionOcupada !== null}
              className="flex h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 border-bodega text-xs font-semibold text-bodega disabled:opacity-40"
            >
              <IconoTicket tamano={24} />
              {accionOcupada === 'ticket' ? 'Generando…' : 'Ticket'}
            </button>
            {IMPRESION_BLUETOOTH_DISPONIBLE && impresoraActiva && esPremium && (
              <button
                type="button"
                onClick={imprimirGuardada}
                disabled={accionOcupada !== null}
                className="flex h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 border-bodega text-xs font-semibold text-bodega disabled:opacity-40"
              >
                <IconoImpresora tamano={24} />
                {accionOcupada === 'imprimir' ? 'Imprimiendo…' : 'Imprimir'}
              </button>
            )}
          </div>
          {!esPremium && <p className="mt-1.5 text-xs text-tinta-suave">Ticket e imprimir son <span className="font-semibold text-acento-oscuro">Premium</span></p>}
          {pidiendoCelular && (
            <div className="mt-3 space-y-2 rounded-xl border border-linea p-3 text-left">
              <p className="text-sm font-bold text-tinta-suave">Número de celular</p>
              <div className="flex gap-2">
                <span className="flex h-11 shrink-0 items-center rounded-lg border border-linea bg-papel px-3 text-sm text-tinta-suave">
                  +{prefijoPais}
                </span>
                <input
                  autoFocus
                  value={telefonoCelular}
                  onChange={(e) => setTelefonoCelular(e.target.value)}
                  placeholder="Celular para WhatsApp"
                  inputMode="numeric"
                  className="h-11 flex-1 rounded-lg border border-linea px-3 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={enviarWhatsAppConCelular}
                  className="h-11 flex-1 rounded-full bg-bodega text-sm font-semibold text-white"
                >
                  Enviar
                </button>
                <button
                  type="button"
                  onClick={() => setPidiendoCelular(false)}
                  className="h-11 flex-1 rounded-full border border-linea text-sm font-semibold text-tinta"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex w-full flex-col gap-3">
          <button
            onClick={empezarNuevaVenta}
            className="h-14 rounded-full bg-bodega text-base font-semibold text-white active:bg-bodega-oscuro"
          >
            Nueva venta
          </button>
          <Link
            href="/"
            className="flex h-14 items-center justify-center rounded-full border border-linea text-base font-semibold text-tinta"
          >
            Volver a inicio
          </Link>
        </div>
      </div>
    );
  }

  if (etapa === 'revisando' && calculoValido) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-8 pt-6">
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Confirmar venta</h1>

        <ul className="mt-6 divide-y divide-linea border-y border-linea">
          {carrito.map((linea) => (
            <li key={linea.productoId} className="py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-tinta/80">
                  {linea.cantidad} × {linea.nombre}
                </span>
                <span className="font-semibold text-tinta">
                  {formatearMonto(linea.precioVenta * linea.cantidad, simboloMoneda)}
                </span>
              </div>
              {descripcionActiva && linea.descripcion.trim() !== '' && (
                <p className="mt-0.5 break-words text-xs text-tinta-suave">{linea.descripcion.trim()}</p>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-base font-semibold text-tinta">Total</span>
          <span className="text-2xl font-extrabold text-tinta">
            {formatearMonto(calculoValido.total, simboloMoneda)}
          </span>
        </div>

        <p className="mt-2 text-sm text-tinta-suave">
          Pago: {METODOS_PAGO.find((m) => m.valor === metodoPago)?.etiqueta} ·{' '}
          {clienteSeleccionado ? clienteSeleccionado.nombre : nombreClienteLibre().toLocaleUpperCase('es') || 'Cliente eventual'}
        </p>
        {hayComprobantes && (
          <p className="mt-1 text-sm text-tinta-suave">
            Comprobante: {ETIQUETA_COMPROBANTE[tipoEfectivo]}
            {numeroPrevisto ? ` ${numeroPrevisto}` : ''}
          </p>
        )}

        {mensajeError && <p className="mt-3 text-sm text-alerta">{mensajeError}</p>}

        <div className="mt-auto flex flex-col gap-3 pt-8">
          <button
            onClick={confirmarVenta}
            disabled={guardando}
            className="h-14 rounded-full bg-bodega text-base font-semibold text-white active:bg-bodega-oscuro disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : 'Confirmar venta'}
          </button>
          <button
            onClick={() => {
              setMensajeError(null);
              setEtapa('armando');
            }}
            className="h-12 text-sm font-semibold text-tinta/70"
          >
            Editar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-[calc(10rem+var(--area-segura-abajo))] pt-6">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-xl text-tinta-suave" aria-label="Volver a inicio">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Nueva venta</h1>
      </header>

      {!limiteAlcanzado && ventasUsadas >= LIMITE_VENTAS_PLAN_GRATIS - 20 && (
        <p className="mt-3 rounded-lg bg-acento/10 px-3 py-2 text-xs text-tinta/70">
          Te quedan {LIMITE_VENTAS_PLAN_GRATIS - ventasUsadas} pedidos en tu Plan Gratis.
        </p>
      )}

      {/* Buscador de productos */}
      <div className="relative mt-5">
        <input
          ref={inputBusquedaProductoRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar producto…"
          className="h-12 w-full rounded-xl border border-linea bg-white px-4 text-base outline-none focus:border-bodega"
        />
        {resultadosBusqueda.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl border border-linea bg-white shadow-sm">
            {resultadosBusqueda.map((producto) => (
              <li key={producto.id}>
                <button
                  onClick={() => agregarProducto(producto)}
                  disabled={producto.controlaStock && producto.stockActual <= 0}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm disabled:opacity-40"
                >
                  <span>{producto.nombre}</span>
                  <span className="text-tinta-suave">
                    {producto.controlaStock && producto.stockActual <= 0
                      ? 'Sin stock'
                      : formatearMonto(producto.precioVenta, simboloMoneda)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Carrito */}
      <section className="mt-6">
        {carrito.length === 0 ? (
          <p className="border-y border-linea py-6 text-center text-sm text-tinta-suave">
            Busca un producto para empezar
          </p>
        ) : (
          <ul className="divide-y divide-linea border-y border-linea">
            {carrito.map((linea) => {
              const editando = lineaEditandoId === linea.productoId;
              return (
                <li key={linea.productoId} className="py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-bold text-tinta">{linea.nombre}</p>
                      <p className="text-xs text-tinta-suave">{formatearMonto(linea.precioVenta, simboloMoneda)} c/u</p>
                    </div>
                    <button
                      onClick={() => quitarProducto(linea.productoId)}
                      className="-mr-2.5 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center text-xl text-tinta-suave"
                      aria-label={`Quitar ${linea.nombre}`}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => cambiarCantidad(linea.productoId, -1)}
                        className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-bodega bg-white text-2xl text-bodega"
                        aria-label="Quitar uno"
                      >
                        −
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        enterKeyHint="done"
                        value={
                          borradoCantidad?.productoId === linea.productoId
                            ? borradoCantidad.texto
                            : String(linea.cantidad)
                        }
                        onChange={(e) => escribirCantidad(linea, e.target.value)}
                        onFocus={(e) => e.target.select()}
                        onBlur={terminarEscrituraCantidad}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                        aria-label={`Cantidad de ${linea.nombre}`}
                        className="h-11 w-14 rounded-lg border border-linea text-center text-xl font-bold text-tinta outline-none focus:border-bodega"
                      />
                      <button
                        onClick={() => cambiarCantidad(linea.productoId, 1)}
                        disabled={linea.cantidad >= linea.stockDisponible}
                        className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-bodega bg-white text-2xl text-bodega disabled:opacity-30"
                        aria-label="Agregar uno"
                      >
                        +
                      </button>
                    </div>
                    {precioEditable ? (
                      <button
                        type="button"
                        onClick={() => abrirEdicionSubtotal(linea)}
                        aria-label={`Editar subtotal de ${linea.nombre}`}
                        className="flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-dashed border-bodega bg-white px-3.5 text-xl font-extrabold text-tinta"
                      >
                        {formatearMonto(linea.precioVenta * linea.cantidad, simboloMoneda)}
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-bodega" aria-hidden="true">
                          <path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4" />
                        </svg>
                      </button>
                    ) : (
                      <span className="text-xl font-extrabold text-tinta">
                        {formatearMonto(linea.precioVenta * linea.cantidad, simboloMoneda)}
                      </span>
                    )}
                  </div>
                  {precioEditable && <p className="mt-1.5 text-right text-xs text-tinta-suave">Toca el monto para cambiarlo</p>}
                  {avisoCantidad?.productoId === linea.productoId && (
                    <p className="mt-1 text-xs text-alerta">{avisoCantidad.texto}</p>
                  )}
                  {!editando && linea.descripcion.trim() !== '' && (
                    <p className="mt-1.5 text-xs italic text-tinta-suave">{linea.descripcion}</p>
                  )}
                  {(precioEditable || descripcionActiva) && (
                    <button
                      type="button"
                      onClick={() => setLineaEditandoId(editando ? null : linea.productoId)}
                      aria-expanded={editando}
                      className="mt-2 text-xs font-semibold text-bodega"
                    >
                      {editando
                        ? 'Ocultar'
                        : precioEditable && descripcionActiva
                          ? 'Editar precio o nota'
                          : precioEditable
                            ? 'Editar precio'
                            : 'Agregar nota'}
                    </button>
                  )}
                  {editando && (
                    <div className="mt-2 space-y-2">
                      {precioEditable && (
                        <label className="flex items-center gap-2 text-sm text-tinta-suave">
                          {simboloMoneda}
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.1"
                            value={linea.precioVenta}
                            onChange={(e) => cambiarPrecioLinea(linea.productoId, limpiarNumeroEscrito(e.target.value))}
                            aria-label={`Precio de ${linea.nombre}`}
                            className="h-10 w-28 rounded-lg border border-linea px-3 text-sm text-tinta outline-none focus:border-bodega"
                          />
                          c/u
                        </label>
                      )}
                      {descripcionActiva && (
                        <input
                          type="text"
                          value={linea.descripcion}
                          maxLength={LIMITE_DESCRIPCION_LINEA}
                          onChange={(e) => cambiarDescripcion(linea.productoId, e.target.value)}
                          placeholder="Descripción (opcional)"
                          aria-label={`Descripción de ${linea.nombre}`}
                          className="h-10 w-full rounded-lg border border-linea px-3 text-sm text-tinta outline-none placeholder:text-tinta/40 focus:border-bodega"
                        />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {errorCalculo && <p className="mt-2 text-sm text-alerta">{errorCalculo}</p>}
      </section>

      {/* Comprobante: solo aparece si hay series (Premium). Sin series, todo sale como nota de venta. */}
      {hayComprobantes && (
        <section className="mt-6">
          <p className="text-sm font-bold text-tinta-suave">Comprobante</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {comprobantesPosibles.map((t) => (
              <button
                key={t}
                onClick={() => setTipoComprobante(t)}
                className={`h-9 rounded-full border px-4 text-sm font-medium ${
                  tipoEfectivo === t ? 'border-bodega bg-bodega text-white' : 'border-linea text-tinta/70'
                }`}
              >
                {ETIQUETA_COMPROBANTE[t]}
              </button>
            ))}
          </div>
          {numeroPrevisto && <p className="mt-2 text-xs text-tinta-suave">Saldrá como {numeroPrevisto}</p>}
          {tipoEfectivo === 'factura' && (
            <p className="mt-1 text-xs text-tinta-suave">La factura necesita un cliente registrado con RUC (11 dígitos).</p>
          )}
          {errorFactura && <p className="mt-1 text-sm text-alerta">{errorFactura}</p>}
        </section>
      )}

      {/* Método de pago */}
      <section className="mt-6">
        <p className="text-sm font-bold text-tinta-suave">Método de pago</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {METODOS_PAGO.map((m) => (
            <button
              key={m.valor}
              onClick={() => elegirMetodoPago(m.valor)}
              className={`h-9 rounded-full border px-4 text-sm font-medium ${
                metodoPago === m.valor
                  ? 'border-bodega bg-bodega text-white'
                  : 'border-linea text-tinta/70'
              }`}
            >
              {m.etiqueta}
            </button>
          ))}
        </div>
      </section>

      {/* Cliente: opcional siempre, obligatorio solo si es fiado */}
      <section className="mt-4">
        <p className="text-sm font-bold text-tinta-suave">
          Cliente{' '}
          {tipoEfectivo === 'factura'
            ? '(obligatorio para factura, con RUC)'
            : metodoPago === 'fiado'
              ? '(obligatorio para fiado)'
              : '(opcional)'}
        </p>

        {clienteSeleccionado ? (
          <div className="mt-2 flex items-center justify-between rounded-xl border border-linea bg-white px-4 py-3">
            <div>
              <p className="text-sm text-tinta">{clienteSeleccionado.nombre}</p>
              <p className="text-xs text-tinta-suave">{clienteSeleccionado.documento}</p>
            </div>
            <button
              onClick={() => setClienteSeleccionado(null)}
              className="text-tinta-suave"
              aria-label="Quitar cliente"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="relative mt-2">
            <input
              value={busquedaCliente}
              onChange={(e) => setBusquedaCliente(mayusculasAlEscribir(e.target.value).slice(0, 60))}
              placeholder={metodoPago === 'fiado' || tipoEfectivo === 'factura' ? 'Buscar por nombre o documento…' : 'Buscar o escribir el nombre del cliente…'}
              className="h-11 w-full rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
            />
            {clientesEncontrados.length > 0 && (
              <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-linea bg-white shadow-sm">
                {clientesEncontrados.map((cliente) => (
                  <li key={cliente.id}>
                    <button
                      onClick={() => seleccionarCliente(cliente)}
                      className="flex w-full flex-col items-start px-4 py-2 text-left text-sm"
                    >
                      <span>{cliente.nombre}</span>
                      <span className="text-xs text-tinta-suave">{cliente.documento}</span>
                      {tipoEfectivo === 'factura' && !esRucValido(cliente.documento) && (
                        <span className="text-xs text-alerta">Sin RUC válido: no sirve para factura</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {metodoPago === 'fiado' || tipoEfectivo === 'factura' ? (
              <p className="mt-2 text-xs text-tinta-suave">
                {tipoEfectivo === 'factura' ? 'La factura necesita un cliente registrado con RUC.' : 'El fiado necesita un cliente registrado.'}{' '}
                ¿Cliente nuevo? Créalo en{' '}
                <Link href="/mas/clientes" className="underline">
                  Más → Clientes
                </Link>
                .
              </p>
            ) : (
              <p className="mt-2 text-xs text-tinta-suave">
                {nombreClienteLibre() ? (
                  <>
                    Saldrá a nombre de <span className="font-medium text-tinta">{nombreClienteLibre()}</span> (sin
                    registrarlo). Guárdalo en{' '}
                    <Link href="/mas/clientes" className="underline">
                      Más → Clientes
                    </Link>
                    .
                  </>
                ) : (
                  <>
                    Sin cliente: <span className="font-medium text-tinta">Cliente eventual</span>.
                  </>
                )}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Acción principal */}
      {calculoValido && (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-app border-t border-linea bg-papel px-5 pt-2.5 pb-[calc(1.25rem+var(--area-segura-abajo))]">
          <p className="mb-2 text-center text-[13px] text-tinta-suave">
            {carrito.length} {carrito.length === 1 ? 'producto' : 'productos'} · {textoCantidad(totalUnidades)}{' '}
            {totalUnidades === 1 ? 'unidad' : 'unidades'}
          </p>
          <button
            onClick={() => {
              setMensajeError(null);
              setEtapa('revisando');
            }}
            disabled={Boolean(errorFactura)}
            className="flex h-[60px] w-full items-center justify-center gap-3 rounded-full bg-bodega text-white active:bg-bodega-oscuro disabled:opacity-60"
          >
            <span className="text-lg font-bold">Revisar y cobrar</span>
            <span className="text-[22px] font-extrabold">{formatearMonto(calculoValido.total, simboloMoneda)}</span>
          </button>
        </div>
      )}

      {editandoSubtotal && lineaSubtotal && (
        <HojaOpciones
          titulo="Editar subtotal"
          subtitulo={`${lineaSubtotal.nombre} · ${textoCantidad(lineaSubtotal.cantidad)} ${lineaSubtotal.cantidad === 1 ? 'unidad' : 'unidades'}`}
          onCerrar={() => setEditandoSubtotal(null)}
        >
          <div className="space-y-3">
            <div>
              <label htmlFor="subtotal-linea" className="mb-1.5 block text-xs font-medium text-tinta-suave">
                Subtotal de la línea
              </label>
              <div className="flex h-16 items-center gap-2 rounded-xl border-2 border-bodega px-4 text-3xl font-extrabold text-tinta">
                <span>{simboloMoneda}</span>
                <input
                  id="subtotal-linea"
                  autoFocus
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="done"
                  value={editandoSubtotal.texto}
                  onChange={(e) => setEditandoSubtotal({ ...editandoSubtotal, texto: limpiarNumeroEscrito(e.target.value) })}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') aplicarSubtotal();
                  }}
                  className="w-full bg-transparent outline-none"
                />
              </div>
            </div>
            <div className="rounded-xl bg-bodega-claro px-3.5 py-3 text-sm leading-snug text-tinta">
              {precioDelSubtotal === null ? (
                'Escribe cuánto quieres cobrar por este producto.'
              ) : (
                <>
                  Precio por unidad en esta venta:{' '}
                  <b>
                    {simboloMoneda} {textoPrecioUnitario(precioDelSubtotal)}
                  </b>
                  {redondear(precioDelSubtotal) !== precioDelSubtotal && ` (se verá ${formatearMonto(precioDelSubtotal, simboloMoneda)})`}. El
                  precio de {lineaSubtotal.nombre} en tu lista <b>no cambia</b>.
                </>
              )}
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setEditandoSubtotal(null)}
                className="h-[54px] flex-1 rounded-full border-[1.5px] border-bodega bg-white text-[17px] font-bold text-bodega"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={aplicarSubtotal}
                disabled={precioDelSubtotal === null}
                className="h-[54px] flex-[1.4] rounded-full bg-bodega text-[17px] font-bold text-white disabled:opacity-50"
              >
                Aplicar
              </button>
            </div>
          </div>
        </HojaOpciones>
      )}
    </div>
  );
}
