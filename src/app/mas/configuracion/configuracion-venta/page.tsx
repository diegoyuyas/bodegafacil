'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Interruptor } from '@/components/interruptor';
import { usarContenedor } from '@/hooks/usar-contenedor';
import {
  CLAVE_DESCRIPCION_LINEAS,
  CLAVE_MODO_VENTA_VOZ,
  CLAVE_NOTIFICAR_STOCK_BAJO,
  CLAVE_PRECIO_EDITABLE_VENTA,
  estaActivado,
  valorParaGuardar,
} from '@/core/configuracion';
import type { EstadoPlan } from '@/core/plan';
import { CLAVE_VIBRACION, vibracionActiva } from '@/core/vibracion';
import { usarAvisos } from '@/components/proveedor-avisos';
import { solicitarPermisoNotificaciones } from '@/infraestructura/notificaciones/notificaciones-navegador';

export default function PaginaConfiguracionVenta() {
  const { contenedor, cargando, error } = usarContenedor();

  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [precioEditable, setPrecioEditable] = useState(false);
  const [notificarStockBajo, setNotificarStockBajo] = useState(false);
  const [mensajePermiso, setMensajePermiso] = useState<string | null>(null);
  const [descripcionLineas, setDescripcionLineas] = useState(false);
  const [modoVentaVoz, setModoVentaVoz] = useState(false);
  const [vibracion, setVibracion] = useState(true);
  const { vibrar } = usarAvisos();

  useEffect(() => {
    if (!contenedor) return;
    setEstadoPlan(contenedor.plan.obtenerEstado());
    setPrecioEditable(estaActivado(contenedor.configuracion.obtenerValor(CLAVE_PRECIO_EDITABLE_VENTA)));
    setNotificarStockBajo(
      estaActivado(contenedor.configuracion.obtenerValor(CLAVE_NOTIFICAR_STOCK_BAJO)),
    );
    setDescripcionLineas(estaActivado(contenedor.configuracion.obtenerValor(CLAVE_DESCRIPCION_LINEAS)));
    setModoVentaVoz(estaActivado(contenedor.configuracion.obtenerValor(CLAVE_MODO_VENTA_VOZ)));
    setVibracion(vibracionActiva(contenedor.configuracion.obtenerValor(CLAVE_VIBRACION)));
  }, [contenedor]);

  const esPremium = estadoPlan?.tipo === 'premium';

  async function alternarPrecioEditable() {
    if (!contenedor) return;
    const nuevoValor = !precioEditable;
    setPrecioEditable(nuevoValor);
    contenedor.configuracion.establecerValor(CLAVE_PRECIO_EDITABLE_VENTA, valorParaGuardar(nuevoValor));
    await contenedor.persistir();
  }

  async function alternarVibracion() {
    if (!contenedor) return;
    const nuevoValor = !vibracion;
    setVibracion(nuevoValor);
    contenedor.configuracion.establecerValor(CLAVE_VIBRACION, valorParaGuardar(nuevoValor));
    await contenedor.persistir();
    // Al activarla se siente un toque de muestra (solo en la app instalada).
    if (nuevoValor) vibrar('guardar');
  }

  async function alternarNotificarStockBajo() {
    if (!contenedor || !esPremium) return;
    setMensajePermiso(null);

    const nuevoValor = !notificarStockBajo;

    // Al activarlo (no al desactivarlo) se pide permiso al navegador.
    // Si el bodeguero lo rechaza, no tiene sentido guardar el switch
    // en ON: no habría forma de mostrar nada.
    if (nuevoValor) {
      const permiso = await solicitarPermisoNotificaciones();
      if (permiso !== 'granted') {
        setMensajePermiso(
          'Activa los permisos de notificaciones de este navegador para poder avisarte.',
        );
        return;
      }
    }

    setNotificarStockBajo(nuevoValor);
    contenedor.configuracion.establecerValor(CLAVE_NOTIFICAR_STOCK_BAJO, valorParaGuardar(nuevoValor));
    await contenedor.persistir();
  }

  async function alternarDescripcionLineas() {
    if (!contenedor) return;
    const nuevoValor = !descripcionLineas;
    setDescripcionLineas(nuevoValor);
    contenedor.configuracion.establecerValor(CLAVE_DESCRIPCION_LINEAS, valorParaGuardar(nuevoValor));
    await contenedor.persistir();
  }

  async function alternarModoVentaVoz() {
    if (!contenedor || !esPremium) return;
    const nuevoValor = !modoVentaVoz;
    setModoVentaVoz(nuevoValor);
    contenedor.configuracion.establecerValor(CLAVE_MODO_VENTA_VOZ, valorParaGuardar(nuevoValor));
    await contenedor.persistir();
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas/configuracion" className="text-xl text-tinta-suave" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Configuración de Venta</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta-suave">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      <ul className="mt-6 divide-y divide-linea border-y border-linea">
        <li className="flex items-center justify-between gap-4 py-4">
          <div>
            <p className="text-sm font-semibold text-tinta">Precio editable al vender</p>
            <p className="mt-0.5 text-xs text-tinta-suave">
              Permite cambiar el precio de un producto al momento de registrar la venta.
            </p>
          </div>
          <Interruptor activado={precioEditable} onChange={alternarPrecioEditable} disabled={!contenedor} />
        </li>

        <li className="flex items-center justify-between gap-4 py-4">
          <div>
            <p className="text-sm font-semibold text-tinta">Vibrar al cobrar o guardar</p>
            <p className="mt-0.5 text-xs text-tinta-suave">
              Una vibración corta al registrar una venta, un cobro o al guardar. Solo en la app instalada (Android).
            </p>
          </div>
          <Interruptor activado={vibracion} onChange={alternarVibracion} disabled={!contenedor} />
        </li>

        <li className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-tinta">Notificación de stock bajo</p>
              <p className="mt-0.5 text-xs text-tinta-suave">
                Avisa cuando algún producto llega a su stock mínimo.
              </p>
              {!esPremium && <p className="mt-1 text-xs font-semibold text-acento-oscuro">Función Premium</p>}
            </div>
            <Interruptor
              activado={notificarStockBajo}
              onChange={alternarNotificarStockBajo}
              disabled={!contenedor || !esPremium}
            />
          </div>
          {mensajePermiso && <p className="mt-2 text-xs text-alerta">{mensajePermiso}</p>}
        </li>

        <li className="flex items-center justify-between gap-4 py-4">
          <div>
            <p className="text-sm font-semibold text-tinta">Añadir descripción en Venta/Compra</p>
            <p className="mt-0.5 text-xs text-tinta-suave">
              Permite escribir una nota corta (hasta 100 caracteres) debajo de cada producto. Sale en la nota de venta,
              los pedidos y los reportes.
            </p>
          </div>
          <Interruptor activado={descripcionLineas} onChange={alternarDescripcionLineas} disabled={!contenedor} />
        </li>

        <li className="flex items-center justify-between gap-4 py-4">
          <div>
            <p className="text-sm font-semibold text-tinta">Modo venta por voz</p>
            <p className="mt-0.5 text-xs text-tinta-suave">
              Permite vender hablando. Al activarlo, cada producto de Venta y Compra tiene un campo Alias para los
              nombres con que lo llama la gente.
            </p>
            {!esPremium && <p className="mt-1 text-xs font-semibold text-acento-oscuro">Función Premium</p>}
          </div>
          <Interruptor activado={modoVentaVoz} onChange={alternarModoVentaVoz} disabled={!contenedor || !esPremium} />
        </li>

        <li className="flex items-center justify-between gap-4 py-4">
          <div>
            <p className="text-sm font-semibold text-tinta">Activar Venta Entero/Fracción</p>
            <p className="mt-0.5 text-xs text-tinta-suave">Vender productos por unidad completa o por fracciones.</p>
            <p className="mt-1 text-xs font-semibold text-tinta-suave">Próximamente</p>
          </div>
          <Interruptor activado={false} onChange={() => {}} disabled />
        </li>
      </ul>
    </div>
  );
}
