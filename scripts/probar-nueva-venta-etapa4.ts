/**
 * Prueba de la Etapa 4 de Nueva venta: WhatsApp, ticket e impresión se ofrecen DESPUÉS de cobrar (pantalla «Venta
 * guardada»), no con casillas antes de la venta. Revisión del código fuente (el aspecto real solo se ve en el celular).
 *
 * Uso: npx tsx scripts/probar-nueva-venta-etapa4.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

const raiz = path.join(__dirname, '..');
const pagina = readFileSync(path.join(raiz, 'src/app/ventas/nueva/page.tsx'), 'utf8').replace(/\r\n/g, '\n');
const iconos = readFileSync(path.join(raiz, 'src/components/ui/iconos.tsx'), 'utf8').replace(/\r\n/g, '\n');

// ---- Fuera del formulario
afirmar(!pagina.includes('Enviar venta a WhatsApp') && !pagina.includes('Guardar ticket como...') && !pagina.includes('Genera una imagen del comprobante'), 'El formulario ya no tiene las casillas «Enviar venta a WhatsApp» ni «Guardar ticket como…» ni sus textos');
afirmar(!/\benviarWhatsApp\b/.test(pagina) && !/\bguardarTicket\b/.test(pagina), 'Ya no existen esos estados: la venta no depende de casillas');
afirmar(!pagina.includes('se abrirá WhatsApp con el detalle'), 'La vista previa ya no promete abrir WhatsApp al confirmar');
const iConfirmar = pagina.indexOf('async function confirmarVenta()');
const confirmar = pagina.slice(iConfirmar, pagina.indexOf('async function adjuntarFotoComprobante', iConfirmar));
afirmar(!confirmar.includes('abrirWhatsAppDeVenta(') && !confirmar.includes('guardarTicketComoImagen(') && !confirmar.includes('Ingresa un número de celular'), 'Al confirmar, la venta solo se guarda: no abre WhatsApp ni genera el ticket por su cuenta, ni exige un celular');
afirmar(confirmar.includes('telefonoWhatsapp: clienteSeleccionado?.telefono ?? null') && confirmar.includes('setVentaGuardada(venta)') && confirmar.includes("setEtapa('guardada')"), 'Se sigue guardando el teléfono del cliente en la venta y se pasa a «Venta guardada»');

// ---- Pantalla «Venta guardada»
const iGuardada = pagina.indexOf("if (etapa === 'guardada') {");
const guardada = pagina.slice(iGuardada, pagina.indexOf("if (etapa === 'revisando'", iGuardada));
afirmar(guardada.includes('Venta guardada') && guardada.includes('✓'), 'Sigue la pantalla «Venta guardada ✓» con el total');
const iWa = guardada.indexOf('\n              WhatsApp\n');
const iTi = guardada.indexOf("'Ticket'");
const iIm = guardada.indexOf("'Imprimir'");
const iNueva = guardada.indexOf('            Nueva venta\n');
afirmar(iWa > 0 && iTi > iWa && iIm > iTi && iNueva > iIm, 'Orden: WhatsApp, Ticket, Imprimir y debajo «Nueva venta»');
afirmar(guardada.includes('grid auto-cols-fr grid-flow-col gap-2') && (guardada.match(/flex h-16 flex-col items-center justify-center gap-1 rounded-xl border-2/g) ?? []).length === 3, 'Los 3 botones van en fila, iguales a los del detalle de un pedido (ícono arriba, texto abajo)');
afirmar(guardada.includes('<IconoWhatsApp tamano={24}') && guardada.includes('<IconoTicket tamano={24} />') && guardada.includes('<IconoImpresora tamano={24} />'), 'Cada botón con su ícono: WhatsApp, ticket e impresora');
afirmar(guardada.includes('onClick={enviarWhatsAppGuardada}') && guardada.includes('onClick={guardarTicketGuardada}') && guardada.includes('onClick={imprimirGuardada}'), 'Cada botón hace su acción sobre la venta ya guardada');
afirmar(guardada.includes('disabled={!esPremium || accionOcupada !== null}') && guardada.includes('Ticket e imprimir son'), 'Ticket sigue siendo Premium (deshabilitado con aviso) y WhatsApp sigue libre');
afirmar(guardada.includes('IMPRESION_BLUETOOTH_DISPONIBLE && impresoraActiva && esPremium'), 'Imprimir solo aparece si la impresora está disponible y activada (y el plan es Premium)');
afirmar(guardada.includes('{mensajeTicket && <p className="text-sm text-alerta">{mensajeTicket}</p>}'), 'Los errores de ticket, impresora o celular se muestran en esta pantalla');
afirmar(guardada.includes('empezarNuevaVenta') && guardada.includes('Volver a inicio'), 'Siguen «Nueva venta» y «Volver a inicio»');

// ---- WhatsApp: usa el teléfono del cliente o lo pide en el momento
const iFuncion = pagina.indexOf('function enviarWhatsAppGuardada()');
const funcion = pagina.slice(iFuncion, pagina.indexOf('async function guardarTicketGuardada', iFuncion));
afirmar(funcion.includes('if (ventaGuardada.telefonoWhatsapp) {') && funcion.includes('abrirWhatsAppDeVenta(ventaGuardada, ventaGuardada.telefonoWhatsapp)') && funcion.includes('setPidiendoCelular(true)'), 'WhatsApp usa el teléfono guardado de la venta (el del cliente) y, si no hay, pide el número ahí mismo');
afirmar(funcion.includes('actualizarTelefonoWhatsapp(ventaGuardada.id, telefono)') && funcion.includes('Ingresa un número de celular'), 'El número escrito se guarda en la venta (para no pedirlo al reenviar desde Pedidos) y no se envía sin número');
afirmar(guardada.includes('{pidiendoCelular && (') && guardada.includes('Número de celular') && guardada.includes('onClick={enviarWhatsAppConCelular}'), 'El pedido de celular aparece solo después de tocar WhatsApp sin teléfono');
afirmar(pagina.includes('guardarTicketComoImagen(contenedor, ventaGuardada.id)') && pagina.includes('imprimirComprobanteDeVenta(contenedor, ventaGuardada.id)') && pagina.includes('No está correctamente configurada la impresora.'), 'Ticket e impresión usan la venta guardada y avisan si la impresora no está configurada');
const iNuevaFn = pagina.indexOf('function empezarNuevaVenta()');
const nuevaFn = pagina.slice(iNuevaFn, pagina.indexOf("if (cargando) {", iNuevaFn));
afirmar(nuevaFn.includes('setPidiendoCelular(false)') && nuevaFn.includes('setVentaGuardada(null)') && nuevaFn.includes("setTelefonoCelular('')"), 'Al empezar otra venta se limpia todo lo de la anterior');

// ---- Ícono
afirmar(iconos.includes('export const IconoTicket') && iconos.includes('M9 8h6M9 12h6'), 'Ícono de ticket (recibo con líneas) agregado');

console.log('🎉 Todas las pruebas de la Etapa 4 de Nueva venta pasaron.');
