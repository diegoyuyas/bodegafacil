/**
 * Prueba de la lógica del Backup Automático con aviso (notificación) y pantalla de compartir:
 * cuándo debe sonar el aviso, qué hacer al tocarlo, cuándo toca el backup al abrir la app,
 * el interruptor «Preguntar dónde guardar» y la espera durante una venta.
 *
 * Uso: npx tsx scripts/probar-backup-aviso.ts
 */
import {
  accionAlTocarAviso,
  calcularProximoAviso,
  debeEsperarPorVenta,
  preguntarDestinoActivo,
  sumarDiasAFechaIso,
  tocaEjecutarBackupAutomatico,
  type ConfigBackupAutomatico,
} from '../src/core/backup-automatico';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

const config = (extra: Partial<ConfigBackupAutomatico> = {}): ConfigBackupAutomatico => ({
  activo: true,
  nombreArchivo: '',
  hora: '08:00',
  frecuenciaDias: 1,
  ultimaFecha: null,
  ...extra,
});
const aviso = (c: ConfigBackupAutomatico, hoy: string, ahora: string) => {
  const a = calcularProximoAviso(c, hoy, ahora);
  return a ? `${a.fecha} ${a.hora}` : null;
};

const HOY = '2026-10-28';

// Interruptor
afirmar(preguntarDestinoActivo(null) && preguntarDestinoActivo('1') && !preguntarDestinoActivo('0'), 'El interruptor «Preguntar dónde guardar» viene ACTIVADO por defecto y solo «0» lo apaga');

// Fechas
afirmar(sumarDiasAFechaIso('2026-10-28', 1) === '2026-10-29' && sumarDiasAFechaIso('2026-10-28', 3) === '2026-10-31', 'Sumar días dentro del mes');
afirmar(sumarDiasAFechaIso('2026-12-30', 3) === '2027-01-02' && sumarDiasAFechaIso('2026-10-31', 1) === '2026-11-01', 'Sumar días cruzando de mes y de año');
afirmar(sumarDiasAFechaIso('2028-02-28', 1) === '2028-02-29' && sumarDiasAFechaIso('2027-02-28', 1) === '2027-03-01', 'Años bisiestos bien calculados');
afirmar(sumarDiasAFechaIso('2026-10-28', 0) === '2026-10-28' && sumarDiasAFechaIso('2026-03-01', -1) === '2026-02-28', 'Sumar 0 o restar días también funciona');

// Cuándo suena el aviso
afirmar(aviso(config({ activo: false }), HOY, '07:00') === null, 'Backup desactivado: no se programa ningún aviso');
afirmar(aviso(config(), HOY, '07:00') === `${HOY} 08:00`, 'Nunca se hizo y aún no llega la hora: el aviso es hoy a la hora configurada');
afirmar(aviso(config(), HOY, '09:00') === '2026-10-29 08:00', 'Nunca se hizo y la hora de hoy ya pasó: el aviso queda para mañana (hoy se hace al abrir la app)');
afirmar(aviso(config(), HOY, '08:00') === '2026-10-29 08:00', 'A la hora exacta ya no suena hoy: queda para mañana');
afirmar(aviso(config({ ultimaFecha: '2026-10-27' }), HOY, '07:00') === `${HOY} 08:00`, 'Último backup ayer y frecuencia 1: el aviso es hoy');
afirmar(aviso(config({ ultimaFecha: HOY }), HOY, '09:00') === '2026-10-29 08:00', 'Si el backup de hoy ya se hizo, el siguiente aviso es el de mañana (el de hoy se cancela)');
afirmar(aviso(config({ ultimaFecha: HOY, frecuenciaDias: 3 }), HOY, '09:00') === '2026-10-31 08:00', 'Frecuencia 3 días: el siguiente aviso es dentro de 3 días');
afirmar(aviso(config({ ultimaFecha: '2026-10-18', frecuenciaDias: 3 }), HOY, '07:00') === `${HOY} 08:00`, 'Backup muy atrasado: el aviso es hoy (no en una fecha del pasado)');
afirmar(aviso(config({ ultimaFecha: '2026-10-18', frecuenciaDias: 3 }), HOY, '10:00') === '2026-10-29 08:00', 'Atrasado y la hora ya pasó: mañana (hoy se hace al abrir la app)');
afirmar(aviso(config({ ultimaFecha: '2026-12-30', frecuenciaDias: 3 }), '2026-12-31', '07:00') === '2027-01-02 08:00', 'El aviso cruza bien de un año a otro');
afirmar(aviso(config({ ultimaFecha: '2026-10-30' }), HOY, '07:00') === '2026-10-31 08:00', 'Si el reloj del teléfono retrocedió, el aviso sigue la fecha del último backup (nunca queda en el pasado)');
afirmar(aviso(config({ hora: '03:00' }), HOY, '02:59') === `${HOY} 03:00`, 'Respeta la hora configurada (03:00)');

// Al tocar el aviso
afirmar(accionAlTocarAviso(config(), HOY) === 'generar', 'Tocar el aviso sin backup previo: se genera');
afirmar(accionAlTocarAviso(config({ ultimaFecha: '2026-10-27' }), HOY) === 'generar', 'Tocar el aviso con último backup de ayer: se genera');
afirmar(accionAlTocarAviso(config({ ultimaFecha: HOY }), HOY) === 'ya_hecho', 'Tocar el aviso cuando el backup de hoy ya se hizo: solo se informa (no se repite)');
afirmar(accionAlTocarAviso(config({ activo: false }), HOY) === 'ninguna', 'Tocar un aviso viejo con el backup desactivado: no hace nada');

// Abrir la app pasada la hora (sigue igual que antes)
afirmar(tocaEjecutarBackupAutomatico(config(), HOY, '09:00'), 'Abrir la app pasada la hora y sin backup de hoy: toca hacerlo');
afirmar(!tocaEjecutarBackupAutomatico(config(), HOY, '07:00'), 'Abrir la app antes de la hora: todavía no toca');
afirmar(!tocaEjecutarBackupAutomatico(config({ ultimaFecha: HOY }), HOY, '09:00'), 'Si hoy ya se hizo (por el aviso o al abrir), no se repite');
afirmar(!tocaEjecutarBackupAutomatico(config({ ultimaFecha: '2026-10-27', frecuenciaDias: 2 }), HOY, '09:00'), 'Frecuencia 2 con backup de ayer: todavía no toca');

// Esperar mientras hay una venta en curso
afirmar(
  debeEsperarPorVenta('/ventas/nueva') && debeEsperarPorVenta('/ventas/voz') && debeEsperarPorVenta('/ventas') && debeEsperarPorVenta('/ventas/nueva/'),
  'El backup con pantalla de compartir espera si estás en Nueva venta o venta por voz',
);
afirmar(!debeEsperarPorVenta('/') && !debeEsperarPorVenta('/mas') && !debeEsperarPorVenta('/mas/configuracion/backup-automatico') && !debeEsperarPorVenta('/ventasx'), 'En Inicio, Más y el resto de pantallas no espera');

console.log('\n🎉 Backup Automático con aviso y pantalla de compartir: la lógica funciona.');
