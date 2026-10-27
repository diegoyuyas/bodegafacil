/**
 * Vende Fácil — Reconocimiento de voz (micrófono)
 * ------------------------------------------------------------
 * Envuelve el reconocimiento de voz del propio celular y lo vuelve
 * CONTINUO: Android corta cada sesión tras unos segundos de silencio, así
 * que aquí se reinicia sola hasta que se pida pausar, o hasta que pasen
 * unos segundos de inactividad (para cuidar la batería y no captar
 * conversaciones ajenas).
 *
 * Dos motores, el mismo comportamiento hacia afuera:
 *  - Nativo (APK): plugin @capacitor-community/speech-recognition. Sin
 *    internet solo funciona si el celular tiene el paquete de voz en
 *    español descargado.
 *  - Navegador (PWA): Web Speech API, si el navegador la trae (Chrome).
 *
 * Detalles del plugin nativo que obligan a ser cuidadosos:
 *  - Se usa SIN resultados parciales: así `start()` devuelve la frase al
 *    terminar y REPORTA los errores. Con parciales activados el plugin
 *    esconde los errores (silencio, sin internet...) y la sesión moría en
 *    silencio, dejando la pantalla "escuchando" sin escuchar.
 *  - Su `stop()` nunca responde, así que jamás se espera sin un tope de tiempo.
 *
 * No sabe nada de ventas ni de productos: solo entrega frases de texto.
 */

import { Capacitor } from '@capacitor/core';

export type EstadoVoz =
  | 'iniciando'
  | 'escuchando'
  /** Micrófono apagado a propósito o por inactividad: se retoma con un toque. */
  | 'pausado'
  | 'sin_permiso'
  | 'no_disponible'
  | 'error';

export interface OpcionesReconocedor {
  /** Por defecto 'es-PE'. */
  idioma?: string;
  /** Lo que se va oyendo mientras la persona habla ('' cuando termina la frase). */
  alTextoParcial: (texto: string) => void;
  /** Una frase ya terminada. */
  alFrase: (texto: string) => void;
  alEstado: (estado: EstadoVoz, detalle?: string) => void;
  /** true mientras se oye hablar a la persona; false cuando deja de hablar. */
  alHablar?: (hablando: boolean) => void;
  /** Segundos sin oír nada antes de apagar el micrófono. Por defecto 90. */
  segundosInactividad?: number;
}

export interface ReconocedorVoz {
  /** Pide permiso (si falta) y empieza a escuchar de forma continua. */
  iniciar: () => Promise<void>;
  /** Apaga el micrófono. */
  pausar: () => Promise<void>;
  /** Cierra la frase que se está diciendo ahora mismo, sin esperar el silencio. */
  cerrarFraseAhora: () => Promise<void>;
  /** Apaga todo y suelta los recursos (al salir de la pantalla). */
  destruir: () => Promise<void>;
}

// ------------------------------------------------------------
// Motores
// ------------------------------------------------------------

interface ManejadoresSesion {
  /** Texto en vivo (solo el motor del navegador lo entrega). */
  parcial: (texto: string) => void;
  /** La sesión terminó con una frase completa. */
  final: (texto: string) => void;
  /** La sesión terminó sin frase (silencio, corte). */
  fin: () => void;
  /** La sesión falló. Códigos: 'no-speech', 'not-allowed', 'network', 'audio-capture', 'busy', 'no-disponible', 'otro:<detalle>'. */
  error: (codigo: string) => void;
  /** La persona empezó (true) o dejó de hablar (false). */
  hablando: (activo: boolean) => void;
}

export interface Motor {
  disponible: () => Promise<boolean>;
  pedirPermiso: () => Promise<boolean>;
  iniciarSesion: (manejadores: ManejadoresSesion, idioma: string) => Promise<void>;
  detenerSesion: () => Promise<void>;
  limpiar: () => Promise<void>;
}

