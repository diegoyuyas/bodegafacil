'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { CLAVE_MONEDA, formatearMonto, obtenerSimboloMoneda } from '@/core/moneda';
import {
  CLAVE_MODO_VENTA_VOZ,
  CLAVE_NOMBRE_TIENDA,
  CLAVE_NOTIFICAR_STOCK_BAJO,
  estaActivado,
  modoVentaVozDisponible,
  obtenerNombreTienda,
} from '@/core/configuracion';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import { partirAlias, normalizarParaBusqueda } from '@/core/texto';
import type { Cliente, MetodoPago, Producto } from '@/core/tipos';
import {
  indexarProductos,
  interpretarFrase,
  interpretarRespuestaSiNo,
  type AccionVoz,
  type CandidatoProducto,
} from '@/core/venta-voz';
import {
  crearReconocedorVoz,
  type EstadoVoz,
  type ReconocedorVoz,
} from '@/infraestructura/voz/reconocimiento-voz';
import {
  mostrarNotificacionSinStock,
  mostrarNotificacionStockBajoProducto,
  soportaNotificaciones,
} from '@/infraestructura/notificaciones/notificaciones-navegador';

/**
 * Nueva Venta por Voz (Premium).
 *
 * Se abre desde Inicio y el micrófono empieza a escuchar solo. Se dice la
 * cantidad y luego el producto ("una hamburguesa, dos gaseosa inka cola"),
 * la venta se va armando en pantalla como un ticket, y al decir
 * "guardar venta" se pide confirmar antes de registrarla. Todo lo que se
 * puede decir también se puede tocar, así la pantalla sirve aunque la voz falle.
 *
 * La venta se registra con el mismo `registrarVenta` de Nueva Venta (misma
 * validación de stock, fiado, caja). El precio sale siempre del producto.
 */

// ------------------------------------------------------------
// Estado de la venta (carrito + dudas + forma de pago)
// ------------------------------------------------------------

interface Linea {
  productoId: number;
  nombre: string;
  cantidad: number;
  precio: number;
  /** Infinity si el producto no controla stock. */
  stock: number;
}

interface Pendiente {
  id: number;
  tipo: 'duda' | 'no_encontrado';
  cantidad: number;
  texto: string;
  candidatos: CandidatoProducto[];
}

interface EstadoVenta {
  lineas: Linea[];
  pendientes: Pendiente[];
  metodoPago: MetodoPago;
  proximoId: number;
  aviso: { id: number; texto: string } | null;
}

type OrdenVenta =
  | { tipo: 'voz'; acciones: AccionVoz[] }
  | { tipo: 'agregar'; producto: Producto; cantidad: number }
  | { tipo: 'cambiar_cantidad'; productoId: number; delta: number }
  | { tipo: 'quitar'; productoId: number }
  | { tipo: 'resolver'; id: number; producto: Producto }
  | { tipo: 'descartar'; id: number }
  | { tipo: 'pago'; metodo: MetodoPago }
  | { tipo: 'aviso'; texto: string }
  | { tipo: 'limpiar_aviso' }
  | { tipo: 'reiniciar' };

const ESTADO_INICIAL: EstadoVenta = {
  lineas: [],
  pendientes: [],
  metodoPago: 'efectivo',
  proximoId: 1,
  aviso: null,
};

function conAviso(estado: EstadoVenta, texto: string): EstadoVenta {
  return { ...estado, aviso: { id: estado.proximoId, texto }, proximoId: estado.proximoId + 1 };
}

/** Suma `cantidad` de `producto` respetando el stock. Devuelve las líneas nuevas y un aviso si hizo falta. */
function sumarLinea(
  lineas: Linea[],
  producto: Producto,
  cantidad: number,
): { lineas: Linea[]; aviso: string | null } {
  const stock = producto.controlaStock ? producto.stockActual : Number.POSITIVE_INFINITY;
  const existente = lineas.find((l) => l.productoId === producto.id);
  const actual = existente?.cantidad ?? 0;
  if (stock <= 0) return { lineas, aviso: `${producto.nombre} no tiene stock.` };

  let nueva = actual + cantidad;
  let aviso: string | null = null;
  if (nueva > stock) {
    nueva = stock;
    aviso = `Solo hay ${stock} de ${producto.nombre} en stock.`;
  }
  if (existente) {
    return { lineas: lineas.map((l) => (l.productoId === producto.id ? { ...l, cantidad: nueva } : l)), aviso };
  }
  return {
    lineas: [
      ...lineas,
      { productoId: producto.id, nombre: producto.nombre, cantidad: nueva, precio: producto.precioVenta, stock },
    ],
    aviso,
  };
}

