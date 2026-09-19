'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { CLAVE_IMPRESORA_ACTIVA, IMPRESION_BLUETOOTH_DISPONIBLE } from '@/core/impresora';

const OPCIONES = [
  { href: '/caja', etiqueta: 'Caja', descripcion: 'Saldo, ingresos y egresos' },
  { href: '/compras', etiqueta: 'Compras', descripcion: 'Reponer stock desde un proveedor' },
  {
    href: '/mas/reportes',
    etiqueta: 'Reportes',
    descripcion: 'Caja, compras y más vendidos por rango de fechas',
  },
  { href: '/mas/clientes', etiqueta: 'Clientes', descripcion: 'Guardar clientes con su documento' },
  { href: '/mas/proveedores', etiqueta: 'Proveedores', descripcion: 'Guardar proveedores con RUC y celular' },
  {
    href: '/mas/importar-datos',
    etiqueta: 'Importar Datos',
    descripcion: 'Productos, Clientes, Proveedores y Stock masivo, desde Excel (Premium)',
  },
  { href: '/mas/respaldo', etiqueta: 'Respaldo y exportación', descripcion: 'CSV, respaldo completo y restaurar' },
  {
    href: '/mas/exportar-excel',
    etiqueta: 'Exportar todo a Excel',
    descripcion: 'Un solo Excel con todo tu negocio (Premium)',
  },
  {
    href: '/mas/configuracion',
    etiqueta: 'Configuración',
    descripcion: 'Precio editable, notificación de stock bajo, tienda e impresoras',
  },
];

const OPCION_REIMPRIMIR = {
  href: '/mas/reimprimir-documentos',
  etiqueta: 'Reimprimir documentos',
  descripcion: 'Buscar una venta pasada y volver a imprimir su comprobante',
};

export default function PaginaMas() {
  const { contenedor } = usarContenedor();
  const [mostrarReimprimir, setMostrarReimprimir] = useState(false);

  useEffect(() => {
    if (!contenedor) return;
    // "Reimprimir documentos" solo aparece con Premium Y la impresora
    // Bluetooth activada en Más > Configuración > Configuración de
    // Impresoras — mientras no se cumplan las dos cosas, queda oculta
    // en vez de mostrarse deshabilitada.
    const esPremium = contenedor.plan.obtenerEstado().tipo === 'premium';
    const impresoraActiva = contenedor.configuracion.obtenerValor(CLAVE_IMPRESORA_ACTIVA) === '1';
    setMostrarReimprimir(IMPRESION_BLUETOOTH_DISPONIBLE && esPremium && impresoraActiva);
  }, [contenedor]);

  const opciones = mostrarReimprimir ? [...OPCIONES, OPCION_REIMPRIMIR] : OPCIONES;

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-xl text-tinta/60" aria-label="Volver a inicio">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Más</h1>
      </header>

      <ul className="mt-6 divide-y divide-linea border-y border-linea">
        {opciones.map((opcion) => (
          <li key={opcion.href}>
            <Link href={opcion.href} className="flex items-center justify-between py-4">
              <div>
                <p className="text-sm font-semibold text-tinta">{opcion.etiqueta}</p>
                <p className="text-xs text-tinta/50">{opcion.descripcion}</p>
              </div>
              <span className="text-tinta/40">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
