'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import { mayusculasAlEscribir } from '@/core/texto';
import type { Proveedor } from '@/core/tipos';
import { SelectorEstado, filtrarPorEstado, type FiltroEstado } from '@/components/selector-estado';
import { CLAVE_PREFIJO_PAIS, obtenerPrefijoPais } from '@/core/paises';
import type { EstadoPlan } from '@/core/plan';
import { construirEnlaceChatWhatsApp } from '@/infraestructura/whatsapp/enlace';

export default function PaginaProveedores() {
  const { contenedor, cargando, error } = usarContenedor();
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [prefijoPais, setPrefijoPais] = useState(obtenerPrefijoPais(null));
  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('activos');
  const [nombre, setNombre] = useState('');
  const [ruc, setRuc] = useState('');
  const [celular, setCelular] = useState('');
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nombreEdit, setNombreEdit] = useState('');
  const [rucEdit, setRucEdit] = useState('');
  const [celularEdit, setCelularEdit] = useState('');
  const [activoEdit, setActivoEdit] = useState(true);
  const [mensajeErrorEdit, setMensajeErrorEdit] = useState<string | null>(null);

  function recargar() {
    if (!contenedor) return;
    setProveedores(contenedor.proveedores.listarTodos());
    setPrefijoPais(obtenerPrefijoPais(contenedor.configuracion.obtenerValor(CLAVE_PREFIJO_PAIS)));
    setEstadoPlan(contenedor.plan.obtenerEstado());
  }

  const esPremium = estadoPlan?.tipo === 'premium';

  // Abre el chat de WhatsApp de ese proveedor (sin mensaje escrito). Solo Premium.
  function abrirChatWhatsApp(telefonoProveedor: string) {
    window.open(construirEnlaceChatWhatsApp(telefonoProveedor, prefijoPais), '_blank');
  }

  useEffect(recargar, [contenedor]);

  const proveedoresFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const base = filtrarPorEstado(proveedores, filtroEstado);
    if (!texto) return base;
    return base.filter((p) => {
      if (p.nombre.toLowerCase().includes(texto)) return true;
      if ((p.ruc ?? '').toLowerCase().includes(texto)) return true;
      if ((p.telefono ?? '').toLowerCase().includes(texto)) return true;
      return false;
    });
  }, [proveedores, busqueda, filtroEstado]);

  const rucValido = ruc.trim() === '' || /^[A-Za-z0-9]{1,15}$/.test(ruc.trim());
  const celularValido = celular.trim() === '' || /^[0-9]{6,12}$/.test(celular.trim());
  const formularioValido = nombre.trim().length > 0 && rucValido && celularValido;

  async function guardarProveedor() {
    if (!contenedor) return;
    setMensajeError(null);
    try {
      contenedor.proveedores.crear(nombre.trim(), ruc.trim() || null, celular.trim() || null);
      await contenedor.persistir();
      setNombre('');
      setRuc('');
      setCelular('');
      setMostrarFormulario(false);
      recargar();
    } catch (e) {
      setMensajeError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo guardar el proveedor.');
    }
  }

  function abrirEdicion(proveedor: Proveedor) {
    setMostrarFormulario(false);
    setEditandoId(proveedor.id);
    setNombreEdit(proveedor.nombre);
    setRucEdit(proveedor.ruc ?? '');
    setCelularEdit(proveedor.telefono ?? '');
    setActivoEdit(proveedor.activo);
    setMensajeErrorEdit(null);
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setMensajeErrorEdit(null);
  }

  const rucEditValido = rucEdit.trim() === '' || /^[A-Za-z0-9]{1,15}$/.test(rucEdit.trim());
  const celularEditValido = celularEdit.trim() === '' || /^[0-9]{6,12}$/.test(celularEdit.trim());
  const formularioEditValido = nombreEdit.trim().length > 0 && rucEditValido && celularEditValido;

  async function guardarEdicion() {
    if (!contenedor || editandoId === null) return;
    setMensajeErrorEdit(null);
    try {
      contenedor.proveedores.actualizar(editandoId, {
        nombre: nombreEdit.trim(),
        ruc: rucEdit.trim() || null,
        telefono: celularEdit.trim() || null,
        activo: activoEdit,
      });
      await contenedor.persistir();
      setEditandoId(null);
      recargar();
    } catch (e) {
      setMensajeErrorEdit(e instanceof ErrorDeNegocio ? e.message : 'No se pudo guardar el proveedor.');
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas" className="text-xl text-tinta/60" aria-label="Volver">
          ←
        </Link>
        <h1 className="flex-1 text-lg font-extrabold text-bodega-oscuro">Proveedores</h1>
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
            onChange={(e) => setNombre(mayusculasAlEscribir(e.target.value))}
            autoCapitalize="characters"
            placeholder="Nombre del proveedor"
            className="uppercase placeholder:normal-case h-11 w-full rounded-lg border border-linea px-3 text-sm"
          />
          <div>
            <input
              value={ruc}
              onChange={(e) => setRuc(e.target.value)}
              placeholder="RUC (opcional, hasta 15 caracteres)"
              maxLength={15}
              className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
            />
            {!rucValido && <p className="mt-1 text-xs text-alerta">Solo letras y números, hasta 15 caracteres.</p>}
          </div>
          <div>
            <input
              value={celular}
              onChange={(e) => setCelular(e.target.value)}
              inputMode="numeric"
              placeholder="Celular (opcional)"
              maxLength={12}
              className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
            />
            {!celularValido && <p className="mt-1 text-xs text-alerta">Solo números, entre 6 y 12 dígitos.</p>}
          </div>
          {mensajeError && <p className="text-sm text-alerta">{mensajeError}</p>}
          <button
            onClick={guardarProveedor}
            disabled={!formularioValido}
            className="h-11 w-full rounded-lg bg-bodega text-sm font-semibold text-white disabled:opacity-40"
          >
            Guardar proveedor
          </button>
        </section>
      )}

      {proveedores.length > 0 && (
        <div className="mt-4 flex gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, RUC o celular…"
            className="h-11 min-w-0 flex-1 rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
          />
          <SelectorEstado valor={filtroEstado} onCambiar={setFiltroEstado} />
        </div>
      )}

      <main className="mt-6 flex-1">
        {cargando && <p className="text-sm text-tinta/60">Cargando…</p>}
        {error && <p className="text-sm text-alerta">{error.message}</p>}

        {!cargando && proveedores.length === 0 && (
          <p className="border-y border-linea py-6 text-center text-sm text-tinta/50">
            Todavía no tienes proveedores guardados. Agrega el primero arriba.
          </p>
        )}

        {!cargando && proveedores.length > 0 && proveedoresFiltrados.length === 0 && (
          <p className="border-y border-linea py-6 text-center text-sm text-tinta/50">
            {busqueda.trim()
              ? `Ningún proveedor coincide con "${busqueda}".`
              : `No hay proveedores ${filtroEstado === 'inactivos' ? 'inactivos' : 'activos'}.`}
          </p>
        )}

        <ul className="divide-y divide-linea border-y border-linea">
          {proveedoresFiltrados.map((proveedor) => (
            <li key={proveedor.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-tinta">
                    {proveedor.nombre}
                    {!proveedor.activo && (
                      <span className="ml-2 rounded-full bg-alerta/10 px-2 py-0.5 text-xs font-semibold text-alerta">
                        Inactivo
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-tinta/50">
                    {proveedor.ruc ? `RUC ${proveedor.ruc}` : 'Sin RUC'}
                    {proveedor.telefono && ` · ${proveedor.telefono}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {proveedor.telefono && (
                    <button
                      onClick={() => abrirChatWhatsApp(proveedor.telefono as string)}
                      disabled={!esPremium}
                      title={!esPremium ? 'Función Premium' : undefined}
                      className="text-sm font-semibold text-bodega-oscuro disabled:text-tinta/30"
                    >
                      {esPremium ? 'WhatsApp' : '🔒 WhatsApp'}
                    </button>
                  )}
                  <button
                    onClick={() =>
                      editandoId === proveedor.id ? cancelarEdicion() : abrirEdicion(proveedor)
                    }
                    className="text-sm font-semibold text-bodega-oscuro"
                  >
                    {editandoId === proveedor.id ? 'Cancelar' : 'Editar'}
                  </button>
                </div>
              </div>

              {editandoId === proveedor.id && (
                <div className="mt-3 space-y-3 rounded-xl border border-linea p-4">
                  <input
                    value={nombreEdit}
                    onChange={(e) => setNombreEdit(mayusculasAlEscribir(e.target.value))}
                    autoCapitalize="characters"
                    placeholder="Nombre del proveedor"
                    className="uppercase placeholder:normal-case h-11 w-full rounded-lg border border-linea px-3 text-sm"
                  />
                  <div>
                    <input
                      value={rucEdit}
                      onChange={(e) => setRucEdit(e.target.value)}
                      placeholder="RUC (opcional, hasta 15 caracteres)"
                      maxLength={15}
                      className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
                    />
                    {!rucEditValido && (
                      <p className="mt-1 text-xs text-alerta">Solo letras y números, hasta 15 caracteres.</p>
                    )}
                  </div>
                  <div>
                    <input
                      value={celularEdit}
                      onChange={(e) => setCelularEdit(e.target.value)}
                      inputMode="numeric"
                      placeholder="Celular (opcional)"
                      maxLength={12}
                      className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
                    />
                    {!celularEditValido && (
                      <p className="mt-1 text-xs text-alerta">Solo números, entre 6 y 12 dígitos.</p>
                    )}
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
