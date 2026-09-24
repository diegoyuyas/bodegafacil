'use client';

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { solicitarPermisoNotificaciones } from '@/infraestructura/notificaciones/notificaciones-navegador';

const CLAVE_YA_PEDIDOS = 'vf_permisos_iniciales_pedidos';

const PERMISOS = [
  { icono: '📷', texto: 'Cámara y galería — para la foto del comprobante de pago (Yape/Plin)' },
  { icono: '🔔', texto: 'Notificaciones — para avisos de stock bajo y de Backup Automático' },
] as const;

/**
 * Pantalla de "pedir todos los permisos de una", para que el bodeguero
 * no vaya topándose con un permiso distinto cada vez que usa una
 * función nueva (cámara al vender por Yape, notificaciones al quedarse
 * sin stock, etc.) — solo aparece la primera vez que se abre la app en
 * un celular (`contenedor.esInstalacionNueva`), y solo dentro del APK
 * (Capacitor.isNativePlatform()); en navegador/PWA no aparece.
 *
 * El permiso de Bluetooth (para impresión térmica, Premium) queda
 * fuera a propósito: se pide recién cuando el bodeguero activa
 * "Activar impresión Bluetooth" en Más > Configuración > Configuración
 * de Impresión, porque es una función que no todos usan.
 *
 * No bloquea nada: si el bodeguero cierra la app o niega algún
 * permiso, igual puede seguir usando Vende Fácil con normalidad — esas
 * funciones puntuales quedan deshabilitadas hasta que lo conceda desde
 * Ajustes de Android, como ya pasaba antes de este cambio.
 */
export function SolicitarPermisosIniciales() {
  const { contenedor } = usarContenedor();
  const [visible, setVisible] = useState(false);
  const [pidiendo, setPidiendo] = useState(false);

  useEffect(() => {
    if (!contenedor || !Capacitor.isNativePlatform() || !contenedor.esInstalacionNueva) return;

    let yaPedidos: string | null = null;
    try {
      yaPedidos = localStorage.getItem(CLAVE_YA_PEDIDOS);
    } catch {
      yaPedidos = null;
    }
    if (!yaPedidos) setVisible(true);
  }, [contenedor]);

  function marcarComoPedidos() {
    try {
      localStorage.setItem(CLAVE_YA_PEDIDOS, '1');
    } catch {
      // Si no se pudo guardar, en el peor caso esta pantalla vuelve a\r
      // aparecer una vez más — no es grave, y nunca bloquea la app.
    }
    setVisible(false);
  }

  async function continuar() {
    setPidiendo(true);
    try {
      await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
    } catch {
      // Si el bodeguero lo niega o el diálogo falla, seguimos igual —\r
      // la app funciona sin foto de comprobante, solo queda esa\r
      // función puntual sin usar hasta que la habilite desde Ajustes.
    }
    try {
      await solicitarPermisoNotificaciones();
    } catch {
      // Mismo caso: sin notificaciones, la app sigue funcionando igual.
    }
    marcarComoPedidos();
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-papel px-6 text-center">
      <div>
        <p className="text-lg font-extrabold text-bodega-oscuro">Antes de empezar</p>
        <p className="mt-2 text-sm text-tinta/70">
          Vende Fácil va a pedirte estos permisos de una sola vez, para no interrumpirte después:
        </p>
      </div>

      <ul className="w-full max-w-xs space-y-3 text-left">
        {PERMISOS.map((permiso) => (
          <li key={permiso.texto} className="flex items-start gap-3 rounded-xl border border-linea bg-white p-3">
            <span aria-hidden="true" className="text-xl">
              {permiso.icono}
            </span>
            <p className="text-sm text-tinta">{permiso.texto}</p>
          </li>
        ))}
      </ul>

      <p className="text-xs text-tinta/50">
        Si prefieres no darlos ahora, puedes seguir usando la app igual — esas funciones puntuales
        quedan sin activar hasta que las habilites desde Ajustes del celular.
      </p>

      <div className="flex w-full max-w-xs flex-col gap-2">
        <button
          onClick={continuar}
          disabled={pidiendo}
          className="h-12 rounded-xl bg-bodega text-sm font-semibold text-white disabled:opacity-40"
        >
          {pidiendo ? 'Un momento…' : 'Continuar'}
        </button>
        <button onClick={marcarComoPedidos} className="h-10 text-xs font-semibold text-tinta/50">
          Ahora no
        </button>
      </div>
    </div>
  );
}