function reducir(estado: EstadoVenta, orden: OrdenVenta): EstadoVenta {
  switch (orden.tipo) {
    case 'voz': {
      let actual = estado;
      for (const accion of orden.acciones) {
        if (accion.tipo === 'agregar' && accion.seguro) {
          const producto = (accion.candidatos[0] as CandidatoProducto).producto;
          const r = sumarLinea(actual.lineas, producto, accion.cantidad);
          actual = { ...actual, lineas: r.lineas };
          if (r.aviso) actual = conAviso(actual, r.aviso);
        } else if (accion.tipo === 'agregar') {
          actual = {
            ...actual,
            pendientes: [
              ...actual.pendientes,
              { id: actual.proximoId, tipo: 'duda', cantidad: accion.cantidad, texto: accion.texto, candidatos: accion.candidatos },
            ],
            proximoId: actual.proximoId + 1,
          };
        } else if (accion.tipo === 'no_encontrado') {
          actual = {
            ...actual,
            pendientes: [
              ...actual.pendientes,
              { id: actual.proximoId, tipo: 'no_encontrado', cantidad: accion.cantidad, texto: accion.texto, candidatos: [] },
            ],
            proximoId: actual.proximoId + 1,
          };
        } else if (accion.tipo === 'metodo_pago') {
          actual = { ...actual, metodoPago: accion.metodo };
        } else if (accion.tipo === 'borrar_ultimo') {
          if (actual.pendientes.length > 0 && actual.lineas.length === 0) {
            actual = { ...actual, pendientes: actual.pendientes.slice(0, -1) };
          } else {
            actual = { ...actual, lineas: actual.lineas.slice(0, -1) };
          }
        }
        // guardar, cancelar y cliente los atiende la pantalla.
      }
      return actual;
    }
    case 'agregar': {
      const r = sumarLinea(estado.lineas, orden.producto, orden.cantidad);
      const siguiente = { ...estado, lineas: r.lineas };
      return r.aviso ? conAviso(siguiente, r.aviso) : siguiente;
    }
    case 'cambiar_cantidad':
      return {
        ...estado,
        lineas: estado.lineas
          .map((l) =>
            l.productoId === orden.productoId ? { ...l, cantidad: Math.min(l.cantidad + orden.delta, l.stock) } : l,
          )
          .filter((l) => l.cantidad > 0),
      };
    case 'quitar':
      return { ...estado, lineas: estado.lineas.filter((l) => l.productoId !== orden.productoId) };
    case 'resolver': {
      const pendiente = estado.pendientes.find((p) => p.id === orden.id);
      if (!pendiente) return estado;
      const r = sumarLinea(estado.lineas, orden.producto, pendiente.cantidad);
      const siguiente = { ...estado, lineas: r.lineas, pendientes: estado.pendientes.filter((p) => p.id !== orden.id) };
      return r.aviso ? conAviso(siguiente, r.aviso) : siguiente;
    }
    case 'descartar':
      return { ...estado, pendientes: estado.pendientes.filter((p) => p.id !== orden.id) };
    case 'pago':
      return { ...estado, metodoPago: orden.metodo };
    case 'aviso':
      return conAviso(estado, orden.texto);
    case 'limpiar_aviso':
      return { ...estado, aviso: null };
    case 'reiniciar':
      return { ...ESTADO_INICIAL, proximoId: estado.proximoId };
  }
}

// ------------------------------------------------------------
// Pequeños componentes
// ------------------------------------------------------------

const METODOS_PAGO: { valor: MetodoPago; etiqueta: string }[] = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'yape', etiqueta: 'Yape' },
  { valor: 'plin', etiqueta: 'Plin' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta' },
  { valor: 'fiado', etiqueta: 'Fiado' },
];

function IconoMicrofono({ tamano = 24 }: { tamano?: number }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v4" />
    </svg>
  );
}

function coincideConProducto(producto: Producto, consulta: string): boolean {
  const q = normalizarParaBusqueda(consulta);
  if (q === '') return true;
  if (normalizarParaBusqueda(producto.nombre).includes(q)) return true;
  return partirAlias(producto.alias).some((a) => normalizarParaBusqueda(a).includes(q));
}

