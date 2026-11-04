'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { usarPermisos } from '@/hooks/usar-permisos';
import { usarAvisos } from '@/components/proveedor-avisos';
import { EsqueletoLista } from '@/components/ui/esqueleto';
import { EstadoVacio } from '@/components/ui/estado-vacio';
import { IconoProductos } from '@/components/ui/iconos';
import { AVISOS, estadoLista } from '@/core/avisos';
import { CLAVE_MONEDA, formatearMonto, obtenerSimboloMoneda } from '@/core/moneda';
import type { HistorialProductoItem, Producto, TipoProducto } from '@/core/tipos';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import { limpiarNumeroEscrito, mayusculasAlEscribir, partirAlias, partirEnLineas, unirAlias } from '@/core/texto';
import { CLAVE_MODO_VENTA_VOZ, modoVentaVozDisponible } from '@/core/configuracion';
import { formatearFechaHora } from '@/core/tiempo';
import { SelectorEstado, filtrarPorEstado, type FiltroEstado } from '@/components/selector-estado';
import { EtiquetaCampo, VentanaFormulario } from '@/components/ventana-formulario';
import { CampoAlias } from '@/components/campo-alias';

const ETIQUETAS_CAMPO_HISTORIAL: Record<HistorialProductoItem['campo'], string> = {
  nombre: 'Nombre',
  precio_venta: 'Precio de venta',
  costo: 'Costo',
  stock: 'Stock',
  stock_minimo: 'Stock mínimo',
};