/** Pasa el mensaje de error del plugin (texto en inglés) a un código propio. */
function clasificarErrorNativo(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes('insufficient permissions') || m.includes('missing permission')) return 'not-allowed';
  if (m.includes('not available')) return 'no-disponible';
  if (m.includes('network') || m.includes('server')) return 'network';
  if (m.includes('audio')) return 'audio-capture';
  if (m.includes('busy')) return 'busy';
  if (m.includes('no match') || m.includes('no speech') || m.includes("didn't understand")) return 'no-speech';
  return `otro:${mensaje}`;
}

function mensajeDeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

/**
 * OJO — error que dejó la pantalla en "Activando micrófono…" para siempre:
 * los plugins de Capacitor son "proxies" que responden a CUALQUIER nombre de método,
 * incluido `then`. Si una función `async` (o una promesa) DEVUELVE el plugin tal cual,
 * JavaScript cree que es una promesa, llama a `plugin.then(...)`, Capacitor lo manda al
 * celular como un método que no existe y la espera no termina jamás.
 * Por eso el plugin SIEMPRE se entrega dentro de un objeto: `const { p } = await cargarPlugin()`.
 */
async function cargarPlugin() {
  const modulo = await import('@capacitor-community/speech-recognition');
  return { p: modulo.SpeechRecognition };
}

function crearMotorNativo(): Motor {
  let actuales: ManejadoresSesion | null = null;
  let escuchasListas = false;

  async function registrarEscuchas() {
    if (escuchasListas) return;
    escuchasListas = true;
    const { p } = await cargarPlugin();
    await p.addListener('listeningState', (datos) => {
      actuales?.hablando(datos.status === 'started');
    });
  }

  return {
    async disponible() {
      try {
        const { p } = await cargarPlugin();
        return (await p.available()).available;
      } catch {
        return false;
      }
    },
    async pedirPermiso() {
      try {
        const { p } = await cargarPlugin();
        let estado = await p.checkPermissions();
        if (estado.speechRecognition !== 'granted') estado = await p.requestPermissions();
        return estado.speechRecognition === 'granted';
      } catch {
        return false;
      }
    },
    async iniciarSesion(manejadores, idioma) {
      actuales = manejadores;
      await registrarEscuchas();
      const { p } = await cargarPlugin();
      // No se espera la sesión completa: la promesa de `start()` termina cuando la persona calla
      // (con su frase) o cuando falla (con el motivo), y eso llega por estos manejadores.
      p.start({ language: idioma, maxResults: 3, partialResults: false, popup: false })
        .then((resultado) => {
          const texto = resultado?.matches?.[0]?.trim();
          if (texto) manejadores.final(texto);
          else manejadores.fin();
        })
        .catch((e: unknown) => manejadores.error(clasificarErrorNativo(mensajeDeError(e))));
    },
    async detenerSesion() {
      try {
        const { p } = await cargarPlugin();
        // El `stop()` del plugin nunca responde: se le da un instante y se sigue.
        await Promise.race([p.stop(), esperar(400)]);
      } catch {
        // ya estaba detenido
      }
    },
    async limpiar() {
      actuales = null;
      escuchasListas = false;
      try {
        const { p } = await cargarPlugin();
        await p.removeAllListeners();
      } catch {
        // nada que limpiar
      }
    },
  };
}

// Tipos mínimos de la Web Speech API (no vienen en TypeScript por defecto).
interface ResultadoWeb {
  0: { transcript: string };
}
interface EventoResultadoWeb {
  results: ArrayLike<ResultadoWeb>;
}
interface ReconocedorWeb {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: EventoResultadoWeb) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type ConstructorWeb = new () => ReconocedorWeb;

