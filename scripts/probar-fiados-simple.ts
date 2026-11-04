/**
 * Prueba de la pantalla Fiados simplificada: lista de nombre y monto, pop-up por cliente (Enviar deuda por
 * WhatsApp, Cobrar, Historial plegado con «Anular» en cada pago), historial por fechas al final y lo que ya no está.
 * Revisión del código fuente (el aspecto real solo se ve en el celular).
 *
 * Uso: npx tsx scripts/probar-fiados-simple.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

const raiz = path.join(__dirname, '..');
const leer = (ruta: string) => readFileSync(path.join(raiz, ruta), 'utf8').replace(/\r\n/g, '\n');
const pagina = leer('src/app/fiados/page.tsx');
const hoja = leer('src/components/hoja-opciones.tsx');
const permisos = leer('src/hooks/usar-permisos.tsx');
const inicio = leer('src/app/page.tsx');

// ---- Pantalla principal
afirmar(pagina.includes('>Te deben</p>') && pagina.includes('deudaTotal') && pagina.includes("clientes.length === 1 ? 'cliente' : 'clientes'"), 'Arriba: «Te deben S/ X» y cuántos clientes');
const iLista = pagina.indexOf('filasVisibles.map(');
const iFinLista = pagina.indexOf('</ul>', iLista);
const lista = pagina.slice(iLista, iFinLista);
afirmar(lista.includes('cliente.nombre') && lista.includes('cliente.saldoPendiente') && lista.includes('abrirCliente(cliente)') && !lista.includes('WhatsApp') && !lista.includes('Detalle') && !lista.includes('Agregar teléfono'), 'La fila es solo nombre y monto, sin botones: toda la fila se toca');
afirmar(pagina.includes('Nadie te debe 🎉') && pagina.includes('Buscar por nombre, teléfono o DNI…') && pagina.includes('coincideConBusqueda'), 'Se conserva el buscador y el mensaje «Nadie te debe»');
afirmar(pagina.includes('b.saldoPendiente - a.saldoPendiente'), 'Quien más debe va primero');

// ---- Lo que ya no está
for (const texto of ['Solo vencidos', 'Compromisos vencidos', 'ORDENES_FIADOS', 'Me paga el…', 'guardarCompromiso', 'Estado de cuenta</', 'compartirEstadoCuenta(', 'textoAntiguedad', 'Pagar la mitad', 'Ver historial por fechas']) {
  afirmar(!pagina.includes(texto), `Fiados ya no tiene «${texto}»`);
}

// ---- Pop-up del cliente
afirmar(pagina.includes('<HojaOpciones') && pagina.includes('clienteAbierto &&'), 'Al tocar un cliente se abre un pop-up desde abajo');
const iPop = pagina.indexOf('<HojaOpciones');
const pop = pagina.slice(iPop);
const iEnviar = pop.indexOf('Enviar deuda por WhatsApp');
const iCobrar = pop.indexOf('>Cobrar</p>');
const iHist = pop.indexOf('<span>Historial</span>');
afirmar(pop.indexOf('>Debe</p>') >= 0 && pop.indexOf('>Debe</p>') < iEnviar && iEnviar < iCobrar && iCobrar < iHist, 'Orden del pop-up: Debe, Enviar deuda por WhatsApp, Cobrar, Historial');
afirmar(pagina.includes('construirMensajeEstadoCuenta(construirDatosEstadoCuenta(contenedor, clienteId))'), '«Enviar deuda» manda el Estado de cuenta (pedidos con fecha, hora y detalle, y el saldo)');
afirmar(pagina.includes('setPidiendoTelefono(true)') && pagina.includes('Guardar y enviar') && pagina.includes('guardarTelefonoYEnviar') && pagina.includes('contenedor.clientes.guardarTelefono('), 'Sin celular: pide el número en el mismo pop-up, lo guarda y envía');
afirmar(pagina.includes("pedirPermiso('modificar_cliente'") && pagina.includes("pedirPermiso('registrar_pago_fiado'") && pagina.includes("pedirPermiso('anular_pago_fiado'"), 'Guardar el celular, cobrar y anular un pago conservan su permiso');
afirmar(pagina.includes('disabled={!esPremium}') && pagina.includes('Enviar por WhatsApp es'), 'Enviar por WhatsApp sigue siendo Premium');
afirmar(pop.includes('Cobrar todo') && pop.includes('METODOS.map') && pop.includes('Registrar pago') && pop.includes('contenedor.fiados.registrarPago(') === false && pagina.includes('contenedor.fiados.registrarPago(cliente.id, montoPagado, metodo, fotoPago)'), 'Cobrar: monto, «Cobrar todo», forma de pago y «Registrar pago»');
afirmar(pop.includes('setHistorialClienteAbierto((v) => !v)') && pop.includes('Pedidos al fiado') && pop.includes('Pagos realizados') && pop.includes('Anular pago') && pop.includes('Motivo de la anulación (obligatorio)'), 'Historial plegado con los pedidos al fiado y los pagos, cada pago con su «Anular» y motivo');
afirmar(pagina.includes('setPagoReciente({') && pagina.includes('Pago registrado ✓') && pagina.includes('cerrarCliente();'), 'Tras cobrar: aviso «Pago registrado ✓» arriba y el pop-up se cierra');

// ---- Historial por fechas al final de la lista
const iHistFechas = pagina.indexOf('aria-label="Historial por fechas"');
afirmar(iHistFechas > iFinLista && pagina.includes('type="date"') && pagina.includes('alternarHistorial'), '«Historial por fechas» va después de la lista, plegado, con Desde y Hasta');
afirmar(pagina.includes('listarClientesConHistorialFiado(desde || undefined, hasta || undefined)') && pagina.includes('Pagado'), 'El historial por fechas incluye también a quienes ya pagaron');

// ---- Pop-ups: sin barra en Fiados, y ventanas de permiso por encima
afirmar(hoja.includes('mostrarBarraInferior(pathname)') && hoja.includes("'bottom-0'") && hoja.includes('usarEscribiendo()'), 'El pop-up llega hasta abajo en pantallas sin barra (Fiados) y mientras se escribe');
afirmar(permisos.includes('<EnCuerpo>') && permisos.includes('</EnCuerpo>'), 'Las ventanas de PIN/permiso se dibujan en <body>, por encima de cualquier pop-up (no quedan escondidas detrás)');

// ---- Inicio
afirmar(!inicio.includes('clientesVencidos') && !inicio.includes('compromisosVencidos') && inicio.includes('totalPorCobrar: resumenDelDia.totalPorCobrar'), 'Inicio ya no calcula fiados vencidos: solo «pendientes de cobro»');

console.log('🎉 Todas las pruebas de Fiados simplificado pasaron.');
