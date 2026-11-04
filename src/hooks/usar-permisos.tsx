'use client';

import { useCallback, useRef, useState } from 'react';
import { EnCuerpo } from '@/components/en-cuerpo';
import { PuertaAdministrador } from '@/components/puerta-administrador';
import { usarSesion } from '@/components/sesion-usuario';
import { categoriaPinDe, esAutorizablePuntualmente, mensajeSoloAdministrador, type Permiso } from '@/core/permisos';
import type { Usuario } from '@/core/usuarios';
import type { ContenedorRepositorios } from '@/infraestructura/sqlite/contenedor';
import { usarSolicitudPin } from './usar-solicitud-pin';

interface Autorizacion {
  permiso: Permiso;
  accion: string;
  administradores: Usuario[];
}

/**
 * Pide permiso para una acción delicada (anular, modificar, caja...). Reemplaza a `usarSolicitudPin`:
 *
 *   const { pedirPermiso, modalPermiso } = usarPermisos(contenedor);
 *   ...
 *   if (!(await pedirPermiso('anular_venta', 'anular este pedido'))) return;
 *   ...
 *   return (<> ... {modalPermiso} </>);
 *
 * Según cómo esté la app:
 *  - SIN control de usuarios: funciona como siempre: pide el PIN si Más > Configuración > Configurar
 *    PIN lo tiene encendido para esa acción (o pasa directo si no).
 *  - CON control de usuarios: manda el rol, no el PIN.
 *      · el rol puede hacerlo → pasa directo;
 *      · no puede, pero es una acción que un administrador puede AUTORIZAR → pide la contraseña de un
 *        administrador (vale solo para esta vez; la sesión no cambia);
 *      · no puede y no se puede autorizar → avisa que solo un administrador puede hacerlo.
 *
 * `sinPin: true` es para acciones que antes NO pedían PIN (como crear un producto): sin control de
 * usuarios pasan directo, para no cambiar cómo funcionaba la app; con control de usuarios sí se revisa el rol.
 */
export function usarPermisos(contenedor: ContenedorRepositorios | null) {
  const sesion = usarSesion();
  const { pedirPin, modalPin } = usarSolicitudPin(contenedor);
  const [autorizacion, setAutorizacion] = useState<Autorizacion | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const pedirPermiso = useCallback(
    (permiso: Permiso, accion: string, opciones?: { sinPin?: boolean }): Promise<boolean> => {
      if (!sesion.controlVigente || !contenedor) {
        return opciones?.sinPin ? Promise.resolve(true) : pedirPin(categoriaPinDe(permiso), accion);
      }
      if (sesion.puede(permiso)) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        if (esAutorizablePuntualmente(permiso)) {
          setAutorizacion({ permiso, accion, administradores: contenedor.usuarios.listarAdministradoresActivos() });
        } else {
          setAviso(mensajeSoloAdministrador(permiso));
        }
      });
    },
    [sesion, contenedor, pedirPin],
  );

  function cerrar(ok: boolean) {
    resolver.current?.(ok);
    resolver.current = null;
    setAutorizacion(null);
    setAviso(null);
  }

  // En <body>, por encima de cualquier pop-up abierto (z-50 > z-40).
  const modalPermiso = (
    <EnCuerpo>
      {modalPin}
      {autorizacion && contenedor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div role="dialog" aria-label="Autorización de administrador" className="max-h-[88dvh] w-full max-w-app overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <PuertaAdministrador
              titulo="Autorización de administrador"
              descripcion={`Para ${autorizacion.accion}, un administrador debe escribir su contraseña. Vale solo para esta acción.`}
              administradores={autorizacion.administradores}
              verificar={(id, clave) => contenedor.usuarios.autorizarComoAdministrador(id, clave)}
              persistir={contenedor.persistir}
              textoBoton="Autorizar"
              onAutorizado={(administrador) => {
                // Queda anotado quién autorizó, para que la acción lo guarde en la actividad de usuarios.
                contenedor.actor.registrarAutorizacion(autorizacion.permiso, administrador.id);
                cerrar(true);
              }}
              onCancelar={() => cerrar(false)}
            />
          </div>
        </div>
      )}
      {aviso && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div role="alertdialog" aria-label="Sin permiso" className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl">
            <p className="text-base font-extrabold text-bodega-oscuro">Sin permiso</p>
            <p className="mt-2 text-sm text-tinta/70">{aviso}</p>
            <button type="button" onClick={() => cerrar(false)} className="mt-4 h-11 w-full rounded-xl bg-bodega text-sm font-semibold text-white">
              Entendido
            </button>
          </div>
        </div>
      )}
    </EnCuerpo>
  );

  return { pedirPermiso, modalPermiso };
}
