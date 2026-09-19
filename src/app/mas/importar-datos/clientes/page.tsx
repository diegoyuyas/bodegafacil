'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import type { EstadoPlan } from '@/core/plan';
import {
  construirPlantillaImportarClientes,
  filaEstaVacia,
  marcarDuplicadosCliente,
  parsearFilaImportacionCliente,
  type FilaImportadaCliente,
} from '@/core/importacion-clientes';
import { generarLibroExcel, leerFilasExcel } from '@/infraestructura/exportacion/excel';
import { descargarExcel, leerArchivoComoBytes } from '@/infraestructura/exportacion/descargas';

interface Resultado {
  creados: number;
  conError: number;
}

export default function PaginaImportarClientes() {
  const { contenedor, cargando, error } = usarContenedor();
  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  const [filas, setFilas] = useState<FilaImportadaCliente[]>([]);
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    if (!contenedor) return;
    setEstadoPlan(contenedor.plan.obtenerEstado());
  }, [contenedor]);

  const esPremium = estadoPlan?.tipo === 'premium';
  const filasValidas = filas.filter((f) => f.datos !== null);
  const filasConError = filas.filter((f) => f.datos === null);

  async function descargarPlantilla() {
    const libro = generarLibroExcel([construirPlantillaImportarClientes()]);
    await descargarExcel('vende-facil-plantilla-clientes.xlsx', libro);
  }

  async function manejarArchivoSeleccionado(archivos: FileList | null) {
    const archivo = archivos?.[0];
    if (!archivo || !esPremium || !contenedor) return;

    setMensajeError(null);
    setResultado(null);
    setNombreArchivo(archivo.name);

    try {
      const bytes = await leerArchivoComoBytes(archivo);
      const todasLasFilas = leerFilasExcel(bytes);
      const filasDatos = todasLasFilas.slice(1);

      const procesadas: FilaImportadaCliente[] = [];
      filasDatos.forEach((valores, indice) => {
        if (filaEstaVacia(valores)) return;
        procesadas.push(parsearFilaImportacionCliente(valores, indice + 2));
      });

      const documentosExistentes = new Set(
        contenedor.clientes.listarTodos().map((c) => (c.documento ?? '').trim().toLowerCase()),
      );
      const conDuplicadosMarcados = marcarDuplicadosCliente(procesadas, documentosExistentes);

      setFilas(conDuplicadosMarcados);
      if (conDuplicadosMarcados.length === 0) {
        setMensajeError('No se encontraron filas con datos en el archivo.');
      }
    } catch (e) {
      setFilas([]);
      setMensajeError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    }
  }

  async function importar() {
    if (!contenedor || !esPremium) return;
    setImportando(true);
    let creados = 0;
    let conError = 0;

    for (const fila of filas) {
      if (!fila.datos) {
        conError += 1;
        continue;
      }
      try {
        contenedor.clientes.crear(fila.datos.nombre, fila.datos.documento, fila.datos.telefono);
        creados += 1;
      } catch {
        conError += 1;
      }
    }

    await contenedor.persistir();
    setResultado({ creados, conError });
    setFilas([]);
    setNombreArchivo(null);
    if (inputArchivoRef.current) inputArchivoRef.current.value = '';
    setImportando(false);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas/importar-datos" className="text-xl text-tinta/60" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Importar Clientes</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta/60">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      <p className="mt-4 text-sm text-tinta/70">
        Carga varios clientes de una sola vez: descarga la plantilla, complétala y súbela de vuelta.
      </p>

      {estadoPlan && !esPremium && (
        <section className="mt-6 rounded-xl border border-linea p-5 text-center">
          <p className="text-sm font-semibold text-tinta">Importar Clientes es una función Premium</p>
          <p className="mt-2 text-xs text-tinta/60">Actívala desde el panel de administrador.</p>
        </section>
      )}

      {esPremium && (
        <>
          <section className="mt-6">
            <p className="text-sm font-semibold text-tinta">1. Descarga la plantilla</p>
            <p className="mt-1 text-xs text-tinta/50">
              Columnas: nombre_cliente, documento, telefono. Nombre y documento son obligatorios; el
              documento no puede repetirse.
            </p>
            <button
              onClick={descargarPlantilla}
              className="mt-3 h-12 w-full rounded-xl border border-bodega text-sm font-semibold text-bodega active:bg-bodega-claro"
            >
              Descargar plantilla Excel ↓
            </button>
          </section>

          <section className="mt-8">
            <p className="text-sm font-semibold text-tinta">2. Sube el Excel completado</p>
            <input
              ref={inputArchivoRef}
              type="file"
              accept=".xlsx"
              onChange={(e) => manejarArchivoSeleccionado(e.target.files)}
              disabled={importando}
              className="mt-3 block w-full text-sm text-tinta/70"
            />
            {nombreArchivo && <p className="mt-2 text-xs text-tinta/50">Archivo: {nombreArchivo}</p>}
            {mensajeError && <p className="mt-2 text-sm text-alerta">{mensajeError}</p>}
          </section>

          {filas.length > 0 && (
            <section className="mt-8">
              <p className="text-sm font-semibold text-tinta">3. Revisa e importa</p>
              <p className="mt-1 text-xs text-tinta/60">
                {filasValidas.length} cliente(s) listos ·{' '}
                {filasConError.length > 0 && (
                  <span className="text-alerta">{filasConError.length} con error (no se importarán)</span>
                )}
                {filasConError.length === 0 && 'sin errores'}
              </p>

              <ul className="mt-3 max-h-72 divide-y divide-linea overflow-y-auto rounded-xl border border-linea">
                {filas.map((fila) => (
                  <li key={fila.numeroFila} className="p-3 text-xs">
                    {fila.datos ? (
                      <p className="text-tinta">
                        ✅ Fila {fila.numeroFila}: <span className="font-semibold">{fila.datos.nombre}</span> —{' '}
                        {fila.datos.documento}
                        {fila.datos.telefono ? ` · ${fila.datos.telefono}` : ''}
                      </p>
                    ) : (
                      <p className="text-alerta">
                        ❌ Fila {fila.numeroFila}: {fila.errores.join(' ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>

              <button
                onClick={importar}
                disabled={importando || filasValidas.length === 0}
                className="mt-4 h-12 w-full rounded-xl bg-bodega text-sm font-semibold text-white active:bg-bodega-oscuro disabled:opacity-50"
              >
                {importando ? 'Importando…' : `Importar ${filasValidas.length} cliente(s)`}
              </button>
            </section>
          )}

          {resultado && (
            <section className="mt-8 rounded-xl border border-linea p-4 text-sm">
              <p className="font-semibold text-tinta">Importación terminada</p>
              <p className="mt-1 text-tinta/70">{resultado.creados} cliente(s) creado(s).</p>
              {resultado.conError > 0 && (
                <p className="mt-1 text-alerta">{resultado.conError} fila(s) no se pudieron importar.</p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
