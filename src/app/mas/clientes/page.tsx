'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import { CLAVE_MONEDA, formatearMonto, obtenerSimboloMoneda } from '@/core/moneda';
import { CLAVE_PREFIJO_PAIS, obtenerPrefijoPais } from '@/core/paises';
import type { Cliente } from '@/core/tipos';

export default function PaginaClientes() {
  const { contenedor, cargando, error } = usarContenedor();
  const [simboloMoneda, setSimboloMoneda] = useState(obtenerSimboloMoneda(null));
  const [prefijoPais, setPrefijoPais] = useState(obtenerPrefijoPais(null));
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [busqueda, setBusqueda] = useState('');
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

  function recargar() {
    if (!contenedor) return;
    setClientes(contenedor.clientes.listarTodos());
    setSimboloMoneda(obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)));
    setPrefijoPais(obtenerPrefijoPais(contenedor.configuracion.obtenerValor(CLAVE_PREFIJO_PAIS)));
  }

  useEffect(recargar, [contenedor]);

  const clientesFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return clientes;
    return clientes.filter((c) => {
      if (c.nombre.toLowerCase().includes(texto)) return true;
      if ((c.documento ?? '').toLowerCase().includes(texto)) return true;
      if ((c.telefono ?? '').toLowerCase().includes(texto)) return true;
      return false;
    });
  }, [clientes, busqueda]);

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
    } catch (e) {
      setMensajeErrorEdit(e instanceof ErrorDeNegocio ? e.message : 'No se pudo guardar el cliente.');
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas" className="text-xl text-tinta/60" aria-label="Volver">
          ←
        </Link>
        <h1 className="flex-1 text-lg font-extrabold text-bodega-oscuro">Clientes</h1>
        <button
          onClick={() => {
            setEditandoId(null);
            setMostrarFormulario((v) => !v);
          }}
          className="text-sm font-semibold text-bodega-oscuro"
        >
          {mostrarFormulario ? 'Cancelar' : '+ Agregar'}
        </button>
      </header>

      {mostrarFormulario && (
        <section className="mt-4 space-y-3 rounded-xl border border-linea p-4">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre completo (ej: Diego Carrasco)"
            className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
          />
          <div>
            <input
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder="Documento (hasta 15 caracteres, ej: 12345678)"
              maxLength={15}
              className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
            />
            {documento.length > 0 && !documentoValido && (
              <p className="mt-1 text-xs text-alerta">
                Solo letras y números, hasta 15 caracteres ({documento.trim().length}/15)
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <span className="flex h-11 shrink-0 items-center rounded-lg border border-linea bg-papel px-3 text-sm text-tinta/60">
              +{prefijoPais}
            </span>
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Celular (opcional)"
              inputMode="numeric"
              className="h-11 flex-1 rounded-lg border border-linea px-3 text-sm"
            />
          </div>
          {mensajeError && <p className="text-sm text-alerta">{mensajeError}</p>}
          <button
            onClick={guardarCliente}
            disabled={!formularioValido}
            className="h-11 w-full rounded-lg bg-bodega text-sm font-semibold text-white disabled:opacity-40"
          >
            Guardar cliente
          </button>
        </section>
      )}

      {clientes.length > 0 && (
        <div className="mt-4">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, DNI o celular…"
            className="h-11 w-full rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
          />
        </div>
      )}

      <main className="mt-6 flex-1">
        {cargando && <p className="text-sm text-tinta/60">Cargando…</p>}
        {error && <p className="text-sm text-alerta">{error.message}</p>}

        {!cargando && clientes.length === 0 && (
          <p className="border-y border-linea py-6 text-center text-sm text-tinta/50">
            Todavía no tienes clientes guardados. Agrega el primero arriba.
          </p>
        )}

        {!cargando && clientes.length > 0 && clientesFiltrados.length === 0 && (
          <p className="border-y border-linea py-6 text-center text-sm text-tinta/50">
            Ningún cliente coincide con &quot;{busqueda}&quot;.
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
                  <p className="text-xs text-tinta/50">
                    {cliente.documento ?? 'Sin documento'}
                    {cliente.telefono && ` · ${cliente.telefono}`}
                    {cliente.saldoPendiente > 0 && (
                      <span className="text-alerta"> · Debe {formatearMonto(cliente.saldoPendiente, simboloMoneda)}</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() =>
                    editandoId === cliente.id ? cancelarEdicion() : abrirEdicion(cliente)
                  }
                  className="shrink-0 text-sm font-semibold text-bodega-oscuro"
                >
                  {editandoId === cliente.id ? 'Cancelar' : 'Editar'}
                </button>
              </div>

              {editandoId === cliente.id && (
                <div className="mt-3 space-y-3 rounded-xl border border-linea p-4">
                  <input
                    value={nombreEdit}
                    onChange={(e) => setNombreEdit(e.target.value)}
                    placeholder="Nombre completo"
                    className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
                  />
                  <div>
                    <input
                      value={documentoEdit}
                      onChange={(e) => setDocumentoEdit(e.target.value)}
                      placeholder="Documento (hasta 15 caracteres)"
                      maxLength={15}
                      className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
                    />
                    {documentoEdit.length > 0 && !documentoEditValido && (
                      <p className="mt-1 text-xs text-alerta">
                        Solo letras y números, hasta 15 caracteres ({documentoEdit.trim().length}/15)
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <span className="flex h-11 shrink-0 items-center rounded-lg border border-linea bg-papel px-3 text-sm text-tinta/60">
                      +{prefijoPais}
                    </span>
                    <input
                      value={telefonoEdit}
                      onChange={(e) => setTelefonoEdit(e.target.value)}
                      placeholder="Celular (opcional)"
                      inputMode="numeric"
                      className="h-11 flex-1 rounded-lg border border-linea px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-tinta/50">Estado</label>
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
                  <button
                    onClick={guardarEdicion}
                    disabled={!formularioEditValido}
                    className="h-11 w-full rounded-lg bg-bodega text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Guardar cambios
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
