'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { usarAvisos } from '@/components/proveedor-avisos';
import { EsqueletoLista } from '@/components/ui/esqueleto';
import { EstadoVacio } from '@/components/ui/estado-vacio';
import { IconoClientes, IconoWhatsApp } from '@/components/ui/iconos';
import { AVISOS, estadoLista } from '@/core/avisos';
import { usarPermisos } from '@/hooks/usar-permisos';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import { soloAlfanumericoAlEscribir, soloDigitosAlEscribir, soloLetrasAlEscribir } from '@/core/texto';
import { CLAVE_MONEDA, formatearMonto, obtenerSimboloMoneda } from '@/core/moneda';
import { CLAVE_PREFIJO_PAIS, obtenerPrefijoPais } from '@/core/paises';
import type { EstadoPlan } from '@/core/plan';
import { construirEnlaceChatWhatsApp } from '@/infraestructura/whatsapp/enlace';
import type { Cliente } from '@/core/tipos';
import { SelectorEstado, filtrarPorEstado, type FiltroEstado } from '@/components/selector-estado';
import { EtiquetaCampo, VentanaFormulario } from '@/components/ventana-formulario';

export default function PaginaClientes() {
  const { contenedor, cargando, error } = usarContenedor();
  const { avisar } = usarAvisos();
  const { pedirPermiso, modalPermiso } = usarPermisos(contenedor);
  const [simboloMoneda, setSimboloMoneda] = useState(obtenerSimboloMoneda(null));
  const [prefijoPais, setPrefijoPais] = useState(obtenerPrefijoPais(null));
  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('activos');
  const [nombre, setNombre] = useState('');
  const [documento, setDocumento] = useState('');
  const [telefono, setTelefono] = useState('');
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nombreEdit, setNombreEdit] = useState('');
  const [documentoEdit, setDocumentoEdit] = useState('');
  const [telefonoEdit, setTelefonoEdit] = useState('');
  const [activoEdit, setActivoEdit] = useState(true);
  const [mensajeErrorEdit, setMensajeErrorEdit] = useState<string | null>(null);

  const [listaLista, setListaLista] = useState(false);

  function recargar() {
    if (!contenedor) return;
    setListaLista(true);
    setClientes(contenedor.clientes.listarTodos());
    setSimboloMoneda(obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)));
    setPrefijoPais(obtenerPrefijoPais(contenedor.configuracion.obtenerValor(CLAVE_PREFIJO_PAIS)));
    setEstadoPlan(contenedor.plan.obtenerEstado());
  }

  const esPremium = estadoPlan?.tipo === 'premium';

  // Abre el chat de WhatsApp de ese cliente (sin mensaje escrito). Solo Premium.
  function abrirChatWhatsApp(telefonoCliente: string) {
    window.open(construirEnlaceChatWhatsApp(telefonoCliente, prefijoPais), '_blank');
  }

  useEffect(recargar, [contenedor]);

  const clientesFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const base = filtrarPorEstado(clientes, filtroEstado);
    if (!texto) return base;
    return base.filter((c) => {
      if (c.nombre.toLowerCase().includes(texto)) return true;
      if ((c.documento ?? '').toLowerCase().includes(texto)) return true;
      if ((c.telefono ?? '').toLowerCase().includes(texto)) return true;
      return false;
    });
  }, [clientes, busqueda, filtroEstado]);

  const estadoClientes = estadoLista({
    cargando: cargando || (!listaLista && !error),
    total: clientes.length,
    visibles: clientesFiltrados.length,
  });

  const documentoValido = /^[A-Za-z0-9]{1,15}$/.test(documento.trim());
  const formularioValido = nombre.trim().length > 0 && documentoValido;

  async function guardarCliente() {
    if (!contenedor) return;
    setMensajeError(null);
    try {
      contenedor.clientes.crear(nombre.trim(), documento.trim(), telefono.trim() || null);
      await contenedor.persistir();
      setNombre('');
      setDocumento('');
      setTelefono('');
      setMostrarFormulario(false);
      recargar();
      avisar(AVISOS.clienteGuardado, { vibrar: 'guardar' });
    } catch (e) {
      setMensajeError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo guardar el cliente.');
    }
  }

  function abrirEdicion(cliente: Cliente) {
    setMostrarFormulario(false);
    setEditandoId(cliente.id);
    setNombreEdit(cliente.nombre);
    setDocumentoEdit(cliente.documento ?? '');
    setTelefonoEdit(cliente.telefono ?? '');
    setActivoEdit(cliente.activo);
    setMensajeErrorEdit(null);
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setMensajeErrorEdit(null);
  }

  const documentoEditValido = /^[A-Za-z0-9]{1,15}$/.test(documentoEdit.trim());
  const formularioEditValido = nombreEdit.trim().length > 0 && documentoEditValido;

  async function guardarEdicion() {
    if (!contenedor || editandoId === null) return;
    setMensajeErrorEdit(null);
    if (!(await pedirPermiso('modificar_cliente', 'guardar los cambios del cliente'))) return;
    try {
      contenedor.clientes.actualizar(editandoId, {
        nombre: nombreEdit.trim(),
        documento: documentoEdit.trim(),
        telefono: telefonoEdit.trim() || null,
        activo: activoEdit,
      });
      await contenedor.persistir();
      setEditandoId(null);
      recargar();
      avisar(AVISOS.clienteActualizado, { vibrar: 'guardar' });
    } catch (e) {
      setMensajeErrorEdit(e instanceof ErrorDeNegocio ? e.message : 'No se pudo guardar el cliente.');
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      {modalPermiso}
      <header className="flex items-center gap-3">
        <Link href="/" className="text-xl text-tinta-suave" aria-label="Volver a inicio">
          ←
        </Link>
        <h1 className="flex-1 text-lg font-extrabold text-bodega-oscuro">Clientes</h1>
        <button
          onClick={() => {
            setEditandoId(null);
            setMostrarFormulario(true);
          }}
          className="rounded-full bg-green-600 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white active:bg-green-700"
        >
          Nuevo cliente
        </button>
      </header>

      {mostrarFormulario && (
        <VentanaFormulario titulo="Nuevo cliente" onCerrar={() => setMostrarFormulario(false)}>
          <div>
            <EtiquetaCampo>Nombre Completo (solo letras):</EtiquetaCampo>
            <input
              value={nombre}
              onChange={(e) => setNombre(soloLetrasAlEscribir(e.target.value))}
              autoCapitalize="characters"
              className="uppercase h-11 w-full rounded-lg border border-linea px-3 text-sm"
            />
          </div>
          <div>
            <EtiquetaCampo>Documento (hasta 15 caracteres, ej: 12345678):</EtiquetaCampo>
            <input
              value={documento}
              onChange={(e) => setDocumento(soloAlfanumericoAlEscribir(e.target.value))}
              maxLength={15}
              className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
            />
            {documento.length > 0 && !documentoValido && (
              <p className="mt-1 text-xs text-alerta">
                Solo letras y números, hasta 15 caracteres ({documento.trim().length}/15)
              </p>
            )}
          </div>
          <div>
            <EtiquetaCampo>Celular (opcional):</EtiquetaCampo>
            <div className="flex gap-2">
              <span className="flex h-11 shrink-0 items-center rounded-lg border border-linea bg-papel px-3 text-sm text-tinta-suave">
                +{prefijoPais}
              </span>
              <input
                value={telefono}
                onChange={(e) => setTelefono(soloDigitosAlEscribir(e.target.value))}
                inputMode="numeric"
                className="h-11 min-w-0 flex-1 rounded-lg border border-linea px-3 text-sm"
              />
            </div>
          </div>
          {mensajeError && <p className="text-sm text-alerta">{mensajeError}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => setMostrarFormulario(false)}
              className="h-11 flex-1 rounded-lg border border-linea text-sm font-semibold text-tinta/70"
            >
              Cancelar
            </button>
            <button
              onClick={guardarCliente}
              disabled={!formularioValido}
              className="h-11 flex-1 rounded-lg bg-bodega text-sm font-semibold text-white disabled:opacity-40"
            >
              Guardar cliente
            </button>
          </div>
        </VentanaFormulario>
      )}

      {editandoId !== null && (
        <VentanaFormulario titulo="Editar cliente" onCerrar={cancelarEdicion}>
          <div>
            <EtiquetaCampo>Nombre Completo (solo letras):</EtiquetaCampo>
            <input
              value={nombreEdit}
              onChange={(e) => setNombreEdit(soloLetrasAlEscribir(e.target.value))}
              autoCapitalize="characters"
              className="uppercase h-11 w-full rounded-lg border border-linea px-3 text-sm"
            />
          </div>
          <div>
            <EtiquetaCampo>Documento (hasta 15 caracteres, ej: 12345678):</EtiquetaCampo>
            <input
              value={documentoEdit}
              onChange={(e) => setDocumentoEdit(soloAlfanumericoAlEscribir(e.target.value))}
              maxLength={15}
              className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
            />
            {documentoEdit.length > 0 && !documentoEditValido && (
              <p className="mt-1 text-xs text-alerta">
                Solo letras y números, hasta 15 caracteres ({documentoEdit.trim().length}/15)
              </p>
            )}
          </div>
          <div>
            <EtiquetaCampo>Celular (opcional):</EtiquetaCampo>
            <div className="flex gap-2">
              <span className="flex h-11 shrink-0 items-center rounded-lg border border-linea bg-papel px-3 text-sm text-tinta-suave">
                +{prefijoPais}
              </span>
              <input
                value={telefonoEdit}
                onChange={(e) => setTelefonoEdit(soloDigitosAlEscribir(e.target.value))}
                inputMode="numeric"
                className="h-11 min-w-0 flex-1 rounded-lg border border-linea px-3 text-sm"
              />
            </div>
          </div>
          <div>
            <EtiquetaCampo>Estado:</EtiquetaCampo>
            <select
              value={activoEdit ? 'activo' : 'inactivo'}
              onChange={(e) => setActivoEdit(e.target.value === 'activo')}
              className="h-11 w-full rounded-lg border border-linea bg-white px-3 text-sm"
            >
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </div>
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

      {clientes.length > 0 && (
        <div className="mt-4 flex gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, DNI o celular…"
            className="h-11 min-w-0 flex-1 rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
          />
          <SelectorEstado valor={filtroEstado} onCambiar={setFiltroEstado} />
        </div>
      )}

      <main className="mt-6 flex-1">
        {error && <p className="text-sm text-alerta">{error.message}</p>}

        {estadoClientes === 'cargando' && !error && <EsqueletoLista />}

        {estadoClientes === 'vacia' && (
          <EstadoVacio
            icono={<IconoClientes tamano={40} />}
            titulo="Aún no tienes clientes guardados"
            descripcion="Guárdalos con su documento y teléfono para venderles al fiado."
            textoAccion="Agregar el primero"
            onAccion={() => {
              setEditandoId(null);
              setMostrarFormulario(true);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {estadoClientes === 'sin_resultados' && (
          <p className="border-y border-linea py-6 text-center text-sm text-tinta-suave">
            {busqueda.trim()
              ? `Ningún cliente coincide con "${busqueda}".`
              : `No hay clientes ${filtroEstado === 'inactivos' ? 'inactivos' : 'activos'}.`}
          </p>
        )}

        <ul className="divide-y divide-linea border-y border-linea">
          {clientesFiltrados.map((cliente) => (
            <li key={cliente.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-tinta">
                    {cliente.nombre}
                    {!cliente.activo && (
                      <span className="ml-2 rounded-full bg-alerta/10 px-2 py-0.5 text-xs font-semibold text-alerta">
                        Inactivo
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-tinta-suave">
                    {cliente.documento ?? 'Sin documento'}
                    {cliente.telefono && ` · ${cliente.telefono}`}
                    {cliente.saldoPendiente > 0 && (
                      <span className="text-alerta"> · Debe {formatearMonto(cliente.saldoPendiente, simboloMoneda)}</span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {cliente.telefono && (
                    <button
                      onClick={() => abrirChatWhatsApp(cliente.telefono as string)}
                      disabled={!esPremium}
                      title={!esPremium ? 'Función Premium' : undefined}
                      className="group inline-flex items-center gap-1 text-sm font-semibold text-bodega-oscuro disabled:text-tinta/30"
                    >
                      <IconoWhatsApp tamano={18} className="text-[#25D366] group-disabled:opacity-40" />
                      {esPremium ? 'WhatsApp' : '🔒 WhatsApp'}
                    </button>
                  )}
                  <button
                    onClick={() => abrirEdicion(cliente)}
                    className="text-sm font-semibold text-bodega-oscuro"
                  >
                    Editar
                  </button>
                </div>
              </div>

            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
