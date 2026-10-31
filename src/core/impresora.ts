/**
 * Vende Fácil — Configuración de Impresoras (Más > Configuración de Impresoras)
 * ------------------------------------------------------------
 * Solo guarda cuál impresora Bluetooth (ya emparejada por Android) se
 * usa para imprimir comprobantes, y si la impresión está activada.
 * Función Premium.
 */

export const CLAVE_IMPRESORA_ACTIVA = 'impresora_bluetooth_activa';
export const CLAVE_IMPRESORA_DIRECCION = 'impresora_bluetooth_direccion';
export const CLAVE_IMPRESORA_NOMBRE = 'impresora_bluetooth_nombre';
/** Ancho del papel de la ticketera: '58', '80' u 'otro' (entonces vale la cantidad de caracteres de abajo). */
export const CLAVE_IMPRESORA_PAPEL = 'impresora_papel';
export const CLAVE_IMPRESORA_CARACTERES = 'impresora_caracteres_por_linea';

/**
 * Interruptor manual de la impresión Bluetooth. En `false`, la
 * pantalla de Configuración de Impresión, la de Reimprimir documentos
 * y el botón 🖨️ de Inicio muestran "Próximamente" en vez de la
 * función real — aunque el plan sea Premium.
 *
 * Ya en `true` para poder probar con una impresora térmica Bluetooth
 * real desde el APK instalado en un Android. IMPORTANTE: dentro de un
 * navegador (Chrome en PC, o abriendo la app en el navegador del
 * celular) esto NO va a imprimir de verdad — `listarImpresorasEmparejadas`
 * / `imprimirEn` (infraestructura/impresora-bluetooth/impresora.ts)
 * muestran el aviso "La impresión Bluetooth solo funciona dentro de la
 * app instalada en el celular, no en el navegador." en cuanto se las
 * usa fuera del APK. El Bluetooth clásico (SPP) que usan las
 * ticketeras no es accesible desde un navegador, ni en PC ni en
 * celular — solo desde la app nativa. Se puede navegar y revisar la
 * pantalla en Chrome (para ver que el diseño se vea bien), pero la
 * prueba de impresión real necesita sí o sí el APK en un Android con
 * la ticketera ya emparejada por Bluetooth.
 */
export const IMPRESION_BLUETOOTH_DISPONIBLE = true;

// ------------------------------------------------------------
// Ancho del papel: 58 mm, 80 mm u otro
// ------------------------------------------------------------
// Las ticketeras Bluetooth baratas no informan el ancho de su papel, así que se elige a mano (con un ticket de
// prueba para comprobarlo). 58 mm es lo de siempre (32 caracteres por línea) y es el valor por defecto: quien no
// toque nada no ve ningún cambio.

export type PapelImpresora = '58' | '80' | 'otro';

export const CARACTERES_POR_PAPEL = { '58': 32, '80': 48 } as const;
export const CARACTERES_POR_LINEA_MINIMO = 32;
export const CARACTERES_POR_LINEA_MAXIMO = 48;

export interface AnchoImpresora {
  papel: PapelImpresora;
  /** Cuántos caracteres entran en una línea del ticket. */
  caracteres: number;
}

/** Un número de caracteres por línea válido (entero entre 32 y 48), o null si lo escrito no sirve. */
export function normalizarCaracteresPorLinea(texto: string | number | null | undefined): number | null {
  const n = typeof texto === 'number' ? texto : Number((texto ?? '').toString().trim());
  if (!Number.isInteger(n)) return null;
  return n >= CARACTERES_POR_LINEA_MINIMO && n <= CARACTERES_POR_LINEA_MAXIMO ? n : null;
}

/** Lee el ancho guardado. Sin nada guardado (o con algo raro) es 58 mm / 32 caracteres, como siempre. */
export function leerAnchoImpresora(papelGuardado: string | null, caracteresGuardados: string | null): AnchoImpresora {
  if (papelGuardado === '80') return { papel: '80', caracteres: CARACTERES_POR_PAPEL['80'] };
  if (papelGuardado === 'otro') {
    const caracteres = normalizarCaracteresPorLinea(caracteresGuardados);
    if (caracteres !== null) return { papel: 'otro', caracteres };
  }
  return { papel: '58', caracteres: CARACTERES_POR_PAPEL['58'] };
}

/** Cómo se nombra en pantalla y en el ticket de prueba: «58 mm», «80 mm» u «Otro (40 caracteres)». */
export function etiquetaAnchoImpresora(ancho: AnchoImpresora): string {
  if (ancho.papel === 'otro') return `Otro (${ancho.caracteres} caracteres)`;
  return `${ancho.papel} mm`;
}

/**
 * Pista por el nombre Bluetooth de la impresora («XP-58IIH», «MPT-80», «Printer 58mm»...): 58, 80 o null si el
 * nombre no lo dice. Es solo una sugerencia — el usuario la confirma — porque muchos nombres no traen el ancho.
 */
export function papelSugeridoPorNombre(nombre: string | null | undefined): '58' | '80' | null {
  const texto = nombre ?? '';
  const dice58 = /(^|\D)58(\D|$)/.test(texto);
  const dice80 = /(^|\D)80(\D|$)/.test(texto);
  if (dice58 === dice80) return null; // ninguno, o los dos (no se puede saber)
  return dice58 ? '58' : '80';
}

