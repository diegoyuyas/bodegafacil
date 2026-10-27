/**
 * Prueba el micrófono con el plugin REAL de Capacitor (@capacitor/core +
 * @capacitor-community/speech-recognition) sobre un "celular Android" simulado:
 * se finge el puente nativo (lo que en el APK hace Android) y se comprueba que
 * la app arranca, pide permiso, escucha, entrega frases y se reinicia sola.
 *
 * Esta prueba existe porque un error de programación que NO se ve en pruebas con
 * motores falsos dejó la pantalla en "Activando micrófono…" para siempre: el plugin
 * de Capacitor nunca debe devolverse desde una función async (se vuelve "thenable").
 *
 * Uso: npx tsx scripts/probar-voz-nativa.ts
 */

const g = globalThis as unknown as Record<string, unknown>;

type Llamada = { metodo: string; opciones: unknown };
const llamadas: Llamada[] = [];
let permiso: 'granted' | 'denied' | 'prompt' = 'granted';
/** Guion de lo que "oye" el celular en cada start(): frase, silencio (error) o fallo. */
let sesiones: ({ frase: string } | { error: string })[] = [];
const escuchas = new Map<string, (datos: unknown) => void>();

// Puente nativo falso: lo que Android responde a cada método del plugin.
g.androidBridge = {};
g.Capacitor = {
  PluginHeaders: [
    {
      name: 'SpeechRecognition',
      methods: [
        { name: 'available', rtype: 'promise' },
        { name: 'start', rtype: 'promise' },
        { name: 'stop', rtype: 'promise' },
        { name: 'isListening', rtype: 'promise' },
        { name: 'checkPermissions', rtype: 'promise' },
        { name: 'requestPermissions', rtype: 'promise' },
        { name: 'removeAllListeners', rtype: 'promise' },
        { name: 'addListener', rtype: 'callback' },
        { name: 'removeListener', rtype: 'promise' },
      ],
    },
  ],
  nativePromise: (_plugin: string, metodo: string, opciones: unknown) => {
    llamadas.push({ metodo, opciones });
    switch (metodo) {
      case 'available':
        return Promise.resolve({ available: true });
      case 'checkPermissions':
        return Promise.resolve({ speechRecognition: permiso });
      case 'requestPermissions':
        permiso = 'granted';
        return Promise.resolve({ speechRecognition: 'granted' });
      case 'start': {
        const sesion = sesiones.shift() ?? { error: 'No speech input' };
        return new Promise((resolver, rechazar) => {
          setTimeout(() => escuchas.get('listeningState')?.({ status: 'started' }), 20);
          setTimeout(() => {
            if ('frase' in sesion) resolver({ status: 'success', matches: [sesion.frase] });
            else rechazar(new Error(sesion.error));
          }, 300);
        });
      }
      case 'stop':
        return new Promise(() => {}); // el plugin real nunca responde a stop()
      default:
        return Promise.resolve();
    }
  },
  nativeCallback: (_plugin: string, metodo: string, opciones: { eventName?: string }, callback: (d: unknown) => void) => {
    if (metodo === 'addListener' && opciones.eventName) escuchas.set(opciones.eventName, callback);
    return 'id-' + (opciones.eventName ?? metodo);
  },
};

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));
function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

async function main() {
  // Se importa DESPUÉS de armar el puente, para que Capacitor crea que está dentro de un celular Android.
  const { crearReconocedorVoz } = await import('../src/infraestructura/voz/reconocimiento-voz');
  const { Capacitor } = await import('@capacitor/core');
  afirmar(Capacitor.isNativePlatform(), 'La prueba corre como si fuera un celular Android (plataforma nativa)');

  // 1. Arranque completo: disponible → permiso → escuchando → frases (con un silencio en medio).
  sesiones = [{ error: 'No speech input' }, { frase: 'dos gaseosa inka cola' }, { frase: 'guardar venta' }];
  const frases: string[] = [];
  const estados: string[] = [];
  const r = crearReconocedorVoz({
    alTextoParcial: () => {},
    alFrase: (t) => frases.push(t),
    alEstado: (e) => estados.push(e),
  });
  void r.iniciar();
  await pausa(2500);
  afirmar(estados.includes('escuchando'), `La pantalla pasa de «iniciando» a «escuchando» (estados: ${estados.join(' → ')})`);
  afirmar(
    llamadas.some((l) => l.metodo === 'available') && llamadas.some((l) => l.metodo === 'checkPermissions'),
    'Consulta al celular si hay voz disponible y si hay permiso',
  );
  afirmar(frases.join(' | ') === 'dos gaseosa inka cola | guardar venta', `Entrega las frases habladas, aun después de un silencio (${frases.join(' | ')})`);
  const inicio = llamadas.find((l) => l.metodo === 'start')?.opciones as { partialResults?: boolean; language?: string } | undefined;
  afirmar(inicio?.partialResults === false && inicio.language === 'es-PE', 'Pide la voz en español de Perú y SIN resultados parciales (así el celular sí informa sus errores)');

  // 2. Pausar responde enseguida aunque el stop() del plugin nunca conteste.
  const t0 = Date.now();
  await r.pausar();
  afirmar(Date.now() - t0 < 1500 && estados[estados.length - 1] === 'pausado', `Pausar responde enseguida (${Date.now() - t0} ms)`);
  await r.destruir();

  // 3. Sin permiso: pide el permiso al celular y, si lo da, escucha.
  permiso = 'prompt';
  sesiones = [{ frase: 'una leche' }];
  const estados2: string[] = [];
  const frases2: string[] = [];
  const r2 = crearReconocedorVoz({ alTextoParcial: () => {}, alFrase: (t) => frases2.push(t), alEstado: (e) => estados2.push(e) });
  void r2.iniciar();
  await pausa(1200);
  afirmar(llamadas.some((l) => l.metodo === 'requestPermissions'), 'Si falta el permiso, lo pide');
  afirmar(frases2[0] === 'una leche', 'Con el permiso concedido, escucha y entrega la frase');
  await r2.destruir();

  console.log('\n🎉 El micrófono funciona con el plugin real de Capacitor.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
