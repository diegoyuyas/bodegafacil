'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import type { Cliente } from '@/core/tipos';

export default function PaginaClientes() {
  const { contenedor, cargando, error } = usarContenedor();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [nombre, setNombre] = useState('');
  const [documento, setDocumento] = useState('');
  const [telefono, setTelefono] = useState('');
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  function recargar() {
    if (contenedor) setClientes(contenedor.clientes.listarActivos());
  }

  useEffect(recargar, [contenedor]);

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

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas" className="text-xl text-tinta/60" aria-label="Volver">
          ←
        </Link>
        <h1 className="flex-1 text-lg font-extrabold text-bodega-oscuro">Clientes</h1>
        <button
          onClick={() => setMostrarFormulario((v) => !v)}
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
          <input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="Teléfono (opcional)"
            className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
          />
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

      <main className="mt-6 flex-1">
        {cargando && <p className="text-sm text-tinta/60">Cargando…</p>}
        {error && <p className="text-sm text-alerta">{error.message}</p>}

        {!cargando && clientes.length === 0 && (
          <p className="border-y border-linea py-6 text-center text-sm text-tinta/50">
            Todavía no tienes clientes guardados. Agrega el primero arriba.
          </p>
        )}

        <ul className="divide-y divide-linea border-y border-linea">
          {clientes.map((cliente) => (
            <li key={cliente.id} className="py-3">
              <p className="text-sm text-tinta">{cliente.nombre}</p>
              <p className="text-xs text-tinta/50">
                {cliente.documento ?? 'Sin documento'}
                {cliente.telefono && ` · ${cliente.telefono}`}
                {cliente.saldoPendiente > 0 && (
                  <span className="text-alerta"> · Debe S/ {cliente.saldoPendiente.toFixed(2)}</span>
                )}
              </p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
