'use client';

import Link from 'next/link';
import { usarContenedor } from '@/hooks/usar-contenedor';

export default function PaginaConfiguracion() {
  const { cargando, error } = usarContenedor();

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas" className="text-xl text-tinta-suave" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Configuración</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta-suave">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      <ul className="mt-6 divide-y divide-linea border-y border-linea">
        <li>
          <Link href="/mas/configuracion/configuracion-venta" className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-sm font-semibold text-tinta">Configuración de Venta</p>
              <p className="mt-0.5 text-xs text-tinta-suave">
                Precio editable, stock bajo, descripciones, venta por voz
              </p>
            </div>
            <span className="text-tinta-suave">›</span>
          </Link>
        </li>

        <li>
          <Link href="/mas/configuracion/pin" className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-sm font-semibold text-tinta">Configurar PIN</p>
              <p className="mt-0.5 text-xs text-tinta-suave">Pide un PIN de 4 dígitos para abrir la app.</p>
              <p className="mt-1 text-xs font-semibold text-acento-oscuro">Función Premium</p>
            </div>
            <span className="text-tinta-suave">›</span>
          </Link>
        </li>

        <li>
          <Link
            href="/mas/configuracion/administracion-usuarios"
            className="flex items-center justify-between gap-4 py-4"
          >
            <div>
              <p className="text-sm font-semibold text-tinta">Administración de Usuarios</p>
              <p className="mt-0.5 text-xs text-tinta-suave">Usuarios con contraseña: administrador y estándar.</p>
              <p className="mt-1 text-xs font-semibold text-acento-oscuro">Función Premium</p>
            </div>
            <span className="text-tinta-suave">›</span>
          </Link>
        </li>

        <li>
          <Link
            href="/mas/configuracion/backup-automatico"
            className="flex items-center justify-between gap-4 py-4"
          >
            <div>
              <p className="text-sm font-semibold text-tinta">Configurar Backup Automático</p>
              <p className="mt-0.5 text-xs text-tinta-suave">Respaldo periódico al almacenamiento del teléfono.</p>
              <p className="mt-1 text-xs font-semibold text-acento-oscuro">Función Premium</p>
            </div>
            <span className="text-tinta-suave">›</span>
          </Link>
        </li>
        <li>
          <Link
            href="/mas/configuracion/informacion-negocio"
            className="flex items-center justify-between gap-4 py-4"
          >
            <div>
              <p className="text-sm font-semibold text-tinta">Información del Negocio</p>
              <p className="mt-0.5 text-xs text-tinta-suave">Nombre, DNI/RUC, ubicación, contacto y leyenda.</p>
              <p className="mt-1 text-xs font-semibold text-acento-oscuro">Función Premium</p>
            </div>
            <span className="text-tinta-suave">›</span>
          </Link>
        </li>

        <li>
          <Link
            href="/mas/configuracion/configuracion-impresoras"
            className="flex items-center justify-between gap-4 py-4"
          >
            <div>
              <p className="text-sm font-semibold text-tinta">Configuración de Impresión</p>
              <p className="mt-0.5 text-xs text-tinta-suave">Series de Boleta y Factura, e impresora Bluetooth.</p>
              <p className="mt-1 text-xs font-semibold text-acento-oscuro">Función Premium</p>
            </div>
            <span className="text-tinta-suave">›</span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