function constructorWeb(): ConstructorWeb | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: ConstructorWeb; webkitSpeechRecognition?: ConstructorWeb };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function crearMotorWeb(): Motor {
  let actual: ReconocedorWeb | null = null;
  return {
    async disponible() {
      return constructorWeb() !== null;
    },
    async pedirPermiso() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return true;
        const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
        flujo.getTracks().forEach((pista) => pista.stop());
        return true;
      } catch {
        return false;
      }
    },
    async iniciarSesion(manejadores, idioma) {
      const Constructor = constructorWeb();
      if (!Constructor) {
        manejadores.error('no-disponible');
        return;
      }
      const reconocedor = new Constructor();
      reconocedor.lang = idioma;
      reconocedor.continuous = false;
      reconocedor.interimResults = true;
      reconocedor.onresult = (evento) => {
        const texto = Array.from(evento.results)
          .map((r) => r[0].transcript)
          .join(' ')
          .trim();
        if (texto) manejadores.parcial(texto);
      };
      reconocedor.onerror = (e) => manejadores.error(e.error);
      reconocedor.onspeechstart = () => manejadores.hablando(true);
      reconocedor.onspeechend = () => manejadores.hablando(false);
      reconocedor.onend = () => manejadores.fin();
      actual = reconocedor;
      try {
        reconocedor.start();
      } catch (e) {
        manejadores.error(e instanceof Error ? e.message : String(e));
      }
    },
    async detenerSesion() {
      try {
        actual?.stop();
      } catch {
        // ya estaba detenido
      }
    },
    async limpiar() {
      if (actual) {
        actual.onresult = null;
        actual.onend = null;
        actual.onerror = null;
        actual.onspeechstart = null;
        actual.onspeechend = null;
        try {
          actual.abort();
        } catch {
          // nada que abortar
        }
      }
      actual = null;
    },
  };
}

// ------------------------------------------------------------
// Control continuo
// ------------------------------------------------------------

/** Si una sesión termina sin frase, se espera esto por si el resultado final llega un instante después. */
const ESPERA_RESULTADO_FINAL_MS = 700;
/** Pausa entre una sesión y la siguiente (evita pitidos seguidos y deja liberar el micrófono). */
const PAUSA_ENTRE_SESIONES_MS = 250;
const PAUSA_TRAS_ERROR_MS = 1000;
/** Una sesión sin frase que dura menos que esto cuenta como fallo rápido (el silencio normal dura varios segundos). */
const SESION_DEMASIADO_CORTA_MS = 1200;
const FALLOS_RAPIDOS_PARA_RENDIRSE = 6;
const FALLOS_DUROS_PARA_RENDIRSE = 3;
/** Cada tantos fallos seguidos se prueba otra variante del español (es-PE → es-419 → es-ES). */
const FALLOS_PARA_CAMBIAR_IDIOMA = 2;
/** Misma frase repetida dentro de esta ventana = resultado duplicado, se ignora. */
const VENTANA_DUPLICADOS_MS = 1500;
/** Tope de espera al detener el micrófono (el `stop()` del plugin nativo puede no responder jamás). */
const TOPE_DETENER_MS = 600;

const IDIOMAS_ALTERNATIVOS = ['es-419', 'es-ES'];

const AYUDA_PAQUETE_DE_VOZ =
  'Ajustes › Idioma y entrada › Teclado en pantalla › Gboard › Escritura por voz › Reconocimiento de voz sin conexión › Español.';

function mensajeDeRendicion(codigo: string | null): string {
  if (codigo === 'network') {
    return `Sin internet. Conéctate, o descarga el paquete de voz en español: ${AYUDA_PAQUETE_DE_VOZ}`;
  }
  if (codigo === 'audio-capture') return 'No se pudo usar el micrófono. Cierra otras apps que lo estén usando y reintenta.';
  if (codigo === 'busy') return 'El reconocimiento de voz del celular está ocupado. Espera un momento y reintenta.';
  if (codigo?.startsWith('otro:')) {
    return `El celular devolvió un error de voz (${codigo.slice(5)}). Revisa el paquete de voz en español: ${AYUDA_PAQUETE_DE_VOZ}`;
  }
  return `No se logra escuchar. Revisa el micrófono y el paquete de voz en español: ${AYUDA_PAQUETE_DE_VOZ}`;
}

export function crearReconocedorVoz(opciones: OpcionesReconocedor): ReconocedorVoz {
  const motor: Motor = Capacitor.isNativePlatform() ? crearMotorNativo() : crearMotorWeb();
  return crearReconocedorConMotor(opciones, motor);
}

