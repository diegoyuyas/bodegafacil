'use client';

import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { CLAVE_CONTROL_USUARIOS, controlUsuariosVigente } from '@/core/configuracion';
import { puedeHacer, type Permiso } from '@/core/permisos';
import { MINUTOS_REBLOQUEO_POR_DEFECTO, debeBloquearPorSegundoPlano, type Usuario } from '@/core/usuarios';
import { PantallaAcceso } from './pantalla-acceso';

/**
 * Sesión del control de usuarios: quién está usando la app y qué puede hacer.
 *
 *  - Control NO vigente (apagado, o el Premium venció): la app funciona como siempre, sin
 *    usuario, y `puede()` responde que sí a todo.
 *  - Control vigente: nada se usa hasta entrar por la pantalla de acceso (recuadros + contraseña),
 *    cada vez que se abre la app. Tras unos 5 minutos en segundo plano se vuelve a pedir.
 *
 * Mientras la pantalla de acceso está encima, la app queda abajo SIN desmontarse (una venta a
 * medias de la misma persona se conserva); si entra OTRO usuario, la app se vuelve a armar desde
 * cero para que no vea lo que dejó el anterior, y vuelve a Inicio.
 */
export interface Sesion {
  /** null mientras la app termina de cargar. */
  controlVigente: boolean | null;
  usuario: Usuario | null;
  iniciarSesion: (usuario: Usuario) => void;
  cerrarSesion: () => void;
  /** Vuelve a leer si el control rige y el estado del usuario actual (llamar tras cambiar usuarios o el control). */
  refrescar: () => void;
  puede: (permiso: Permiso) => boolean;
}

const SESION_ABIERTA: Sesion = {
  controlVigente: false,
  usuario: null,
  iniciarSesion: () => undefined,
  cerrarSesion: () => undefined,
  refrescar: () => undefined,
  puede: () => true,
};

const ContextoSesion = createContext<Sesion>(SESION_ABIERTA);

export function usarSesion(): Sesion {
  return useContext(ContextoSesion);
}

export function ProveedorSesion({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { contenedor } = usarContenedor();

  const [version, setVersion] = useState(0);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [ultimoUsuarioId, setUltimoUsuarioId] = useState<number | null>(null);
  const ultimoRef = useRef<number | null>(null);
  ultimoRef.current = ultimoUsuarioId;

  const controlVigente = useMemo(() => {
    if (!contenedor) return null;
    return controlUsuariosVigente(
      contenedor.configuracion.obtenerValor(CLAVE_CONTROL_USUARIOS),
      contenedor.plan.obtenerEstado().tipo === 'premium',
    );
    // `version` fuerza a volver a leer cuando cambian los usuarios, el control o el plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenedor, version]);

  const refrescar = useCallback(() => setVersion((v) => v + 1), []);

  const iniciarSesion = useCallback(
    (nuevo: Usuario) => {
      // Otro usuario distinto al anterior: que no vea la pantalla en la que el anterior se quedó.
      if (ultimoRef.current !== null && ultimoRef.current !== nuevo.id) router.replace('/');
      setUltimoUsuarioId(nuevo.id);
      setUsuario(nuevo);
    },
    [router],
  );

  const cerrarSesion = useCallback(() => setUsuario(null), []);

  // Los repositorios anotan en cada venta, compra, cobro y movimiento de caja QUIÉN lo hizo: se les avisa quién está dentro.
  useEffect(() => {
    contenedor?.actor.establecerUsuario(controlVigente && usuario ? usuario.id : null);
  }, [contenedor, controlVigente, usuario]);

  // Si al usuario actual lo desactivan, le cambian el rol o el nombre, la sesión se pone al día.
  useEffect(() => {
    if (!contenedor || !usuario) return;
    try {
      const actual = contenedor.usuarios.obtenerPorId(usuario.id);
      if (!actual.activo) setUsuario(null);
      else if (actual.nombre !== usuario.nombre || actual.rol !== usuario.rol) setUsuario(actual);
    } catch {
      setUsuario(null);
    }
  }, [contenedor, usuario, version]);

  // Al volver de segundo plano: se vuelve a leer el plan/control y, si pasaron ~5 minutos, se pide acceso otra vez.
  useEffect(() => {
    if (!controlVigente) return;
    let salioEn: number | null = null;
    const salir = () => {
      salioEn = Date.now();
    };
    const volver = () => {
      const desde = salioEn;
      salioEn = null;
      setVersion((v) => v + 1);
      if (desde !== null && debeBloquearPorSegundoPlano(Date.now() - desde, MINUTOS_REBLOQUEO_POR_DEFECTO)) setUsuario(null);
    };

    if (Capacitor.isNativePlatform()) {
      const escucha = App.addListener('appStateChange', ({ isActive }) => (isActive ? volver() : salir()));
      return () => {
        void escucha.then((manejador) => manejador.remove());
      };
    }
    const alCambiar = () => (document.visibilityState === 'hidden' ? salir() : volver());
    document.addEventListener('visibilitychange', alCambiar);
    return () => document.removeEventListener('visibilitychange', alCambiar);
  }, [controlVigente]);

  const puede = useCallback(
    (permiso: Permiso) => !controlVigente || (usuario !== null && puedeHacer(usuario.rol, permiso)),
    [controlVigente, usuario],
  );

  const valor = useMemo<Sesion>(
    () => ({ controlVigente, usuario, iniciarSesion, cerrarSesion, refrescar, puede }),
    [controlVigente, usuario, iniciarSesion, cerrarSesion, refrescar, puede],
  );

  const pedirAcceso = controlVigente === true && usuario === null && contenedor !== null;

  return (
    <ContextoSesion.Provider value={valor}>
      <Fragment key={controlVigente ? `usuario-${ultimoUsuarioId ?? 'ninguno'}` : 'abierto'}>{children}</Fragment>
      {pedirAcceso && contenedor && (
        <PantallaAcceso usuarios={contenedor.usuarios} persistir={contenedor.persistir} onAcceso={iniciarSesion} />
      )}
    </ContextoSesion.Provider>
  );
}
