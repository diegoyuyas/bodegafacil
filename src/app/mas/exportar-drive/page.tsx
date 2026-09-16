'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import type { EstadoPlan } from '@/core/plan';
import { hoyLocalSql } from '@/core/tiempo';
import {
  construirHojaCaja,
  construirHojaClientes,
  construirHojaCompras,
  construirHojaProductos,
  construirHojaProveedores,
  construirHojaVentas,
} from '@/core/exportacion';
import { generarLibroExcel } from '@/infraestructura/exportacion/excel';
import { conectarConGoogle } from '@/infraestructura/google-drive/autenticacion';
import { subirArchivoADrive, type ArchivoSubido } from '@/infraestructura/google-drive/subir-archivo';

type Estado = 'inactivo' | 'conectando' | 'generando' | 'subiendo' | 'listo' | 'error';

function fechaParaNombreArchivo(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PaginaExportarDrive() {
  const { contenedor, cargando, error: errorContenedor } = usarContenedor();
  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [estado, setEstado] = useState<Estado>('inactivo');
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ArchivoSubido | null>(null);

  useEffect(() => {
    if (!contenedor) return;
    setEstadoPlan(contenedor.plan.obtenerEstado());
  }, [contenedor]);

  const esPremium = estadoPlan?.tipo === 'premium';

  async function exportarYSubir() {
    if (!contenedor || !esPremium) return;

    setMensajeError(null);
    setResultado(null);

    try {
      setEstado('conectando');
      const token = await conectarConGoogle();

      setEstado('generando');
      const hoy = hoyLocalSql();
      const libro = generarLibroExcel([
        construirHojaVentas(contenedor.ventas.listarDetalleParaExportar()),
        construirHojaCaja(contenedor.caja.listarMovimientosPorRango('0001-01-01', hoy)),
        construirHojaCompras(contenedor.compras.listarPorRango('0001-01-01', hoy)),
        construirHojaProductos(contenedor.productos.listarTodos()),
        construirHojaClientes(contenedor.clientes.listarTodos()),
        construirHojaProveedores(contenedor.proveedores.listarTodos()),
      ]);

      setEstado('subiendo');
      const subido = await subirArchivoADrive(
        token.accessToken,
        `venta-facil-completo-${fechaParaNombreArchivo()}.xlsx`,
        libro,
      );

      setResultado(subido);
      setEstado('listo');
    } catch (e) {
      setMensajeError(e instanceof Error ? e.message : 'Algo salió mal. Intenta de nuevo.');
      setEstado('error');
    }
  }

  const textoBoton: Record<Estado, string> = {
    inactivo: 'Conectar con Google y exportar',
    conectando: 'Esperando autorización de Google…',
    generando: 'Generando el Excel…',
    subiendo: 'Subiendo a tu Drive…',
    listo: 'Exportar de nuevo',
    error: 'Reintentar',
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas" className="text-xl text-tinta/60" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Exportar todo a Drive</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta/60">Cargando…</p>}
      {errorContenedor && <p className="mt-4 text-sm text-alerta">{errorContenedor.message}</p>}

      <p className="mt-4 text-sm text-tinta/70">
        Genera un solo archivo Excel con todo tu negocio — productos, clientes, proveedores,
        ventas, caja y compras — y lo guarda directamente en tu propio Google Drive. Necesitas
        internet solo en el momento de exportar.
      </p>

      {estadoPlan && !esPremium && (
        <section className="mt-6 rounded-xl border border-linea p-5 text-center">
          <p className="text-sm font-semibold text-tinta">Exportar a Drive es una función Premium</p>
          <p className="mt-2 text-xs text-tinta/60">Actívala desde el panel de administrador.</p>
        </section>
      )}

      {esPremium && (
        <>
          <button
            onClick={exportarYSubir}
            disabled={estado === 'conectando' || estado === 'generando' || estado === 'subiendo'}
            className="mt-6 h-12 w-full rounded-xl bg-bodega text-sm font-semibold text-white active:bg-bodega-oscuro disabled:opacity-60"
          >
            {textoBoton[estado]}
          </button>

          <p className="mt-3 text-center text-xs text-tinta/40">
            Al conectar, Google te pedirá iniciar sesión o elegir tu cuenta. Vende Fácil solo
            recibe permiso para crear este archivo en tu Drive — nunca ve tu contraseña ni el
            resto de tus archivos.
          </p>

          {estado === 'listo' && resultado && (
            <section className="mt-6 rounded-xl border border-bodega/40 bg-bodega-claro/30 p-4 text-center">
              <p className="text-sm font-semibold text-bodega-oscuro">¡Listo! Se subió a tu Drive.</p>
              <a
                href={resultado.enlaceWeb}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm font-semibold text-bodega-oscuro underline"
              >
                Abrir archivo en Drive
              </a>
            </section>
          )}

          {estado === 'error' && mensajeError && (
            <p className="mt-4 text-sm text-alerta">{mensajeError}</p>
          )}
        </>
      )}
    </div>
  );
}