/** Igual que `crearReconocedorVoz` pero con el motor a elección (así se prueba sin micrófono). */
export function crearReconocedorConMotor(opciones: OpcionesReconocedor, motor: Motor): ReconocedorVoz {
  const idiomaBase = opciones.idioma ?? 'es-PE';
  const idiomas = [idiomaBase, ...IDIOMAS_ALTERNATIVOS.filter((i) => i !== idiomaBase)];
  const msInactividad = (opciones.segundosInactividad ?? 90) * 1000;

  let activo = false;
  let destruido = false;
  let sesion = 0;
  let sesionCerrada = 0;
  let indiceIdioma = 0;
  let inicioSesion = 0;
  let textoSesion = '';
  let fallosRapidos = 0;
  let fallosDuros = 0;
  let ultimoCodigoDuro: string | null = null;
  let ignorarParcialesHasta = 0;
  let ultimaFrase = { texto: '', hora: 0 };
  let temporizadorFin: ReturnType<typeof setTimeout> | null = null;
  let temporizadorInactividad: ReturnType<typeof setTimeout> | null = null;
  let temporizadorReinicio: ReturnType<typeof setTimeout> | null = null;

  function limpiarTemporizadores() {
    if (temporizadorFin) clearTimeout(temporizadorFin);
    if (temporizadorInactividad) clearTimeout(temporizadorInactividad);
    if (temporizadorReinicio) clearTimeout(temporizadorReinicio);
    temporizadorFin = temporizadorInactividad = temporizadorReinicio = null;
  }

  /** Detiene el micrófono sin quedarse esperando para siempre. */
  async function detenerSeguro() {
    try {
      await Promise.race([motor.detenerSesion(), new Promise<void>((r) => setTimeout(r, TOPE_DETENER_MS))]);
    } catch {
      // ya estaba detenido
    }
  }

  function armarInactividad() {
    if (temporizadorInactividad) clearTimeout(temporizadorInactividad);
    temporizadorInactividad = setTimeout(() => {
      void pausarPorInactividad();
    }, msInactividad);
  }

  async function pausarPorInactividad() {
    await apagar();
    opciones.alEstado('pausado', 'inactividad');
  }

  async function apagar() {
    activo = false;
    limpiarTemporizadores();
    textoSesion = '';
    opciones.alTextoParcial('');
    opciones.alHablar?.(false);
    await detenerSeguro();
  }

  /** Cierra la sesión (con frase o sin ella), entrega la frase y, si sigue activo, arranca otra. */
  function terminarSesion(numero: number, resultado: { texto?: string; falloDuro?: string }) {
    if (numero !== sesion || sesionCerrada === numero || destruido) return;
    sesionCerrada = numero;
    if (temporizadorFin) clearTimeout(temporizadorFin);
    temporizadorFin = null;

    const texto = (resultado.texto ?? textoSesion).trim();
    textoSesion = '';
    opciones.alTextoParcial('');
    opciones.alHablar?.(false);

    const duroPoco = Date.now() - inicioSesion < SESION_DEMASIADO_CORTA_MS;
    if (texto) {
      fallosRapidos = 0;
      fallosDuros = 0;
      ultimoCodigoDuro = null;
      const ahora = Date.now();
      const repetida = texto === ultimaFrase.texto && ahora - ultimaFrase.hora < VENTANA_DUPLICADOS_MS;
      ultimaFrase = { texto, hora: ahora };
      if (!repetida) opciones.alFrase(texto);
    } else if (resultado.falloDuro) {
      fallosDuros += 1;
      ultimoCodigoDuro = resultado.falloDuro;
    } else if (duroPoco) {
      fallosRapidos += 1;
    } else {
      // Silencio normal (la persona no habló): no es un fallo.
      fallosRapidos = 0;
      fallosDuros = 0;
      ultimoCodigoDuro = null;
    }

    if (!activo) return;

    const fallos = fallosRapidos + fallosDuros;
    if (fallosDuros >= FALLOS_DUROS_PARA_RENDIRSE || fallosRapidos >= FALLOS_RAPIDOS_PARA_RENDIRSE) {
      const mensaje = mensajeDeRendicion(fallosDuros > 0 ? ultimoCodigoDuro : null);
      void apagar().then(() => opciones.alEstado('error', mensaje));
      return;
    }
    // Si algo falla seguido, se prueba otra variante del español por si la primera no está disponible.
    if (fallos > 0 && fallos % FALLOS_PARA_CAMBIAR_IDIOMA === 0 && idiomas.length > 1) {
      indiceIdioma = (indiceIdioma + 1) % idiomas.length;
    }
    temporizadorReinicio = setTimeout(
      () => void lanzarSesion(),
      resultado.falloDuro ? PAUSA_TRAS_ERROR_MS : PAUSA_ENTRE_SESIONES_MS,
    );
  }

  async function lanzarSesion() {
    if (!activo || destruido) return;
    sesion += 1;
    const numero = sesion;
    inicioSesion = Date.now();
    textoSesion = '';
    const vigente = () => numero === sesion && sesionCerrada !== numero;

    await motor.iniciarSesion(
      {
        parcial: (texto) => {
          if (!vigente() || Date.now() < ignorarParcialesHasta) return;
          textoSesion = texto;
          opciones.alTextoParcial(texto);
          armarInactividad();
        },
        final: (texto) => {
          if (!vigente()) return;
          armarInactividad();
          terminarSesion(numero, { texto });
        },
        fin: () => {
          if (!vigente()) return;
          // Por si el resultado final llega un instante DESPUÉS del aviso de fin.
          if (temporizadorFin) clearTimeout(temporizadorFin);
          temporizadorFin = setTimeout(() => terminarSesion(numero, {}), ESPERA_RESULTADO_FINAL_MS);
        },
        hablando: (hablando) => {
          if (numero !== sesion) return;
          opciones.alHablar?.(hablando);
          if (hablando) armarInactividad();
        },
        error: (codigo) => {
          if (!vigente()) return;
          if (codigo === 'not-allowed' || codigo === 'service-not-allowed') {
            void apagar().then(() => opciones.alEstado('sin_permiso'));
          } else if (codigo === 'no-disponible') {
            void apagar().then(() => opciones.alEstado('no_disponible'));
          } else if (codigo === 'no-speech' || codigo === 'aborted') {
            // Silencio o corte normal: la sesión simplemente termina.
            terminarSesion(numero, {});
          } else {
            terminarSesion(numero, { falloDuro: codigo });
          }
        },
      },
      idiomas[indiceIdioma] as string,
    );
  }

  return {
    async iniciar() {
      if (destruido) return;
      opciones.alEstado('iniciando');
      if (!(await motor.disponible())) {
        opciones.alEstado('no_disponible');
        return;
      }
      if (!(await motor.pedirPermiso())) {
        opciones.alEstado('sin_permiso');
        return;
      }
      if (destruido) return;
      activo = true;
      fallosRapidos = 0;
      fallosDuros = 0;
      ultimoCodigoDuro = null;
      opciones.alEstado('escuchando');
      armarInactividad();
      await lanzarSesion();
    },

    async pausar() {
      await apagar();
      opciones.alEstado('pausado');
    },

    async cerrarFraseAhora() {
      if (!activo) return;
      const numero = sesion;
      if (temporizadorReinicio) clearTimeout(temporizadorReinicio);
      if (textoSesion.trim()) {
        // Hay texto en vivo (navegador): se entrega ya, y lo que llegue después es de esta misma frase.
        ignorarParcialesHasta = Date.now() + 500;
        terminarSesion(numero, { texto: textoSesion });
        await detenerSeguro();
      } else {
        // Sin texto en vivo (celular): al detener, el celular entrega lo que alcanzó a oír.
        await detenerSeguro();
        if (temporizadorFin) clearTimeout(temporizadorFin);
        temporizadorFin = setTimeout(() => terminarSesion(numero, {}), ESPERA_RESULTADO_FINAL_MS);
      }
    },

    async destruir() {
      destruido = true;
      await apagar();
      await motor.limpiar();
    },
  };
}
