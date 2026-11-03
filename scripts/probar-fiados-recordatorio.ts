/**
 * Prueba de los recordatorios de Fiados (Etapa F3): «Recordado hace N días», teléfono agregado al
 * momento y el mensaje fijo con la antigüedad de la deuda. Lógica pura: no necesita celular.
 * (La columna nueva y su migración se prueban en `probar-migracion.ts`.)
 *
 * Uso: npx tsx scripts/probar-fiados-recordatorio.ts
 */
import { normalizarTelefonoIngresado, textoRecordado } from '../src/core/fiados-recordatorio';
import { construirMensajeDeuda } from '../src/core/whatsapp';
import type { Cliente, DeudaPendienteDetalle } from '../src/core/tipos';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

// ---- «Recordado hace N días»
const hoy = '2026-10-31';
afirmar(textoRecordado(null, hoy) === '', 'Nunca recordado: no se muestra nada');
afirmar(textoRecordado('2026-10-31 09:15:00', hoy) === 'Recordado hoy', 'Recordado hoy');
afirmar(textoRecordado('2026-10-30 23:59:59', hoy) === 'Recordado ayer', 'Recordado ayer (aunque haya sido a las 23:59)');
afirmar(textoRecordado('2026-10-29 08:00:00', hoy) === 'Recordado hace 2 días', 'Recordado hace 2 días');
afirmar(textoRecordado('2026-10-01 08:00:00', hoy) === 'Recordado hace 30 días', 'Recordado hace 30 días');
afirmar(textoRecordado('2026-09-30 20:00:00', hoy) === 'Recordado hace 31 días', 'Cambio de mes: del 30/09 al 31/10 son 31 días');
afirmar(textoRecordado('2025-12-31 10:00:00', '2026-01-01') === 'Recordado ayer', 'Cambio de año: del 31/12 al 01/01 es ayer');
afirmar(textoRecordado('2026-11-02 10:00:00', hoy) === 'Recordado hoy', 'Una fecha futura (reloj cambiado) se trata como hoy, nunca como número negativo');
afirmar(textoRecordado('basura', hoy) === '' && textoRecordado('', hoy) === '', 'Una fecha mal escrita no rompe: no se muestra nada');

// ---- Teléfono agregado al momento
afirmar(normalizarTelefonoIngresado('987654321').telefono === '987654321', 'Teléfono de 9 dígitos válido');
afirmar(normalizarTelefonoIngresado(' 987 654 321 ').telefono === '987654321', 'Se quitan los espacios');
afirmar(normalizarTelefonoIngresado('987-654-321').telefono === '987654321', 'Se quitan los guiones');
afirmar(normalizarTelefonoIngresado('+51 987 654 321').telefono === '51987654321', 'Acepta «+» al inicio (guarda solo dígitos)');
afirmar(normalizarTelefonoIngresado('(01) 234 5678').telefono === '012345678', 'Acepta paréntesis de teléfonos fijos');
afirmar(normalizarTelefonoIngresado('').error === 'Escribe el teléfono.' && normalizarTelefonoIngresado('   ').error === 'Escribe el teléfono.', 'Vacío: pide escribirlo');
afirmar(normalizarTelefonoIngresado('98765abc1').error === 'Solo números, sin letras.', 'Con letras: error claro');
afirmar(normalizarTelefonoIngresado('12345').error === 'Debe tener entre 6 y 12 dígitos.', 'Muy corto (5 dígitos): error');
afirmar(normalizarTelefonoIngresado('1234567890123').error === 'Debe tener entre 6 y 12 dígitos.', 'Muy largo (13 dígitos): error');
afirmar(normalizarTelefonoIngresado('123456').telefono === '123456' && normalizarTelefonoIngresado('123456789012').telefono === '123456789012', 'Los límites 6 y 12 dígitos son válidos');
afirmar(normalizarTelefonoIngresado('12345').telefono === null, 'Si hay error no se devuelve teléfono para guardar');

// ---- Mensaje fijo con la antigüedad
const cliente: Cliente = { id: 1, nombre: 'Ana', documento: null, telefono: '987654321', direccion: null, saldoPendiente: 45, fechaUltimoPago: null, ultimoRecordatorioEn: null, fechaCompromiso: null, activo: true, creadoEn: '2026-01-01 08:00:00' };
const deudas: DeudaPendienteDetalle[] = [{ ventaId: 7, fecha: '2026-10-11 09:00:00', montoOriginal: 45, saldoPendiente: 45, lineas: [{ producto: 'Arroz', cantidad: 2 }] }];
const conDias = construirMensajeDeuda(cliente, deudas, 'S/', 20);
afirmar(conDias.includes('Hola Ana') && conDias.includes('Total pendiente: S/ 45.00'), 'Mensaje: nombre y total pendiente');
afirmar(conDias.includes('Tu deuda más antigua es de hace 20 días.'), 'Mensaje: incluye la antigüedad («de hace 20 días»)');
afirmar(construirMensajeDeuda(cliente, deudas, 'S/', 1).includes('es de ayer.') && construirMensajeDeuda(cliente, deudas, 'S/', 0).includes('es de hoy.'), 'Mensaje: «de ayer» y «de hoy»');
afirmar(conDias.indexOf('Tu deuda más antigua') < conDias.indexOf('Total pendiente'), 'La antigüedad va antes del total');
const sinDias = construirMensajeDeuda(cliente, deudas, 'S/');
afirmar(!sinDias.includes('más antigua') && sinDias.includes('Total pendiente: S/ 45.00'), 'Sin dato de antigüedad el mensaje queda como siempre');
afirmar(!construirMensajeDeuda(cliente, deudas, 'S/', null).includes('más antigua'), 'Con antigüedad null tampoco se muestra la línea');

console.log('🎉 Todas las pruebas de Fiados F3 pasaron.');
