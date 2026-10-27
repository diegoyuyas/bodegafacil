'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdministracionUsuarios } from '@/components/administracion-usuarios';
import { usarSesion } from '@/components/sesion-usuario';
import { usarContenedor } from '@/hooks/usar-contenedor';

export default function PaginaAdministracionUsuarios() {
  const { contenedor, cargando, error } = usarContenedor();
  const sesion = usarSesion();
  const [esPremium, setEsPremium] = useState<boolean | null>(null);

  useEffect(() => {
    if (!contenedor) return;
    setEsPremium(contenedor.plan.obtenerEstado().tipo === 'premium');
  }, [contenedor]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas/configuracion" className="text-xl text-tinta/60" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Administración de Usuarios</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta/60">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      {contenedor && esPremium !== null && (
        <AdministracionUsuarios
          usuarios={contenedor.usuarios}
          esPremium={esPremium}
          persistir={contenedor.persistir}
          usuarioActual={sesion.controlVigente ? sesion.usuario : undefined}
          onSesionIniciada={sesion.iniciarSesion}
          onControlCambiado={sesion.refrescar}
        />
      )}
    </div>
  );
}
