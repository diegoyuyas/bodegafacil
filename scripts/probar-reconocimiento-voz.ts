/**
 * Prueba del micrófono continuo (src/infraestructura/voz/reconocimiento-voz.ts)
 * con un reconocedor de voz SIMULADO (no usa el micrófono real).
 * Uso: npx tsx scripts/probar-reconocimiento-voz.ts
 */
import {
  crearReconocedorConMotor,
  crearReconocedorVoz,
  type EstadoVoz,
  type Motor,
} from '../src/infraestructura/voz/reconocimiento-voz';

type Guion = { parciales: string[]; terminaTrasMs: number } | 'silencio' | 'falla_rapida';

const g = globalThis as unknown as Record<string, unknown>;
let guiones: Guion[] = [];
let sesionesIniciadas = 0;

class ReconocedorFalso {
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  start() {
    sesionesIniciadas += 1;
    const guion = guiones.shift() ?? 'silencio';
    if (guion === 'falla_rapida') {
      setTimeout(() => this.onend?.(), 20);
      return;
    }
    if (guion === 'silencio') {
      setTimeout(() => this.onend?.(), 1500);
      return;
    }
    guion.parciales.forEach((texto, i) => setTimeout(() => this.onresult?.({ results: [{ 0: { transcript: texto } }] }), 100 * (i + 1)));
    setTimeout(() => this.onend?.(), guion.terminaTrasMs);
  }
  stop() {
    setTimeout(() => this.onend?.(), 10);
  }
  abort() {}
}
g.window = { SpeechRecognition: ReconocedorFalso };
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));
function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

// ------------------------------------------------------------
// Motor simulado que se comporta como el plugin nativo de Android:
//  - cada sesión termina con una frase (final), con silencio (error 'no-speech') o con un fallo;
//  - su stop() NUNCA responde (es un fallo conocido del plugin);
//  - registra en qué idioma se pidió cada sesión.
// ------------------------------------------------------------
type Sesion = { tipo: 'frase'; texto: string; tardaMs: number } | { tipo: 'silencio'; tardaMs: number } | { tipo: 'falla'; codigo: string; tardaMs: number };

function crearMotorNativoSimulado(guion: Sesion[]) {
  const idiomasPedidos: string[] = [];
  const motor: Motor = {
    disponible: async () => true,
    pedirPermiso: async () => true,
    iniciarSesion: async (h, idioma) => {
      idiomasPedidos.push(idioma);
      const s = guion.shift() ?? { tipo: 'silencio' as const, tardaMs: 1500 };
      setTimeout(() => {
        if (s.tipo === 'frase') h.final(s.texto);
        else if (s.tipo === 'silencio') h.error('no-speech');
        else h.error(s.codigo);
      }, s.tardaMs);
      if (s.tipo === 'frase') setTimeout(() => h.hablando(true), 20);
    },
    detenerSesion: () => new Promise<void>(() => {}), // nunca responde, como el plugin real
    limpiar: async () => {},
  };
  return { motor, idiomasPedidos };
}

async function pruebasMotorNativo() {
  console.log('\n--- Motor nativo simulado (como el plugin real de Android) ---');

  // A. Una frase, silencio, otra frase: sigue escuchando aunque pasen silencios (el fallo que se vio en el celular).
  {
    const { motor } = crearMotorNativoSimulado([
      { tipo: 'silencio', tardaMs: 1500 },
      { tipo: 'frase', texto: 'dos coca cola', tardaMs: 300 },
      { tipo: 'silencio', tardaMs: 1500 },
      { tipo: 'frase', texto: 'guardar venta', tardaMs: 300 },
    ]);
    const frases: string[] = [];
    const hablando: boolean[] = [];
    const r = crearReconocedorConMotor(
      { alTextoParcial: () => {}, alFrase: (t) => frases.push(t), alEstado: () => {}, alHablar: (h) => hablando.push(h) },
      motor,
    );
    await r.iniciar();
    await pausa(4600);
    afirmar(frases.join(' | ') === 'dos coca cola | guardar venta', `Tras un silencio sigue escuchando y entrega las frases (${frases.join(' | ')})`);
    afirmar(hablando.includes(true), 'Avisa cuándo se oye hablar a la persona');
    await r.destruir();
  }

  // B. Pausar NO se queda colgado aunque el stop() del plugin no responda.
  {
    const { motor } = crearMotorNativoSimulado([{ tipo: 'silencio', tardaMs: 5000 }]);
    const estados: EstadoVoz[] = [];
    const r = crearReconocedorConMotor({ alTextoParcial: () => {}, alFrase: () => {}, alEstado: (e) => estados.push(e) }, motor);
    await r.iniciar();
    const t0 = Date.now();
    await r.pausar();
    afirmar(Date.now() - t0 < 1500 && estados[estados.length - 1] === 'pausado', `Pausar responde enseguida aunque el stop() no conteste (${Date.now() - t0} ms)`);
    await r.destruir();
  }

  // C. Sin internet y sin paquete de voz: avisa con la explicación, no se queda "escuchando" en falso.
  {
    const { motor } = crearMotorNativoSimulado(Array.from({ length: 6 }, () => ({ tipo: 'falla' as const, codigo: 'network', tardaMs: 50 })));
    const estados: { e: EstadoVoz; d?: string }[] = [];
    const r = crearReconocedorConMotor({ alTextoParcial: () => {}, alFrase: () => {}, alEstado: (e, d) => estados.push({ e, d }) }, motor);
    await r.iniciar();
    await pausa(4500);
    const ultimo = estados[estados.length - 1];
    afirmar(ultimo?.e === 'error' && !!ultimo.d?.includes('paquete de voz'), 'Sin internet ni paquete de voz: avisa el motivo y cómo descargar el paquete');
    await r.destruir();
  }

  // D. Fallos inmediatos (idioma no soportado): prueba otras variantes del español antes de rendirse.
  {
    const { motor, idiomasPedidos } = crearMotorNativoSimulado(Array.from({ length: 12 }, () => ({ tipo: 'silencio' as const, tardaMs: 30 })));
    const r = crearReconocedorConMotor({ alTextoParcial: () => {}, alFrase: () => {}, alEstado: () => {} }, motor);
    await r.iniciar();
    await pausa(3500);
    afirmar(new Set(idiomasPedidos).size >= 3, `Si falla seguido, prueba otras variantes del español (${[...new Set(idiomasPedidos)].join(', ')})`);
    afirmar(idiomasPedidos.length <= 7, `y no reinicia sin fin (${idiomasPedidos.length} intentos)`);
    await r.destruir();
  }

  // E. Permiso denegado.
  {
    const { motor } = crearMotorNativoSimulado([{ tipo: 'falla', codigo: 'not-allowed', tardaMs: 30 }]);
    const estados: EstadoVoz[] = [];
    const r = crearReconocedorConMotor({ alTextoParcial: () => {}, alFrase: () => {}, alEstado: (e) => estados.push(e) }, motor);
    await r.iniciar();
    await pausa(1000);
    afirmar(estados[estados.length - 1] === 'sin_permiso', 'Un permiso denegado se avisa como «sin permiso»');
    await r.destruir();
  }
}