/** Hoja a pantalla completa para elegir un producto tocando (siempre disponible aunque falle la voz). */
function SelectorProducto({
  productos,
  simbolo,
  titulo,
  consultaInicial,
  onElegir,
  onCerrar,
}: {
  productos: Producto[];
  simbolo: string;
  titulo: string;
  consultaInicial: string;
  onElegir: (producto: Producto) => void;
  onCerrar: () => void;
}) {
  const [consulta, setConsulta] = useState(consultaInicial);
  const resultados = useMemo(
    () => productos.filter((p) => coincideConProducto(p, consulta)).slice(0, 40),
    [productos, consulta],
  );
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-papel">
      <div className="mx-auto flex w-full max-w-app flex-1 flex-col overflow-hidden px-5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-bodega-oscuro">{titulo}</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="h-10 w-10 text-xl text-tinta/60">
            ✕
          </button>
        </div>
        <input
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Escribe el nombre del producto"
          autoFocus
          className="mt-3 h-12 rounded-xl border border-linea bg-white px-4 text-base outline-none focus:border-bodega"
        />
        <ul className="mt-3 flex-1 divide-y divide-linea overflow-y-auto rounded-xl border border-linea bg-white">
          {resultados.length === 0 && <li className="p-4 text-sm text-tinta/60">No hay productos con ese nombre.</li>}
          {resultados.map((p) => (
            <li key={p.id}>
              <button onClick={() => onElegir(p)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-bodega-claro">
                <span className="text-sm font-semibold text-tinta">{p.nombre}</span>
                <span className="shrink-0 text-sm text-tinta/60">{formatearMonto(p.precioVenta, simbolo)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PanelCliente({
  contenedorBuscar,
  consultaInicial,
  permitirNombreLibre,
  onElegir,
  onNombreLibre,
  onQuitar,
  onCerrar,
}: {
  contenedorBuscar: (texto: string) => Cliente[];
  consultaInicial: string;
  permitirNombreLibre: boolean;
  onElegir: (cliente: Cliente) => void;
  onNombreLibre: (nombre: string) => void;
  onQuitar: () => void;
  onCerrar: () => void;
}) {
  const [consulta, setConsulta] = useState(consultaInicial);
  const encontrados = useMemo(() => (consulta.trim() ? contenedorBuscar(consulta) : []), [consulta, contenedorBuscar]);
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-papel">
      <div className="mx-auto flex w-full max-w-app flex-1 flex-col overflow-hidden px-5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-bodega-oscuro">Cliente</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="h-10 w-10 text-xl text-tinta/60">
            ✕
          </button>
        </div>
        <input
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Nombre o documento del cliente"
          autoFocus
          className="mt-3 h-12 rounded-xl border border-linea bg-white px-4 text-base outline-none focus:border-bodega"
        />
        <ul className="mt-3 divide-y divide-linea overflow-y-auto rounded-xl border border-linea bg-white">
          {encontrados.map((c) => (
            <li key={c.id}>
              <button onClick={() => onElegir(c)} className="w-full px-4 py-3 text-left text-sm font-semibold text-tinta active:bg-bodega-claro">
                {c.nombre}
                {c.documento && <span className="ml-2 font-normal text-tinta/50">{c.documento}</span>}
              </button>
            </li>
          ))}
          {consulta.trim() !== '' && encontrados.length === 0 && (
            <li className="p-4 text-sm text-tinta/60">No hay clientes registrados con ese nombre.</li>
          )}
          {permitirNombreLibre && consulta.trim() !== '' && (
            <li>
              <button onClick={() => onNombreLibre(consulta.trim())} className="w-full px-4 py-3 text-left text-sm text-bodega-oscuro active:bg-bodega-claro">
                Usar «{consulta.trim().toLocaleUpperCase('es')}» solo como nombre (sin registrar)
              </button>
            </li>
          )}
        </ul>
        <button onClick={onQuitar} className="mt-4 h-11 text-sm font-semibold text-tinta/70">
          Sin cliente (cliente eventual)
        </button>
      </div>
    </div>
  );
}

function Hoja({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40">
      <div className="max-h-[88dvh] w-full max-w-app overflow-y-auto rounded-t-3xl bg-white px-5 pb-[calc(1.5rem+var(--area-segura-abajo))] pt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-bodega-oscuro">{titulo}</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="h-10 w-10 text-xl text-tinta/60">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Pantalla
// ------------------------------------------------------------

type Dialogo = 'guardar' | 'cancelar' | 'salir' | null;
type Intencion = 'guardar' | 'cancelar' | null;

export default function PaginaVentaPorVoz() {
  const router = useRouter();
  const { contenedor, cargando, error } = usarContenedor();

  const [simbolo, setSimbolo] = useState(obtenerSimboloMoneda(null));
  const [acceso, setAcceso] = useState<'cargando' | 'permitido' | 'no_activo'>('cargando');
  const [productos, setProductos] = useState<Producto[]>([]);
  const [venta, despachar] = useReducer(reducir, ESTADO_INICIAL);

  const [estadoVoz, setEstadoVoz] = useState<EstadoVoz>('iniciando');
  const [detalleVoz, setDetalleVoz] = useState<string | null>(null);
  const [textoParcial, setTextoParcial] = useState('');
  const [hablando, setHablando] = useState(false);
  const [ultimaFrase, setUltimaFrase] = useState('');

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [nombreLibre, setNombreLibre] = useState('');
  const [panelCliente, setPanelCliente] = useState<{ consulta: string } | null>(null);
  const [selector, setSelector] = useState<{ pendienteId: number | null; consulta: string } | null>(null);
  const [ayudaAbierta, setAyudaAbierta] = useState(false);

  const [intencion, setIntencion] = useState<Intencion>(null);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [totalGuardado, setTotalGuardado] = useState<number | null>(null);

  const indice = useMemo(() => indexarProductos(productos), [productos]);
  const total = useMemo(() => venta.lineas.reduce((suma, l) => suma + l.precio * l.cantidad, 0), [venta.lineas]);

  // Referencias a lo último que se pintó: el micrófono llama desde fuera de React y necesita ver siempre lo actual.
  const reconocedorRef = useRef<ReconocedorVoz | null>(null);
  const indiceRef = useRef(indice);
  const dialogoRef = useRef<Dialogo>(dialogo);
  const procesarFraseRef = useRef<(texto: string) => void>(() => {});
  indiceRef.current = indice;
  dialogoRef.current = dialogo;

  // --- Carga inicial -------------------------------------------------------

  function recargarProductos() {
    if (contenedor) setProductos(contenedor.productos.listarActivosParaVenta());
  }

  useEffect(() => {
    if (!contenedor) return;
    setSimbolo(obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)));
    const premium = contenedor.plan.obtenerEstado().tipo === 'premium';
    const disponible = modoVentaVozDisponible(contenedor.configuracion.obtenerValor(CLAVE_MODO_VENTA_VOZ), premium);
    setAcceso(disponible ? 'permitido' : 'no_activo');
    setProductos(contenedor.productos.listarActivosParaVenta());
  }, [contenedor]);

  // --- Micrófono: arranca solo al abrir la pantalla ------------------------

  useEffect(() => {
    if (acceso !== 'permitido') return;
    const reconocedor = crearReconocedorVoz({
      idioma: 'es-PE',
      segundosInactividad: 90,
      alTextoParcial: (texto) => {
        setTextoParcial(texto);
        // Para que "guardar venta" / "sí" respondan al instante, sin esperar el silencio.
        const normalizado = normalizarParaBusqueda(texto);
        const clave = dialogoRef.current ? /\b(si|no|confirmar|seguir|cancelar|guardar)\b/ : /\b(guardar|guarda|cancelar|cancela)\b/;
        if (clave.test(normalizado)) void reconocedorRef.current?.cerrarFraseAhora();
      },
      alFrase: (texto) => procesarFraseRef.current(texto),
      alHablar: setHablando,
      alEstado: (estado, detalle) => {
        setEstadoVoz(estado);
        setDetalleVoz(detalle ?? null);
        if (estado !== 'escuchando') {
          setTextoParcial('');
          setHablando(false);
        }
      },
    });
    reconocedorRef.current = reconocedor;
    void reconocedor.iniciar();
    return () => {
      reconocedorRef.current = null;
      void reconocedor.destruir();
    };
  }, [acceso]);

  // --- Qué hacer con cada frase -------------------------------------------

  function procesarFrase(texto: string) {
    setUltimaFrase(texto);

    // Con una pregunta en pantalla solo se entiende "sí" o "no".
    if (dialogoRef.current) {
      const respuesta = interpretarRespuestaSiNo(texto);
      if (respuesta === 'si') confirmarDialogoRef.current();
      else if (respuesta === 'no') setDialogo(null);
      return;
    }

    const acciones = interpretarFrase(texto, indiceRef.current);
    if (acciones.length === 0) return;
    despachar({ tipo: 'voz', acciones });

    for (const accion of acciones) {
      if (accion.tipo === 'guardar') setIntencion('guardar');
      else if (accion.tipo === 'cancelar') setIntencion('cancelar');
      else if (accion.tipo === 'cliente') resolverClienteDicho(accion.texto);
    }
  }
  procesarFraseRef.current = procesarFrase;

  function resolverClienteDicho(texto: string) {
    if (!contenedor) return;
    const consulta = texto.trim();
    if (consulta === '') {
      setPanelCliente({ consulta: '' });
      return;
    }
    const encontrados = contenedor.clientes.buscarPorTexto(consulta);
    if (encontrados.length === 1) {
      setCliente(encontrados[0] as Cliente);
      setNombreLibre('');
      despachar({ tipo: 'aviso', texto: `Cliente: ${(encontrados[0] as Cliente).nombre}` });
    } else if (encontrados.length > 1) {
      setPanelCliente({ consulta });
    } else {
      setCliente(null);
      setNombreLibre(consulta.toLocaleUpperCase('es'));
      despachar({ tipo: 'aviso', texto: `«${consulta.toLocaleUpperCase('es')}» no está registrado: se usará solo como nombre.` });
    }
  }

  // "Guardar" y "cancelar" se resuelven DESPUÉS de pintar, cuando ya se ve lo que se dijo en la misma frase.
  useEffect(() => {
    if (!intencion) return;
    setIntencion(null);
    if (intencion === 'cancelar') {
      if (venta.lineas.length > 0 || venta.pendientes.length > 0) setDialogo('cancelar');
      return;
    }
    pedirGuardar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intencion]);

  function pedirGuardar() {
    if (venta.lineas.length === 0) {
      despachar({ tipo: 'aviso', texto: 'Aún no hay productos en la venta.' });
      return;
    }
    if (venta.pendientes.length > 0) {
      despachar({ tipo: 'aviso', texto: 'Resuelve primero las dudas en amarillo (toca la opción correcta o quítalas).' });
      return;
    }
    if (venta.metodoPago === 'fiado' && !cliente) {
      despachar({ tipo: 'aviso', texto: 'La venta al fiado necesita un cliente.' });
      setPanelCliente({ consulta: '' });
      return;
    }
    setErrorGuardar(null);
    setDialogo('guardar');
  }

  // --- Guardar ---------------------------------------------------------------

  function notificarStockBajoTrasVenta(lineas: Linea[]) {
    if (!contenedor || !estaActivado(contenedor.configuracion.obtenerValor(CLAVE_NOTIFICAR_STOCK_BAJO))) return;
    if (!soportaNotificaciones()) return;
    const nombreTienda = obtenerNombreTienda(contenedor.configuracion.obtenerValor(CLAVE_NOMBRE_TIENDA));
    for (const linea of lineas) {
      let producto: Producto;
      try {
        producto = contenedor.productos.obtenerPorId(linea.productoId);
      } catch {
        continue;
      }
      if (!producto.controlaStock) continue;
      if (producto.stockActual === 0) mostrarNotificacionSinStock(producto.nombre, nombreTienda);
      else if (producto.stockActual < producto.stockMinimo) {
        mostrarNotificacionStockBajoProducto(producto.nombre, producto.stockActual, nombreTienda);
      }
    }
  }

  async function guardarVenta() {
    if (!contenedor || guardando) return;
    if (venta.metodoPago === 'fiado' && !cliente) {
      setDialogo(null);
      setPanelCliente({ consulta: '' });
      return;
    }
    setGuardando(true);
    setErrorGuardar(null);
    try {
      const registrada = contenedor.ventas.registrarVenta({
        lineas: venta.lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })),
        metodoPago: venta.metodoPago,
        clienteId: cliente?.id ?? null,
        clienteNombreLibre: venta.metodoPago !== 'fiado' && !cliente ? nombreLibre || null : null,
      });
      await contenedor.persistir();
      notificarStockBajoTrasVenta(venta.lineas);
      await reconocedorRef.current?.pausar();
      setTotalGuardado(registrada.total);
      setDialogo(null);
    } catch (e) {
      setErrorGuardar(e instanceof ErrorDeNegocio ? e.message : 'No se pudo guardar la venta.');
    } finally {
      setGuardando(false);
    }
  }

  function empezarOtraVenta() {
    despachar({ tipo: 'reiniciar' });
    setCliente(null);
    setNombreLibre('');
    setUltimaFrase('');
    setTotalGuardado(null);
    setDialogo(null);
    recargarProductos();
    void reconocedorRef.current?.iniciar();
  }

  function descartarVenta() {
    despachar({ tipo: 'reiniciar' });
    setCliente(null);
    setNombreLibre('');
    setUltimaFrase('');
    setDialogo(null);
  }

  function confirmarDialogo() {
    if (dialogo === 'guardar') void guardarVenta();
    else if (dialogo === 'cancelar') descartarVenta();
    else if (dialogo === 'salir') router.push('/');
  }
  const confirmarDialogoRef = useRef(confirmarDialogo);
  confirmarDialogoRef.current = confirmarDialogo;

  function salir() {
    if (totalGuardado !== null || (venta.lineas.length === 0 && venta.pendientes.length === 0)) {
      router.push('/');
      return;
    }
    setDialogo('salir');
  }

  // Botón físico "Atrás" de Android: si hay una venta a medias, pregunta antes de salir.
  const salirRef = useRef(salir);
  salirRef.current = salir;
  useEffect(() => {
    const alAtras = (e: Event) => {
      if (totalGuardado !== null || (venta.lineas.length === 0 && venta.pendientes.length === 0)) return;
      e.preventDefault();
      salirRef.current();
    };
    window.addEventListener('vendefacil:atras', alAtras);
    return () => window.removeEventListener('vendefacil:atras', alAtras);
  }, [totalGuardado, venta.lineas.length, venta.pendientes.length]);

  // El aviso desaparece solo.
  useEffect(() => {
    if (!venta.aviso) return;
    const id = setTimeout(() => despachar({ tipo: 'limpiar_aviso' }), 5000);
    return () => clearTimeout(id);
  }, [venta.aviso]);

  // --- Pantallas simples -----------------------------------------------------

  if (cargando || acceso === 'cargando') {
    return <p className="p-5 text-sm text-tinta/60">Cargando…</p>;
  }
  if (error) {
    return <p className="p-5 text-sm text-alerta">No se pudo abrir la base de datos: {error.message}</p>;
  }

  if (acceso === 'no_activo') {
    return (
      <div className="mx-auto flex min-h-dvh max-w-app flex-col items-center justify-center gap-4 px-5 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bodega-claro text-bodega-oscuro">
          <IconoMicrofono tamano={30} />
        </div>
        <h1 className="text-lg font-extrabold text-tinta">La venta por voz no está activa</h1>
        <p className="text-sm text-tinta/60">
          Es una función Premium. Actívala en Más › Configuración › Configuración de Venta.
        </p>
        <Link href="/mas/configuracion/configuracion-venta" className="flex h-12 items-center justify-center rounded-full bg-bodega px-6 text-sm font-semibold text-white">
          Ir a Configuración de Venta
        </Link>
        <Link href="/" className="text-sm font-semibold text-tinta/70">
          Volver a inicio
        </Link>
      </div>
    );
  }

  if (totalGuardado !== null) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-app flex-col items-center justify-center gap-6 px-5 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bodega-claro text-3xl">✓</div>
        <div>
          <p className="text-sm text-tinta/60">Venta guardada</p>
          <p className="text-4xl font-extrabold text-tinta">{formatearMonto(totalGuardado, simbolo)}</p>
          <p className="mt-2 text-xs text-tinta/50">Para imprimir o enviar el ticket, búscala en la lista de Inicio.</p>
        </div>
        <div className="flex w-full flex-col gap-3">
          <button onClick={empezarOtraVenta} className="flex h-14 items-center justify-center gap-2 rounded-full bg-bodega text-base font-semibold text-white active:bg-bodega-oscuro">
            <IconoMicrofono /> Nueva venta por voz
          </button>
          <Link href="/" className="flex h-14 items-center justify-center rounded-full border border-linea text-base font-semibold text-tinta">
            Volver a inicio
          </Link>
        </div>
      </div>
    );
  }

  // --- Pantalla principal ----------------------------------------------------

  const escuchando = estadoVoz === 'escuchando';
  const hayAlgo = venta.lineas.length > 0 || venta.pendientes.length > 0;
  const nombreCliente = cliente?.nombre ?? (nombreLibre || null);

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-[calc(7.5rem+var(--area-segura-abajo))] pt-5">
      <header className="flex items-center gap-3">
        <button onClick={salir} className="h-10 w-10 text-left text-xl text-tinta/60" aria-label="Volver a inicio">
          ←
        </button>
        <h1 className="flex-1 text-lg font-extrabold text-bodega-oscuro">Venta por voz</h1>
        <button
          onClick={() => setAyudaAbierta(true)}
          aria-label="Ayuda"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-linea text-base font-bold text-bodega-oscuro"
        >
          ?
        </button>
      </header>

      {/* Estado del micrófono: siempre dice con claridad qué está pasando */}
      <section className="mt-4" aria-live="polite">
        {estadoVoz === 'iniciando' && (
          <div className="rounded-2xl border border-linea bg-white p-4 text-center text-sm text-tinta/60">Activando micrófono…</div>
        )}
        {escuchando && (
          <div className="rounded-2xl border-2 border-bodega bg-bodega-claro p-4 text-center">
            <div className="mx-auto flex h-14 w-14 animate-pulse items-center justify-center rounded-full bg-bodega text-white">
              <IconoMicrofono tamano={28} />
            </div>
            <p className="mt-2 text-base font-extrabold text-bodega-oscuro">
              {hablando ? 'Oyendo tu voz…' : 'Te escucho… habla ahora'}
            </p>
            <p className="mt-1 min-h-[1.25rem] text-sm text-tinta/70">
              {textoParcial
                ? `«${textoParcial}»`
                : hablando
                  ? 'Haz una pausa cuando termines para que te entienda.'
                  : 'Di por ejemplo: «dos gaseosa y una hamburguesa»'}
            </p>
          </div>
        )}
        {estadoVoz === 'pausado' && (
          <div className="rounded-2xl border border-linea bg-white p-4 text-center">
            <p className="text-base font-extrabold text-tinta">Micrófono en pausa</p>
            <p className="mt-1 text-sm text-tinta/60">
              {detalleVoz === 'inactividad' ? 'Se apagó porque no se escuchó nada por un rato.' : 'Toca el botón para seguir hablando.'}
            </p>
            <button onClick={() => void reconocedorRef.current?.iniciar()} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-bodega text-base font-semibold text-white active:bg-bodega-oscuro">
              <IconoMicrofono /> Toca para hablar
            </button>
          </div>
        )}
        {(estadoVoz === 'sin_permiso' || estadoVoz === 'no_disponible' || estadoVoz === 'error') && (
          <div className="rounded-2xl border border-acento bg-acento/10 p-4">
            <p className="text-base font-extrabold text-tinta">
              {estadoVoz === 'sin_permiso' && 'Falta permitir el micrófono'}
              {estadoVoz === 'no_disponible' && 'Este celular no tiene voz disponible'}
              {estadoVoz === 'error' && 'No se pudo usar el micrófono'}
            </p>
            <p className="mt-1 text-sm text-tinta/70">
              {estadoVoz === 'sin_permiso' && 'Ve a Ajustes del celular › Aplicaciones › Vende Fácil › Permisos › Micrófono › Permitir. Luego toca «Reintentar».'}
              {estadoVoz === 'no_disponible' &&
                'Instala o activa «Servicios de voz de Google». Mientras tanto puedes armar la venta tocando «Agregar producto».'}
              {estadoVoz === 'error' &&
                (detalleVoz ??
                  'Revisa que el celular tenga el paquete de voz en español: Ajustes › Idioma y entrada › Teclado en pantalla › Gboard › Escritura por voz › Reconocimiento de voz sin conexión › Español.')}
            </p>
            <button onClick={() => void reconocedorRef.current?.iniciar()} className="mt-3 h-11 w-full rounded-full border border-bodega text-sm font-semibold text-bodega-oscuro">
              Reintentar
            </button>
          </div>
        )}
        {ultimaFrase !== '' && <p className="mt-2 text-center text-xs text-tinta/50">Escuché: «{ultimaFrase}»</p>}
      </section>

      {venta.aviso && (
        <div role="status" className="mt-3 rounded-xl bg-tinta px-4 py-3 text-sm font-semibold text-white">
          {venta.aviso.texto}
        </div>
      )}

      {/* Dudas: nunca se adivina, se pregunta */}
      {venta.pendientes.map((p) => (
        <section key={p.id} className="mt-3 rounded-2xl border border-acento bg-acento/10 p-4">
          {p.tipo === 'duda' ? (
            <p className="text-sm font-semibold text-tinta">
              ¿Cuál quisiste decir con «{p.texto}»? <span className="font-normal text-tinta/60">({p.cantidad} {p.cantidad === 1 ? 'unidad' : 'unidades'})</span>
            </p>
          ) : (
            <p className="text-sm font-semibold text-tinta">
              No encontré «{p.texto}» <span className="font-normal text-tinta/60">({p.cantidad} {p.cantidad === 1 ? 'unidad' : 'unidades'})</span>
            </p>
          )}
          <div className="mt-3 flex flex-col gap-2">
            {p.candidatos.map((c) => (
              <button
                key={c.producto.id}
                onClick={() => despachar({ tipo: 'resolver', id: p.id, producto: c.producto })}
                className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-bodega bg-white px-4 py-2 text-left text-sm font-semibold text-bodega-oscuro active:bg-bodega-claro"
              >
                <span>{c.producto.nombre}</span>
                <span className="shrink-0 text-tinta/60">{formatearMonto(c.producto.precioVenta, simbolo)}</span>
              </button>
            ))}
            <div className="flex gap-2">
              <button
                onClick={() => setSelector({ pendienteId: p.id, consulta: '' })}
                className="h-11 flex-1 rounded-xl border border-linea bg-white text-sm font-semibold text-tinta"
              >
                Buscar otro producto
              </button>
              <button
                onClick={() => despachar({ tipo: 'descartar', id: p.id })}
                className="h-11 flex-1 rounded-xl border border-linea bg-white text-sm font-semibold text-alerta"
              >
                Quitar
              </button>
            </div>
          </div>
        </section>
      ))}

      {/* El ticket que se va armando */}
      <section className="mt-4">
        <h2 className="text-sm font-extrabold text-tinta">Productos de la venta</h2>
        {venta.lineas.length === 0 ? (
          <div className="mt-2 flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-linea px-4 py-8 text-center text-tinta/50">
            <IconoMicrofono tamano={32} />
            <p className="text-sm">Aquí aparecerán los productos que digas.</p>
          </div>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {venta.lineas.map((l) => (
              <li key={l.productoId} className="rounded-2xl border border-linea bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold text-tinta">{l.nombre}</p>
                    <p className="text-xs text-tinta/50">{formatearMonto(l.precio, simbolo)} c/u</p>
                  </div>
                  <button onClick={() => despachar({ tipo: 'quitar', productoId: l.productoId })} aria-label={`Quitar ${l.nombre}`} className="h-9 w-9 shrink-0 rounded-full text-lg text-alerta">
                    ✕
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button onClick={() => despachar({ tipo: 'cambiar_cantidad', productoId: l.productoId, delta: -1 })} aria-label="Quitar una unidad" className="h-11 w-11 rounded-full border border-linea text-xl font-bold text-tinta active:bg-bodega-claro">
                      −
                    </button>
                    <span className="w-10 text-center text-lg font-extrabold text-tinta">{l.cantidad}</span>
                    <button onClick={() => despachar({ tipo: 'cambiar_cantidad', productoId: l.productoId, delta: 1 })} aria-label="Agregar una unidad" className="h-11 w-11 rounded-full border border-linea text-xl font-bold text-tinta active:bg-bodega-claro">
                      +
                    </button>
                  </div>
                  <p className="text-base font-extrabold text-tinta">{formatearMonto(l.precio * l.cantidad, simbolo)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button onClick={() => setSelector({ pendienteId: null, consulta: '' })} className="mt-3 h-12 w-full rounded-xl border border-bodega text-sm font-semibold text-bodega-oscuro active:bg-bodega-claro">
          ＋ Agregar producto tocando
        </button>
      </section>

      {/* Forma de pago */}
      <section className="mt-5">
        <h2 className="text-sm font-extrabold text-tinta">Forma de pago</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {METODOS_PAGO.map((m) => (
            <button
              key={m.valor}
              onClick={() => despachar({ tipo: 'pago', metodo: m.valor })}
              aria-pressed={venta.metodoPago === m.valor}
              className={`h-12 min-w-[30%] flex-1 rounded-xl border text-sm font-semibold ${
                venta.metodoPago === m.valor ? 'border-bodega bg-bodega text-white' : 'border-linea bg-white text-tinta'
              }`}
            >
              {m.etiqueta}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-tinta/50">También puedes decir «yape», «plin», «tarjeta» o «fiado».</p>
      </section>

      {/* Cliente */}
      <section className="mt-5">
        <h2 className="text-sm font-extrabold text-tinta">Cliente {venta.metodoPago === 'fiado' ? '(obligatorio para fiado)' : '(opcional)'}</h2>
        <button onClick={() => setPanelCliente({ consulta: '' })} className="mt-2 flex h-12 w-full items-center justify-between rounded-xl border border-linea bg-white px-4 text-left text-sm">
          <span className={nombreCliente ? 'font-semibold text-tinta' : 'text-tinta/50'}>
            {nombreCliente ?? 'Cliente eventual — toca para elegir'}
          </span>
          <span className="text-tinta/40">›</span>
        </button>
        <p className="mt-1 text-xs text-tinta/50">También puedes decir «cliente» y su nombre.</p>
      </section>

      {/* Barra de abajo: micrófono + guardar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-linea bg-papel/95 backdrop-blur">
        <div className="mx-auto flex max-w-app items-center gap-3 px-5 pb-[calc(0.75rem+var(--area-segura-abajo))] pt-3">
          <button
            onClick={() => (escuchando ? void reconocedorRef.current?.pausar() : void reconocedorRef.current?.iniciar())}
            aria-label={escuchando ? 'Pausar micrófono' : 'Activar micrófono'}
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${escuchando ? 'bg-bodega text-white' : 'border-2 border-bodega bg-white text-bodega-oscuro'}`}
          >
            <IconoMicrofono tamano={26} />
          </button>
          <button
            onClick={pedirGuardar}
            disabled={!hayAlgo}
            className="flex h-14 flex-1 flex-col items-center justify-center rounded-full bg-bodega text-white active:bg-bodega-oscuro disabled:opacity-40"
          >
            <span className="text-base font-semibold leading-tight">Guardar venta</span>
            <span className="text-xs leading-tight opacity-90">Total {formatearMonto(total, simbolo)}</span>
          </button>
        </div>
      </div>

      {/* Hojas y preguntas */}
      {selector && (
        <SelectorProducto
          productos={productos}
          simbolo={simbolo}
          titulo={selector.pendienteId !== null ? 'Elige el producto' : 'Agregar producto'}
          consultaInicial={selector.consulta}
          onElegir={(producto) => {
            if (selector.pendienteId !== null) despachar({ tipo: 'resolver', id: selector.pendienteId, producto });
            else despachar({ tipo: 'agregar', producto, cantidad: 1 });
            setSelector(null);
          }}
          onCerrar={() => setSelector(null)}
        />
      )}

      {panelCliente && contenedor && (
        <PanelCliente
          contenedorBuscar={(texto) => contenedor.clientes.buscarPorTexto(texto)}
          consultaInicial={panelCliente.consulta}
          permitirNombreLibre={venta.metodoPago !== 'fiado'}
          onElegir={(c) => {
            setCliente(c);
            setNombreLibre('');
            setPanelCliente(null);
          }}
          onNombreLibre={(nombre) => {
            setCliente(null);
            setNombreLibre(nombre.toLocaleUpperCase('es'));
            setPanelCliente(null);
          }}
          onQuitar={() => {
            setCliente(null);
            setNombreLibre('');
            setPanelCliente(null);
          }}
          onCerrar={() => setPanelCliente(null)}
        />
      )}

      {ayudaAbierta && (
        <Hoja titulo="¿Cómo se usa?" onCerrar={() => setAyudaAbierta(false)}>
          <ol className="mt-4 flex flex-col gap-3 text-sm text-tinta/80">
            <li><strong className="text-tinta">1. Habla.</strong> Di la cantidad y luego el producto: «una hamburguesa, dos gaseosa inka cola».</li>
            <li><strong className="text-tinta">2. Revisa.</strong> Los productos aparecen abajo. Si algo sale en amarillo, toca la opción correcta.</li>
            <li><strong className="text-tinta">3. Guarda.</strong> Di «guardar venta» (o toca el botón verde) y confirma.</li>
          </ol>
          <h3 className="mt-5 text-sm font-extrabold text-tinta">Otras cosas que puedes decir</h3>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-tinta/80">
            <li>«yape», «plin», «tarjeta», «fiado» o «efectivo»: la forma de pago.</li>
            <li>«cliente» y su nombre: para anotar al cliente.</li>
            <li>«borrar último»: quita el último producto.</li>
            <li>«cancelar venta»: empieza de nuevo.</li>
          </ul>
          <p className="mt-4 rounded-xl bg-bodega-claro p-3 text-xs text-bodega-oscuro">
            Si la voz no entiende un producto, agrega ese nombre como <strong>Alias</strong> en Productos y la próxima vez lo reconocerá.
          </p>
        </Hoja>
      )}

      {dialogo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div role="dialog" aria-label="Confirmar" className="max-h-[88dvh] w-full max-w-app overflow-y-auto rounded-2xl bg-white p-5 shadow-lg">
            {dialogo === 'guardar' ? (
              <>
                <h2 className="text-lg font-extrabold text-bodega-oscuro">¿Guardar esta venta?</h2>
                <ul className="mt-3 divide-y divide-linea border-y border-linea text-sm">
                  {venta.lineas.map((l) => (
                    <li key={l.productoId} className="flex items-center justify-between gap-3 py-2">
                      <span className="text-tinta/80">{l.cantidad} × {l.nombre}</span>
                      <span className="shrink-0 font-semibold text-tinta">{formatearMonto(l.precio * l.cantidad, simbolo)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-base font-semibold text-tinta">Total</span>
                  <span className="text-2xl font-extrabold text-tinta">{formatearMonto(total, simbolo)}</span>
                </div>
                <p className="mt-1 text-sm text-tinta/60">
                  Pago: {METODOS_PAGO.find((m) => m.valor === venta.metodoPago)?.etiqueta} · {nombreCliente ?? 'Cliente eventual'}
                </p>
                {errorGuardar && <p className="mt-3 text-sm text-alerta">{errorGuardar}</p>}
                <div className="mt-5 flex flex-col gap-2">
                  <button onClick={() => void guardarVenta()} disabled={guardando} className="h-14 rounded-full bg-bodega text-base font-semibold text-white active:bg-bodega-oscuro disabled:opacity-60">
                    {guardando ? 'Guardando…' : 'Sí, guardar'}
                  </button>
                  <button onClick={() => setDialogo(null)} className="h-12 text-sm font-semibold text-tinta/70">
                    Seguir editando
                  </button>
                </div>
                <p className="mt-2 text-center text-xs text-tinta/50">También puedes decir «sí» o «no».</p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-extrabold text-bodega-oscuro">
                  {dialogo === 'salir' ? '¿Salir sin guardar?' : '¿Descartar esta venta?'}
                </h2>
                <p className="mt-2 text-sm text-tinta/70">Se perderán los productos que armaste.</p>
                <div className="mt-5 flex flex-col gap-2">
                  <button onClick={confirmarDialogo} className="h-14 rounded-full bg-alerta text-base font-semibold text-white">
                    {dialogo === 'salir' ? 'Sí, salir' : 'Sí, descartar'}
                  </button>
                  <button onClick={() => setDialogo(null)} className="h-12 text-sm font-semibold text-tinta/70">
                    No, seguir con la venta
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
