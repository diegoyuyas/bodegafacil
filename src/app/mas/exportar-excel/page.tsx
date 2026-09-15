'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import type { EstadoPlan } from '@/core/plan';
import { hoyLocalSql } from '@/core/tiempo';
import {
  construirHojaCaja,
  construirHojaClientes,
  construirHojaComprasDetallado,
  construirHojaProductos,
  construirHojaProveedores,
  construirHojaVentas,
} from '@/core/exportacion';
import { generarLibroExcel } from '@/infraestructura/exportacion/excel';
import { descargarExcel } from '@/infraestructura/exportacion/descargas';

function fechaParaNombreArchivo(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PaginaExportarExcel() {
  const { contenedor, cargando, error } = usarContenedor();
  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);

  useEffect(() => {
    if (!contenedor) return;
    setEstadoPlan(contenedor.plan.obtenerEstado());
  }, [contenedor]);

  const esPremium = estadoPlan?.tipo === 'premium';

  function exportarTodo() {
    if (!contenedor || !esPremium) return;
    const hoy = hoyLocalSql();
    const libro = generarLibroExcel([
      construirHojaVentas(contenedor.ventas.listarDetalleParaExportar()),
      construirHojaCaja(contenedor.caja.listarMovimientosPorRango('0001-01-01', hoy)),
      construirHojaComprasDetallado(contenedor.compras.listarDetalleParaExportar()),
      construirHojaProductos(contenedor.productos.listarTodos()),
      construirHojaClientes(contenedor.clientes.listarTodos()),
      construirHojaProveedores(contenedor.proveedores.listarTodos()),
    ]);
    descargarExcel(`venta-facil-completo-${fechaParaNombreArchivo()}.xlsx`, libro);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas" className="text-xl text-tinta/60" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Exportar todo a Excel</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta/60">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      <p className="mt-4 text-sm text-tinta/70">
        Genera un solo archivo Excel con todo tu negocio: productos, clientes, proveedores,
        ventas, caja y compras, cada uno en su propia pestaña.
      </p>

      {estadoPlan && !esPremium && (
        <section className="mt-6 rounded-xl border border-linea p-5 text-center">
          <p className="text-sm font-semibold text-tinta">Exportar todo a Excel es una función Premium</p>
          <p className="mt-2 text-xs text-tinta/60">Actívala desde el panel de administrador.</p>
        </section>
      )}

      {esPremium && (
        <button
          onClick={exportarTodo}
          className="mt-6 h-12 w-full rounded-xl bg-bodega text-sm font-semibold text-white active:bg-bodega-oscuro"
        >
          Descargar Excel completo ↓
        </button>
      )}
    </div>
  );
}
