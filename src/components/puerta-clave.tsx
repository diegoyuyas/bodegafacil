'use client';

import { useEffect, useMemo, useState } from 'react';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import { mensajeDeAccesoFallido, type ResultadoAcceso, type Usuario, validarClave } from '@/core/usuarios';
import { CampoClave } from './campo-clave';
import { MostrarClaveRecuperacion } from './mostrar-clave-recuperacion';
import { RecuadroUsuario } from './recuadro-usuario';

type Recuperacion = (
  adminId: number,
  claveRecuperacion: string,
  claveNueva: string,
) => Promise<{ ok: true; nuevaClaveRecuperacion: string } | { ok: false }>;

export interface PropsPuertaClave {
  titulo: string;
  descripcion?: string;
  usuarios: Usuario[];
  /** Texto sobre los recuadros cuando hay varios usuarios. */
  preguntaSeleccion?: string;
  /** Texto del botón principal. Por defecto "Entrar". */
  textoBoton?: string;
  verificar: (usuarioId: number, clave: string) => Promise<ResultadoAcceso>;
  /** Si se pasa, aparece "Olvidé mi contraseña" (solo tiene sentido para quien es administrador). */
  recuperar?: Recuperacion;
  /** Texto que reemplaza a "Olvidé mi contraseña" cuando no hay `recuperar`. */
  ayudaOlvido?: string;
  persistir: () => Promise<void>;
  onAutorizado: (usuario: Usuario) => void;
  onCancelar?: () => void;
}

/**
 * Pide la contraseña de un usuario (varios recuadros para elegir, o uno solo). La usan la
 * pantalla de acceso, la entrada a Administración de Usuarios y la autorización puntual de un
 * administrador. Incluye "Olvidé mi contraseña" (con la clave de recuperación) cuando se le da `recuperar`.
 *
 * `verificar` y `recuperar` escriben en la base (cuentan intentos, cambian la contraseña),
 * por eso después de cada llamada se llama a `persistir`.
 */