export default function PaginaProductos() {
  const { contenedor, cargando, error } = usarContenedor();
  const { avisar } = usarAvisos();
  const { pedirPermiso, modalPermiso } = usarPermisos(contenedor);
  const [simboloMoneda, setSimboloMoneda] = useState(obtenerSimboloMoneda(null));
  // El campo Alias solo se ve con el modo venta por voz en ON y plan Premium (ver modoVentaVozDisponible).
  const [modoVoz, setModoVoz] = useState(false);

  useEffect(() => {
    if (!contenedor) return;
    setSimboloMoneda(obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)));
    setModoVoz(
      modoVentaVozDisponible(
        contenedor.configuracion.obtenerValor(CLAVE_MODO_VENTA_VOZ),
        contenedor.plan.obtenerEstado().tipo === 'premium',
      ),
    );
  }, [contenedor]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('activos');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | TipoProducto>('todos');
  // Producto tocado: se ve seleccionado y sube el pop-up Editar | Ajustar Stock | Bitácora.
  const [menuOpcionesId, setMenuOpcionesId] = useState<number | null>(null);

  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoProducto>('venta_compra');
  const [precioVenta, setPrecioVenta] = useState('');
  const [costo, setCosto] = useState('');
  const [stockActual, setStockActual] = useState('');
  const [stockMinimo, setStockMinimo] = useState('');
  const [controlaStock, setControlaStock] = useState(true);
  const [alias, setAlias] = useState<string[]>([]);
  const [aliasTexto, setAliasTexto] = useState('');
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nombreEdit, setNombreEdit] = useState('');
  const [tipoEdit, setTipoEdit] = useState<TipoProducto>('venta_compra');
  const [precioVentaEdit, setPrecioVentaEdit] = useState('');
  const [costoEdit, setCostoEdit] = useState('');
  const [stockMinimoEdit, setStockMinimoEdit] = useState('');
  const [controlaStockEdit, setControlaStockEdit] = useState(true);
  const [activoEdit, setActivoEdit] = useState(true);
  const [aliasEdit, setAliasEdit] = useState<string[]>([]);
  const [aliasTextoEdit, setAliasTextoEdit] = useState('');
  const [mensajeErrorEdit, setMensajeErrorEdit] = useState<string | null>(null);

  // Ajuste manual de stock (conteo físico, merma, corrección) — no pasa
  // por una compra. Se registra en movimiento_inventario con trazabilidad.
  const [ajustandoId, setAjustandoId] = useState<number | null>(null);
  const [tipoAjuste, setTipoAjuste] = useState<'sumar' | 'restar'>('sumar');
  const [cantidadAjuste, setCantidadAjuste] = useState('');
  const [motivoAjuste, setMotivoAjuste] = useState('');
  const [mensajeErrorAjuste, setMensajeErrorAjuste] = useState<string | null>(null);

  // Bitácora de cambios manuales (ver producto.repositorio.ts): se pide
  // bajo demanda, solo para el producto que se tiene abierto.
  const [bitacoraId, setBitacoraId] = useState<number | null>(null);
  const [historial, setHistorial] = useState<HistorialProductoItem[]>([]);

  const [listaLista, setListaLista] = useState(false);

  function recargar() {
    if (!contenedor) return;
    setProductos(contenedor.productos.listarTodos());
    setListaLista(true);
  }

  useEffect(recargar, [contenedor]);

  async function guardarProducto() {
    if (!contenedor) return;
    setMensajeError(null);
    const esInsumo = tipo === 'insumo';
    const precioNum = Number(precioVenta);
    const costoNum = Number(costo);
    // Costo en 0 no se avisa (puede ser un producto sin costo registrado
    // a propósito); solo se pregunta cuando el costo queda MÁS ALTO que
    // el precio de venta, porque eso casi siempre es un error de tipeo.
    // Un insumo no tiene precio de venta, así que no aplica.
    if (!esInsumo && costoNum > 0 && costoNum > precioNum) {
      const confirmar = window.confirm(
        `¿Está seguro de registrar este costo: ${formatearMonto(costoNum, simboloMoneda)} mayor al precio de venta ${formatearMonto(precioNum, simboloMoneda)}?`,
      );
      if (!confirmar) return;
    }
    if (!(await pedirPermiso('gestionar_productos', 'crear el producto', { sinPin: true }))) return;
    try {
      contenedor.productos.crear({
        nombre: nombre.trim(),
        precioVenta: esInsumo ? 0 : Number(precioVenta),
        costo: Number(costo),
        stockActual: esInsumo ? 0 : Number(stockActual || 0),
        stockMinimo: esInsumo ? 0 : Number(stockMinimo || 0),
        controlaStock: esInsumo ? false : controlaStock,
        unidadMedida: 'unidad',
        tipo,
        alias: modoVoz && !esInsumo ? unirAlias(partirAlias([...alias, aliasTexto].join(','))) : null,
      });
      await contenedor.persistir();
      setNombre('');
      setTipo('venta_compra');
      setPrecioVenta('');
      setCosto('');
      setStockActual('');
      setStockMinimo('');
      setControlaStock(true);
      setAlias([]);
      setAliasTexto('');
      setMostrarFormulario(false);
      recargar();
      avisar(AVISOS.productoGuardado, { vibrar: 'guardar' });
    } catch (e) {
      setMensajeError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo guardar el producto.');
    }
  }

  function abrirEdicion(producto: Producto) {
    setMostrarFormulario(false);
    setAjustandoId(null);
    setBitacoraId(null);
    setEditandoId(producto.id);
    setNombreEdit(producto.nombre);
    setTipoEdit(producto.tipo);
    setPrecioVentaEdit(String(producto.precioVenta));
    setCostoEdit(String(producto.costo));
    setStockMinimoEdit(String(producto.stockMinimo));
    setControlaStockEdit(producto.controlaStock);
    setActivoEdit(producto.activo);
    setAliasEdit(partirAlias(producto.alias));
    setAliasTextoEdit('');
    setMensajeErrorEdit(null);
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setMensajeErrorEdit(null);
  }

  function abrirAjuste(producto: Producto) {
    setMostrarFormulario(false);
    setEditandoId(null);
    setBitacoraId(null);
    setAjustandoId(producto.id);
    setTipoAjuste('sumar');
    setCantidadAjuste('');
    setMotivoAjuste('');
    setMensajeErrorAjuste(null);
  }

  const productoMenu = productos.find((p) => p.id === menuOpcionesId) ?? null;
  const productoEditando = productos.find((p) => p.id === editandoId) ?? null;

  // Al elegir Editar / Ajustar Stock / Bitácora, el panel se abre dentro de la fila del
  // producto: se lleva la pantalla hasta esa fila para no tener que buscarla.
  useEffect(() => {
    const id = ajustandoId ?? bitacoraId;
    if (id === null) return;
    const espera = setTimeout(() => {
      document.getElementById(`producto-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    return () => clearTimeout(espera);
  }, [ajustandoId, bitacoraId]);

  // Botón físico "Atrás" de Android: con el pop-up abierto lo cierra (ver ManejarBotonAtras).
  useEffect(() => {
    if (menuOpcionesId === null) return;
    const cerrar = (e: Event) => {
      e.preventDefault();
      setMenuOpcionesId(null);
    };
    window.addEventListener('vendefacil:atras', cerrar);
    return () => window.removeEventListener('vendefacil:atras', cerrar);
  }, [menuOpcionesId]);

  function cerrarPaneles() {
    setEditandoId(null);
    setMensajeErrorEdit(null);
    setAjustandoId(null);
    setMensajeErrorAjuste(null);
    setBitacoraId(null);
  }

  function cancelarAjuste() {
    setAjustandoId(null);
    setMensajeErrorAjuste(null);
  }

  function alternarBitacora(producto: Producto) {
    if (bitacoraId === producto.id) {
      setBitacoraId(null);
      return;
    }
    setMostrarFormulario(false);
    setEditandoId(null);
    setAjustandoId(null);
    setBitacoraId(producto.id);
    setHistorial(contenedor ? contenedor.productos.listarHistorial(producto.id) : []);
  }

  function formatearValorCampo(campo: HistorialProductoItem['campo'], valor: string | null): string {
    if (valor === null) return '—';
    if (campo === 'precio_venta' || campo === 'costo') return formatearMonto(Number(valor), simboloMoneda);
    return valor;
  }

  const formularioAjusteValido = Number(cantidadAjuste) > 0 && motivoAjuste.trim().length > 0;

  async function confirmarAjuste() {
    if (!contenedor || ajustandoId === null) return;
    setMensajeErrorAjuste(null);
    if (!(await pedirPermiso('gestionar_productos', 'ajustar el stock'))) return;
    try {
      const delta = tipoAjuste === 'sumar' ? Number(cantidadAjuste) : -Number(cantidadAjuste);
      contenedor.productos.ajustarStock(ajustandoId, delta, motivoAjuste.trim());
      await contenedor.persistir();
      setAjustandoId(null);
      recargar();
      avisar(AVISOS.stockAjustado, { vibrar: 'guardar' });
    } catch (e) {
      setMensajeErrorAjuste(e instanceof ErrorDeNegocio ? e.message : 'No se pudo ajustar el stock.');
    }
  }

  const productosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const base = filtrarPorEstado(productos, filtroEstado).filter(
      (p) => filtroTipo === 'todos' || p.tipo === filtroTipo,
    );
    if (!texto) return base;
    return base.filter((p) => {
      if (p.nombre.toLowerCase().includes(texto)) return true;
      if (p.precioVenta.toFixed(2).includes(texto)) return true;
      if (String(p.precioVenta).includes(texto)) return true;
      return false;
    });
  }, [productos, busqueda, filtroEstado, filtroTipo]);

  const estadoProductos = estadoLista({
    cargando: cargando || (!listaLista && !error),
    total: productos.length,
    visibles: productosFiltrados.length,
  });

  const formularioValido =
    nombre.trim().length > 0 &&
    Number(costo) >= 0 &&
    (tipo === 'insumo' || Number(precioVenta) >= 0);

  const formularioEditValido =
    nombreEdit.trim().length > 0 &&
    Number(costoEdit) >= 0 &&
    (tipoEdit === 'insumo' || Number(precioVentaEdit) >= 0);

  async function guardarEdicion() {
    if (!contenedor || editandoId === null) return;
    setMensajeErrorEdit(null);
    const esInsumoEdit = tipoEdit === 'insumo';
    const precioNum = Number(precioVentaEdit);
    const costoNum = Number(costoEdit);
    if (!esInsumoEdit && costoNum > 0 && costoNum > precioNum) {
      const confirmar = window.confirm(
        `¿Está seguro de registrar este costo: ${formatearMonto(costoNum, simboloMoneda)} mayor al precio de venta ${formatearMonto(precioNum, simboloMoneda)}?`,
      );
      if (!confirmar) return;
    }
    if (!(await pedirPermiso('gestionar_productos', 'guardar los cambios del producto'))) return;
    try {
      const producto = contenedor.productos.obtenerPorId(editandoId);
      contenedor.productos.actualizar(editandoId, {
        nombre: nombreEdit.trim(),
        categoriaId: producto.categoriaId,
        codigo: producto.codigo,
        precioVenta: esInsumoEdit ? 0 : Number(precioVentaEdit),
        costo: Number(costoEdit),
        stockMinimo: esInsumoEdit ? 0 : Number(stockMinimoEdit || 0),
        controlaStock: esInsumoEdit ? false : controlaStockEdit,
        unidadMedida: producto.unidadMedida,
        activo: activoEdit,
        tipo: tipoEdit,
        // Con el modo voz en OFF no se manda alias: así los ya guardados se conservan intactos.
        alias: modoVoz && !esInsumoEdit ? unirAlias(partirAlias([...aliasEdit, aliasTextoEdit].join(','))) : undefined,
      });
      await contenedor.persistir();
      setEditandoId(null);
      recargar();
      avisar(AVISOS.productoActualizado, { vibrar: 'guardar' });
    } catch (e) {
      setMensajeErrorEdit(e instanceof ErrorDeNegocio ? e.message : 'No se pudo guardar el producto.');
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      {modalPermiso}
      <header className="flex items-center gap-3">
        <Link href="/" className="text-xl text-tinta-suave" aria-label="Volver a inicio">
          ←
        </Link>
        <h1 className="flex-1 text-lg font-extrabold text-bodega-oscuro">Productos</h1>
        <button
          onClick={() => {
            setEditandoId(null);
            setMostrarFormulario(true);
          }}
          className="rounded-full bg-green-600 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white active:bg-green-700"
        >
          Nuevo producto
        </button>
      </header>

      {mostrarFormulario && (
        <VentanaFormulario titulo="Nuevo producto" onCerrar={() => setMostrarFormulario(false)}>
          <div>
            <EtiquetaCampo>Nombre Producto:</EtiquetaCampo>
            <input
              value={nombre}
              onChange={(e) => setNombre(mayusculasAlEscribir(e.target.value))}
              autoCapitalize="characters"
              className="uppercase h-11 w-full rounded-lg border border-linea px-3 text-sm"
            />
          </div>
          <div>
            <EtiquetaCampo>Sirve Para:</EtiquetaCampo>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoProducto)}
              className="h-11 w-full rounded-lg border border-linea bg-white px-3 text-sm"
            >
              <option value="venta_compra">Venta y Compra</option>
              <option value="insumo">Solo Insumo (Compras)</option>
            </select>
          </div>
          {tipo === 'venta_compra' && (
            <div>
              <EtiquetaCampo>Precio de Venta:</EtiquetaCampo>
              <input
                value={precioVenta}
                onChange={(e) => setPrecioVenta(limpiarNumeroEscrito(e.target.value))}
                inputMode="decimal"
                className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
              />
            </div>
          )}
          <div>
            <EtiquetaCampo>Costo (opcional):</EtiquetaCampo>
            <input
              value={costo}
              onChange={(e) => setCosto(limpiarNumeroEscrito(e.target.value))}
              inputMode="decimal"
              className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
            />
          </div>
          {tipo === 'venta_compra' && (
            <>
              <label className="flex items-center gap-2 text-sm font-bold text-tinta">
                <input
                  type="checkbox"
                  checked={controlaStock}
                  onChange={(e) => {
                    const marcado = e.target.checked;
                    setControlaStock(marcado);
                    if (!marcado) {
                      setStockActual('0');
                      setStockMinimo('0');
                    }
                  }}
                  className="h-4 w-4 rounded border-linea"
                />
                Control Stock
              </label>
              <div>
                <EtiquetaCampo>Stock Inicial (opcional):</EtiquetaCampo>
                <input
                  value={controlaStock ? stockActual : '0'}
                  onChange={(e) => setStockActual(limpiarNumeroEscrito(e.target.value))}
                  disabled={!controlaStock}
                  inputMode="numeric"
                  className="h-11 w-full rounded-lg border border-linea px-3 text-sm disabled:bg-papel disabled:text-tinta/40"
                />
              </div>
              <div>
                <EtiquetaCampo>Stock Mínimo (opcional):</EtiquetaCampo>
                <input
                  value={controlaStock ? stockMinimo : '0'}
                  onChange={(e) => setStockMinimo(limpiarNumeroEscrito(e.target.value))}
                  disabled={!controlaStock}
                  inputMode="numeric"
                  className="h-11 w-full rounded-lg border border-linea px-3 text-sm disabled:bg-papel disabled:text-tinta/40"
                />
              </div>
            </>
          )}
          {modoVoz && tipo === 'venta_compra' && (
            <div>
              <EtiquetaCampo>Alias:</EtiquetaCampo>
              <CampoAlias
                alias={alias}
                onCambiarAlias={setAlias}
                texto={aliasTexto}
                onCambiarTexto={setAliasTexto}
                productos={productos}
              />
            </div>
          )}
          {mensajeError && <p className="text-sm text-alerta">{mensajeError}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => setMostrarFormulario(false)}
              className="h-11 flex-1 rounded-lg border border-linea text-sm font-semibold text-tinta/70"
            >
              Cancelar
            </button>
            <button
              onClick={guardarProducto}
              disabled={!formularioValido}
              className="h-11 flex-1 rounded-lg bg-bodega text-sm font-semibold text-white disabled:opacity-40"
            >
              Guardar producto
            </button>
          </div>
        </VentanaFormulario>
      )}

      {productoEditando && (
        <VentanaFormulario titulo="Editar producto" onCerrar={cancelarEdicion}>
          <div>
            <EtiquetaCampo>Nombre Producto:</EtiquetaCampo>
            <input
              value={nombreEdit}
              onChange={(e) => setNombreEdit(mayusculasAlEscribir(e.target.value))}
              autoCapitalize="characters"
              className="uppercase h-11 w-full rounded-lg border border-linea px-3 text-sm"
            />
          </div>
          <div>
            <EtiquetaCampo>Sirve Para:</EtiquetaCampo>
            <select
              value={tipoEdit}
              onChange={(e) => setTipoEdit(e.target.value as TipoProducto)}
              className="h-11 w-full rounded-lg border border-linea bg-white px-3 text-sm"
            >
              <option value="venta_compra">Venta y Compra</option>
              <option value="insumo">Solo Insumo (Compras)</option>
            </select>
            {tipoEdit === 'insumo' && productoEditando.tipo !== 'insumo' && (
              <p className="mt-1 text-xs text-tinta-suave">Para pasar a Insumo el stock debe estar en 0.</p>
            )}
          </div>
          {tipoEdit === 'venta_compra' && (
            <div>
              <EtiquetaCampo>Precio de Venta:</EtiquetaCampo>
              <input
                value={precioVentaEdit}
                onChange={(e) => setPrecioVentaEdit(limpiarNumeroEscrito(e.target.value))}
                inputMode="decimal"
                className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
              />
            </div>
          )}
          <div>
            <EtiquetaCampo>Costo (opcional):</EtiquetaCampo>
            <input
              value={costoEdit}
              onChange={(e) => setCostoEdit(limpiarNumeroEscrito(e.target.value))}
              inputMode="decimal"
              className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
            />
          </div>
          {tipoEdit === 'venta_compra' && (
            <>
              <label className="flex items-center gap-2 text-sm font-bold text-tinta">
                <input
                  type="checkbox"
                  checked={controlaStockEdit}
                  onChange={(e) => {
                    const marcado = e.target.checked;
                    setControlaStockEdit(marcado);
                    if (!marcado) setStockMinimoEdit('0');
                  }}
                  className="h-4 w-4 rounded border-linea"
                />
                Control Stock
              </label>
              <div>
                <EtiquetaCampo>Stock Mínimo (opcional):</EtiquetaCampo>
                <input
                  value={controlaStockEdit ? stockMinimoEdit : '0'}
                  onChange={(e) => setStockMinimoEdit(limpiarNumeroEscrito(e.target.value))}
                  disabled={!controlaStockEdit}
                  inputMode="numeric"
                  className="h-11 w-full rounded-lg border border-linea px-3 text-sm disabled:bg-papel disabled:text-tinta/40"
                />
              </div>
            </>
          )}
          <div>
            <EtiquetaCampo>Estado:</EtiquetaCampo>
            <select
              value={activoEdit ? 'activo' : 'inactivo'}
              onChange={(e) => setActivoEdit(e.target.value === 'activo')}
              className="h-11 w-full rounded-lg border border-linea bg-white px-3 text-sm"
            >
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo (no aparece para vender)</option>
            </select>
          </div>
          {modoVoz && tipoEdit === 'venta_compra' && (
            <div>
              <EtiquetaCampo>Alias:</EtiquetaCampo>
              <CampoAlias
                alias={aliasEdit}
                onCambiarAlias={setAliasEdit}
                texto={aliasTextoEdit}
                onCambiarTexto={setAliasTextoEdit}
                productos={productos}
                excluirProductoId={editandoId ?? undefined}
              />
            </div>
          )}
          {mensajeErrorEdit && <p className="text-sm text-alerta">{mensajeErrorEdit}</p>}
          <div className="flex gap-3">
            <button
              onClick={cancelarEdicion}
              className="h-11 flex-1 rounded-lg border border-linea text-sm font-semibold text-tinta/70"
            >
              Cancelar
            </button>
            <button
              onClick={guardarEdicion}
              disabled={!formularioEditValido}
              className="h-11 flex-1 rounded-lg bg-bodega text-sm font-semibold text-white disabled:opacity-40"
            >
              Guardar cambios
            </button>
          </div>
        </VentanaFormulario>
      )}

      {productos.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex gap-2">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o precio…"
              className="h-11 min-w-0 flex-1 rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
            />
            <SelectorEstado valor={filtroEstado} onCambiar={setFiltroEstado} />
          </div>
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as 'todos' | TipoProducto)}
            aria-label="Filtrar por tipo de producto"
            className="h-11 w-full rounded-xl border border-linea bg-white px-3 text-sm outline-none focus:border-bodega"
          >
            <option value="todos">Todos los productos</option>
            <option value="venta_compra">Productos Venta y Compra</option>
            <option value="insumo">Insumos</option>
          </select>
        </div>
      )}

      <main className="mt-6 flex-1">
        {error && <p className="text-sm text-alerta">{error.message}</p>}

        {estadoProductos === 'cargando' && !error && <EsqueletoLista />}

        {estadoProductos === 'vacia' && (
          <EstadoVacio
            icono={<IconoProductos tamano={40} />}
            titulo="Aún no tienes productos"
            descripcion="Toca «Nuevo producto» arriba para agregar el primero y empezar a vender."
          />
        )}

        {estadoProductos === 'sin_resultados' && (
          <p className="border-y border-linea py-6 text-center text-sm text-tinta-suave">
            {busqueda.trim()
              ? `Ningún producto coincide con "${busqueda}".`
              : `No hay productos ${filtroEstado === 'inactivos' ? 'inactivos' : 'activos'}.`}
          </p>
        )}

        <ul className="divide-y divide-linea border-y border-linea">
          {productosFiltrados.map((producto) => {
            const stockBajo = producto.controlaStock && producto.stockActual <= producto.stockMinimo;
            const panelAbierto =
              ajustandoId === producto.id || bitacoraId === producto.id;
            return (
              <li key={producto.id} id={`producto-${producto.id}`} className="scroll-mt-4 py-1">
                <button
                  type="button"
                  onClick={() => {
                    if (panelAbierto) cerrarPaneles();
                    else setMenuOpcionesId(producto.id);
                  }}
                  aria-haspopup="dialog"
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left transition-colors active:bg-bodega/15 ${
                    menuOpcionesId === producto.id || panelAbierto ? 'bg-bodega/10' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <span className="block text-sm text-tinta">
                      {partirEnLineas(producto.nombre, 25).map((linea, i, lineas) => (
                        <span key={i} className="block">
                          {linea}
                          {i === lineas.length - 1 && producto.tipo === 'insumo' && (
                            <span className="ml-2 text-xs font-semibold text-tinta-suave">(Insumo)</span>
                          )}
                          {i === lineas.length - 1 && !producto.activo && (
                            <span className="ml-2 rounded-full bg-alerta/10 px-2 py-0.5 text-xs font-semibold text-alerta">
                              Inactivo
                            </span>
                          )}
                        </span>
                      ))}
                    </span>
                    {producto.tipo === 'insumo' ? null : producto.controlaStock ? (
                      <span className={`block text-xs ${stockBajo ? 'text-alerta' : 'text-tinta-suave'}`}>
                        Stock: {producto.stockActual} {stockBajo && '· bajo'}
                      </span>
                    ) : (
                      <span className="block text-xs text-tinta-suave">No controla stock</span>
                    )}
                  </div>
                  <span className="max-w-[45%] shrink-0 text-right text-sm font-semibold text-tinta">
                    {producto.tipo === 'insumo' ? (
                      <>
                        Costo:{' '}
                        <span className="whitespace-nowrap">{formatearMonto(producto.costo, simboloMoneda)}</span>
                      </>
                    ) : (
                      <span className="whitespace-nowrap">{formatearMonto(producto.precioVenta, simboloMoneda)}</span>
                    )}
                  </span>
                </button>

                {bitacoraId === producto.id && (
                  <div className="mt-3 space-y-2 rounded-xl border border-linea p-4">
                    <p className="text-xs text-tinta-suave">
                      Cambios manuales a este producto (nombre, precio, costo, stock y stock
                      mínimo) — no incluye los movimientos normales de una venta o una compra.
                    </p>
                    {historial.length === 0 ? (
                      <p className="text-sm text-tinta-suave">Sin cambios registrados todavía.</p>
                    ) : (
                      <ul className="divide-y divide-linea">
                        {historial.map((item, indice) => (
                          <li key={indice} className="py-2 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-tinta">
                                {ETIQUETAS_CAMPO_HISTORIAL[item.campo]}
                              </span>
                              <span className="text-xs text-tinta-suave">{formatearFechaHora(item.fecha)}</span>
                            </div>
                            <p className="text-tinta/70">
                              {item.valorAnterior === null ? (
                                <>Se registró en {formatearValorCampo(item.campo, item.valorNuevo)}</>
                              ) : (
                                <>
                                  Cambió de {formatearValorCampo(item.campo, item.valorAnterior)} a{' '}
                                  {formatearValorCampo(item.campo, item.valorNuevo)}
                                </>
                              )}
                            </p>
                            {item.motivo && <p className="text-xs text-tinta-suave">Motivo: {item.motivo}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {ajustandoId === producto.id && (
                  <div className="mt-3 space-y-3 rounded-xl border border-linea p-4">
                    <p className="text-xs text-tinta-suave">
                      Stock actual: <span className="font-semibold text-tinta">{producto.stockActual}</span>{' '}
                      {producto.unidadMedida}. Usa esto para conteos físicos o mermas — no para
                      reponer stock de una compra (eso va en Compras).
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTipoAjuste('sumar')}
                        className={`h-9 flex-1 rounded-full border text-sm font-medium ${
                          tipoAjuste === 'sumar'
                            ? 'border-bodega bg-bodega text-white'
                            : 'border-linea text-tinta/70'
                        }`}
                      >
                        + Sumar
                      </button>
                      <button
                        onClick={() => setTipoAjuste('restar')}
                        className={`h-9 flex-1 rounded-full border text-sm font-medium ${
                          tipoAjuste === 'restar'
                            ? 'border-alerta bg-alerta text-white'
                            : 'border-linea text-tinta/70'
                        }`}
                      >
                        − Restar
                      </button>
                    </div>
                    <input
                      value={cantidadAjuste}
                      onChange={(e) => setCantidadAjuste(limpiarNumeroEscrito(e.target.value))}
                      inputMode="decimal"
                      placeholder="Cantidad"
                      className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
                    />
                    <input
                      value={motivoAjuste}
                      onChange={(e) => setMotivoAjuste(e.target.value)}
                      placeholder="Motivo (ej: conteo físico, producto vencido)"
                      className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
                    />
                    {mensajeErrorAjuste && <p className="text-sm text-alerta">{mensajeErrorAjuste}</p>}
                    <button
                      onClick={confirmarAjuste}
                      disabled={!formularioAjusteValido}
                      className="h-11 w-full rounded-lg bg-bodega text-sm font-semibold text-white disabled:opacity-40"
                    >
                      Confirmar ajuste
                    </button>
                  </div>
                )}

              {panelAbierto && (
                <button
                  type="button"
                  onClick={cerrarPaneles}
                  className="mx-2 mt-3 h-10 w-[calc(100%-1rem)] rounded-xl border border-linea text-sm font-semibold text-tinta/70"
                >
                  Cerrar
                </button>
              )}
              </li>
            );
          })}
        </ul>

        {productoMenu &&
          createPortal(
          // Se dibuja directamente en <body> (no dentro de la pantalla) para que quede
          // siempre pegado al borde inferior de lo que se VE, sin importar cuánto se
          // haya desplazado la lista.
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setMenuOpcionesId(null)}>
            <div
              role="dialog"
              aria-label={`Opciones de ${productoMenu.nombre}`}
              onClick={(e) => e.stopPropagation()}
              className="hoja-inferior w-full max-w-app rounded-t-2xl bg-white px-5 pb-6 pt-4 shadow-lg"
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-linea" />
              <p className="break-words text-sm font-extrabold text-bodega-oscuro">{productoMenu.nombre}</p>
              <div className="mt-3 space-y-2">
                <button
                  onClick={() => {
                    setMenuOpcionesId(null);
                    abrirEdicion(productoMenu);
                  }}
                  className="min-h-12 w-full rounded-xl border border-linea px-4 py-2 text-left text-sm font-semibold text-bodega-oscuro active:bg-papel"
                >
                  Editar
                </button>
                {productoMenu.tipo !== 'insumo' && productoMenu.controlaStock && (
                  <button
                    onClick={() => {
                      setMenuOpcionesId(null);
                      abrirAjuste(productoMenu);
                    }}
                    className="min-h-12 w-full rounded-xl border border-linea px-4 py-2 text-left text-sm font-semibold text-tinta active:bg-papel"
                  >
                    Ajustar Stock
                  </button>
                )}
                <button
                  onClick={() => {
                    setMenuOpcionesId(null);
                    alternarBitacora(productoMenu);
                  }}
                  className="min-h-12 w-full rounded-xl border border-linea px-4 py-2 text-left text-sm font-semibold text-tinta active:bg-papel"
                >
                  Bitácora (Historial)
                </button>
                <button
                  onClick={() => setMenuOpcionesId(null)}
                  className="min-h-12 w-full rounded-xl px-4 py-2 text-center text-sm font-semibold text-tinta-suave"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      </main>
    </div>
  );
}
