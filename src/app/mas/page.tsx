'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { TarjetaUsuarioActual } from '@/components/tarjeta-usuario-actual';
import { usarSesion } from '@/components/sesion-usuario';
import type { Permiso } from '@/core/permisos';
import { CLAVE_IMPRESORA_ACTIVA, IMPRESION_BLUETOOTH_DISPONIBLE } from '@/core/impresora';

interface Opcion {
  href: string;
  etiqueta: string;
  descripcion: string;
  /** Con el control de usuarios, la opción solo se muestra a quien tiene este permiso. */
  permiso?: Permiso;
  /** Solo se muestra cuando el control de usuarios rige. */
  soloConControl?: boolean;
}

const OPCIONES: Opcion[] = [
  { href: '/caja', etiqueta: 'Caja', descripcion: 'Saldo, ingresos y egresos' },
  { href: '/compras', etiqueta: 'Compras', descripcion: 'Registrar, modificar o anular compras a proveedor' },
  {
    href: '/mas/reportes',
    etiqueta: 'Reportes',
    descripcion: 'Ventas, fiados, compras, inventario y caja por rango de fechas',
  },
  { href: '/mas/clientes', etiqueta: 'Clientes', descripcion: 'Guardar clientes con su documento' },
  {
    href: '/mas/actividad',
    etiqueta: 'Actividad de usuarios',
    descripcion: 'Quién hizo qué: ventas por usuario, anulaciones, caja y cambios',
    permiso: 'administrar_usuarios',
    soloConControl: true,
  },
  { href: '/mas/proveedores', etiqueta: 'Proveedores', descripcion: 'Guardar proveedores con RUC y celular' },
  {
    href: '/mas/importar-datos',
    etiqueta: 'Importar Datos',
    descripcion: 'Productos, Clientes, Proveedores y Stock masivo, desde Excel (Premium)',
    permiso: 'importar_datos',
  },
  {
    href: '/mas/respaldo',
    etiqueta: 'Respaldo y exportación',
    descripcion: 'CSV, respaldo completo y restaurar',
    permiso: 'respaldo',
  },
  {
    href: '/mas/exportar-excel',
    etiqueta: 'Exportar todo a Excel',
    descripcion: 'Un solo Excel con todo tu negocio (Premium)',
    permiso: 'exportar',
  },
  {
    href: '/mas/configuracion',
    etiqueta: 'Configuración',
    descripcion: 'Configuración de venta (precio editable, stock bajo, venta por voz), usuarios, negocio e impresoras',
    permiso: 'configuracion',
  },
];

const OPCION_REIMPRIMIR: Opcion = {
  href: '/mas/reimprimir-documentos',
  etiqueta: 'Reimprimir documentos',
  descripcion: 'Buscar una venta pasada y volver a imprimir su comprobante',
};

const OPCION_ACERCA_DE: Opcion = {
  href: '/mas/acerca-de',
  etiqueta: 'Acerca de Vende Fácil',
  descripcion: 'Versión, sistema operativo y datos del desarrollador',
};

export default function PaginaMas() {
  const { contenedor } = usarContenedor();
  const { puede, controlVigente } = usarSesion();
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

  // "Acerca de Vende Fácil" siempre va al final de todas las opciones,
  // incluso debajo de "Reimprimir documentos" cuando esta aparece.
  const opciones = (
    mostrarReimprimir ? [...OPCIONES, OPCION_REIMPRIMIR, OPCION_ACERCA_DE] : [...OPCIONES, OPCION_ACERCA_DE]
  ).filter((opcion) => (!opcion.soloConControl || controlVigente === true) && (!opcion.permiso || puede(opcion.permiso)));

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-xl text-tinta/60" aria-label="Volver a inicio">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Más</h1>
      </header>

      <TarjetaUsuarioActual />

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