export function PuertaClave({
  titulo,
  descripcion,
  usuarios,
  preguntaSeleccion = '¿Quién eres?',
  textoBoton = 'Entrar',
  verificar,
  recuperar,
  ayudaOlvido,
  persistir,
  onAutorizado,
  onCancelar,
}: PropsPuertaClave) {
  const [elegidoId, setElegidoId] = useState<number | null>(usuarios.length === 1 ? (usuarios[0]?.id ?? null) : null);
  const [clave, setClave] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [espera, setEspera] = useState(0);
  const [trabajando, setTrabajando] = useState(false);

  const [recuperando, setRecuperando] = useState(false);
  const [claveRecuperacion, setClaveRecuperacion] = useState('');
  const [claveNueva, setClaveNueva] = useState('');
  const [claveNueva2, setClaveNueva2] = useState('');
  const [claveNuevaRecuperacion, setClaveNuevaRecuperacion] = useState<string | null>(null);

  const elegido = useMemo(() => usuarios.find((a) => a.id === elegidoId) ?? null, [usuarios, elegidoId]);

  // Cuenta regresiva del bloqueo por intentos fallidos.
  useEffect(() => {
    if (espera <= 0) return;
    const id = setInterval(() => setEspera((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [espera]);

  async function entrar() {
    if (!elegido || trabajando || espera > 0) return;
    if (clave === '') {
      setMensaje('Escribe la contraseña.');
      return;
    }
    setTrabajando(true);
    try {
      const resultado = await verificar(elegido.id, clave);
      await persistir();
      if (resultado.ok) {
        setClave('');
        setMensaje(null);
        onAutorizado(resultado.usuario);
        return;
      }
      setMensaje(mensajeDeAccesoFallido(resultado));
      setClave('');
      if (resultado.motivo === 'bloqueado') setEspera(resultado.segundosEspera);
    } finally {
      setTrabajando(false);
    }
  }

  async function restablecer() {
    if (!elegido || !recuperar || trabajando) return;
    if (claveNueva !== claveNueva2) {
      setMensaje('Las contraseñas nuevas no coinciden.');
      return;
    }
    setTrabajando(true);
    try {
      validarClave(claveNueva);
      const resultado = await recuperar(elegido.id, claveRecuperacion, claveNueva);
      await persistir();
      if (!resultado.ok) {
        setMensaje('La clave de recuperación no es correcta.');
        return;
      }
      setMensaje(null);
      setClaveNuevaRecuperacion(resultado.nuevaClaveRecuperacion);
    } catch (e) {
      setMensaje(e instanceof ErrorDeNegocio ? e.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setTrabajando(false);
    }
  }

  if (claveNuevaRecuperacion && elegido) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-extrabold text-bodega-oscuro">Contraseña cambiada</h2>
        <p className="text-sm text-tinta/70">Ya puedes entrar. La clave de recuperación anterior dejó de servir; esta es la nueva.</p>
        <MostrarClaveRecuperacion
          clave={claveNuevaRecuperacion}
          textoBoton="Entrar"
          onListo={() => onAutorizado(elegido)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-extrabold text-bodega-oscuro">{titulo}</h2>
        {descripcion && <p className="mt-1 text-sm text-tinta/70">{descripcion}</p>}
      </div>

      {usuarios.length > 1 && (
        <div>
          <p className="mb-2 text-sm font-bold text-tinta">{preguntaSeleccion}</p>
          <div className="grid grid-cols-3 gap-3">
            {usuarios.map((a) => (
              <RecuadroUsuario
                key={a.id}
                usuario={a}
                pequeno
                seleccionado={a.id === elegidoId}
                onClick={() => {
                  setElegidoId(a.id);
                  setMensaje(null);
                  setClave('');
                }}
              />
            ))}
          </div>
        </div>
      )}

      {usuarios.length === 1 && elegido && (
        <div className="mx-auto w-28">
          <RecuadroUsuario usuario={elegido} pequeno />
        </div>
      )}

      {elegido && !recuperando && (
        <div className="space-y-3">
          <CampoClave valor={clave} onChange={setClave} placeholder="Contraseña" etiquetaAccesible="Contraseña" autoFocus onEnter={entrar} />
          {mensaje && (
            <p role="alert" className="text-sm font-semibold text-alerta">
              {mensaje}
            </p>
          )}
          {espera > 0 && <p className="text-sm text-tinta/70">Podrás volver a intentar en {espera} s.</p>}
          <button
            type="button"
            onClick={entrar}
            disabled={trabajando || espera > 0}
            className="h-12 w-full rounded-full bg-bodega text-base font-semibold text-white active:bg-bodega-oscuro disabled:opacity-40"
          >
            {trabajando ? 'Verificando…' : textoBoton}
          </button>
          {recuperar && (
            <button
              type="button"
              onClick={() => {
                setRecuperando(true);
                setMensaje(null);
              }}
              className="h-10 w-full text-sm font-semibold text-bodega-oscuro"
            >
              Olvidé mi contraseña
            </button>
          )}
          {!recuperar && ayudaOlvido && <p className="text-center text-xs text-tinta/60">{ayudaOlvido}</p>}
        </div>
      )}

      {elegido && recuperando && recuperar && (
        <div className="space-y-3">
          <p className="text-sm text-tinta/70">
            Escribe la clave de recuperación que anotaste al crear al administrador y elige una contraseña nueva.
          </p>
          <input
            value={claveRecuperacion}
            onChange={(e) => setClaveRecuperacion(e.target.value.toLocaleUpperCase('es'))}
            placeholder="XXXX-XXXX-XXXX"
            aria-label="Clave de recuperación"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="h-12 w-full rounded-xl border border-linea bg-white px-4 text-center font-mono text-base tracking-widest outline-none focus:border-bodega"
          />
          <CampoClave valor={claveNueva} onChange={setClaveNueva} placeholder="Contraseña nueva" etiquetaAccesible="Contraseña nueva" />
          <CampoClave valor={claveNueva2} onChange={setClaveNueva2} placeholder="Repite la contraseña nueva" etiquetaAccesible="Repite la contraseña nueva" />
          {mensaje && (
            <p role="alert" className="text-sm font-semibold text-alerta">
              {mensaje}
            </p>
          )}
          <button
            type="button"
            onClick={restablecer}
            disabled={trabajando}
            className="h-12 w-full rounded-full bg-bodega text-base font-semibold text-white active:bg-bodega-oscuro disabled:opacity-40"
          >
            {trabajando ? 'Verificando…' : 'Cambiar contraseña'}
          </button>
          <button
            type="button"
            onClick={() => {
              setRecuperando(false);
              setMensaje(null);
            }}
            className="h-10 w-full text-sm font-semibold text-tinta/70"
          >
            Volver
          </button>
        </div>
      )}

      {onCancelar && (
        <button type="button" onClick={onCancelar} className="h-10 w-full text-sm font-semibold text-tinta/60">
          Cancelar
        </button>
      )}
    </div>
  );
}