async function main() {
  // 1. Dos frases seguidas, sin tocar nada: el micrófono se reinicia solo.
  guiones = [
    { parciales: ['dos', 'dos coca', 'dos coca cola'], terminaTrasMs: 500 },
    { parciales: ['una leche'], terminaTrasMs: 400 },
  ];
  const frases: string[] = [];
  const estados: EstadoVoz[] = [];
  const reconocedor = crearReconocedorVoz({
    segundosInactividad: 3,
    alTextoParcial: () => {},
    alFrase: (t) => frases.push(t),
    alEstado: (e) => estados.push(e),
  });
  await reconocedor.iniciar();
  await pausa(3200);
  afirmar(frases.join(' | ') === 'dos coca cola | una leche', `Escucha de forma continua y entrega cada frase una sola vez (${frases.join(' | ')})`);
  afirmar(sesionesIniciadas >= 3, `Se reinició sola entre frases (${sesionesIniciadas} sesiones)`);
  afirmar(estados.includes('escuchando'), 'Avisa que está escuchando');

  // 2. Inactividad: tras unos segundos sin oír nada, se apaga sola.
  await pausa(3000);
  afirmar(estados[estados.length - 1] === 'pausado', 'Sin oír nada por un rato, el micrófono se pausa solo');
  await reconocedor.destruir();

  // 3. Fallos rápidos repetidos (micrófono o paquete de voz con problemas): se rinde y avisa.
  guiones = Array.from({ length: 12 }, () => 'falla_rapida' as const);
  sesionesIniciadas = 0;
  const estados2: EstadoVoz[] = [];
  const r2 = crearReconocedorVoz({ alTextoParcial: () => {}, alFrase: () => {}, alEstado: (e) => estados2.push(e) });
  await r2.iniciar();
  await pausa(6500);
  afirmar(estados2[estados2.length - 1] === 'error', `Tras fallos seguidos avisa el error en vez de reiniciar sin fin (${sesionesIniciadas} intentos)`);
  afirmar(sesionesIniciadas <= 6, 'No se queda en un bucle infinito');
  await r2.destruir();

  // 4. Cerrar la frase ya ("guardar venta"), sin esperar el silencio.
  guiones = [{ parciales: ['dos coca guardar'], terminaTrasMs: 5000 }];
  const frases3: string[] = [];
  const r3 = crearReconocedorVoz({
    alTextoParcial: (t) => {
      if (t.includes('guardar')) void r3.cerrarFraseAhora();
    },
    alFrase: (t) => frases3.push(t),
    alEstado: () => {},
  });
  const t0 = Date.now();
  await r3.iniciar();
  await pausa(900);
  afirmar(frases3.join('|') === 'dos coca guardar', `La frase se cierra al instante (${Date.now() - t0} ms, sin esperar el fin de la sesión)`);
  await r3.destruir();

  // 5. Pausar de verdad.
  guiones = [{ parciales: ['hola'], terminaTrasMs: 300 }];
  const estados4: EstadoVoz[] = [];
  const r4 = crearReconocedorVoz({ alTextoParcial: () => {}, alFrase: () => {}, alEstado: (e) => estados4.push(e) });
  await r4.iniciar();
  await r4.pausar();
  const antes = sesionesIniciadas;
  await pausa(1200);
  afirmar(estados4[estados4.length - 1] === 'pausado' && sesionesIniciadas === antes, 'Pausar detiene el micrófono y no se reinicia');
  await r4.destruir();

  // 6. Sin soporte de voz.
  g.window = {};
  const estados5: EstadoVoz[] = [];
  const r5 = crearReconocedorVoz({ alTextoParcial: () => {}, alFrase: () => {}, alEstado: (e) => estados5.push(e) });
  await r5.iniciar();
  afirmar(estados5[estados5.length - 1] === 'no_disponible', 'Sin soporte de voz avisa «no disponible» (sin romper nada)');
  await pruebasMotorNativo();
  console.log('\n🎉 El micrófono continuo funciona.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
