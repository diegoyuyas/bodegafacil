/**
 * Prueba de la mejora de «Clientes»: documento y celular con su rótulo (DNI / RUC / Doc. y Cel.), chip de deuda,
 * pop-up con cuadros Documento y Celular y botones Editar | WhatsApp en fila. Lógica pura + revisión del código
 * fuente (el aspecto real solo se ve en el celular).
 *
 * Uso: npx tsx scripts/probar-clientes-lista.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  botonesOpcionesCliente,
  datosContactoCliente,
  etiquetasCliente,
  formatearCelular,
  resumenCliente,
  tipoDocumento,
} from '../src/core/clientes-lista';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

const leer = (ruta: string) => readFileSync(path.join(__dirname, '..', ruta), 'utf8');

// ---- Tipo de documento
afirmar(tipoDocumento('12345678') === 'dni', '8 dígitos = DNI');
afirmar(tipoDocumento('20123456789') === 'ruc', '11 dígitos = RUC');
afirmar(tipoDocumento('CE123456') === 'doc' && tipoDocumento('1234567') === 'doc' && tipoDocumento('123456789') === 'doc', 'Cualquier otro documento (letras u otra cantidad de dígitos) = Doc.');
afirmar(tipoDocumento(null) === null && tipoDocumento('   ') === null && tipoDocumento('') === null, 'Sin documento no hay tipo');

// ---- Celular
afirmar(formatearCelular('987654321') === '987 654 321', 'Celular de 9 dígitos en grupos de 3');
afirmar(formatearCelular('51987654321') === '51987654321' && formatearCelular('12345') === '12345', 'Otro largo se deja como está');
afirmar(formatearCelular(null) === null && formatearCelular('  ') === null, 'Sin celular no hay texto');

// ---- Línea de la lista
afirmar(datosContactoCliente({ documento: '12345678', telefono: '987654321' }).join(' · ') === 'DNI 12345678 · Cel. 987 654 321', 'Lista: «DNI 12345678 · Cel. 987 654 321»');
afirmar(datosContactoCliente({ documento: null, telefono: '987654321' }).join(' · ') === 'Cel. 987 654 321', 'Sin documento: solo «Cel. …» (no dice «Sin documento»)');
afirmar(datosContactoCliente({ documento: '20123456789', telefono: null }).join(' · ') === 'RUC 20123456789', 'Sin celular: solo el documento, con «RUC»');
afirmar(datosContactoCliente({ documento: 'CE123', telefono: null }).join(' · ') === 'Doc. CE123', 'Otro documento: «Doc. CE123»');
afirmar(datosContactoCliente({ documento: null, telefono: null }).length === 0, 'Sin ningún dato no se dibuja la línea');

// ---- Cuadros del pop-up
const cuadros = resumenCliente({ documento: '12345678', telefono: '987654321' });
afirmar(cuadros.map((c) => `${c.etiqueta}=${c.valor}`).join('|') === 'DNI=12345678|Celular=987 654 321', 'Pop-up: cuadros DNI y Celular con su valor');
const vacios = resumenCliente({ documento: null, telefono: null });
afirmar(vacios.map((c) => `${c.etiqueta}=${c.valor}`).join('|') === 'Documento=null|Celular=null', 'Sin datos: «Documento» y «Celular» con valor vacío (la pantalla muestra «No registrado»)');
afirmar(resumenCliente({ documento: 'CE123', telefono: null })[0]?.etiqueta === 'Documento', 'Otro documento: el cuadro se llama «Documento»');
afirmar(resumenCliente({ documento: '20123456789', telefono: null })[0]?.etiqueta === 'RUC', 'RUC: el cuadro se llama «RUC»');

// ---- Chips y botones
afirmar(etiquetasCliente({ activo: true, saldoPendiente: 0 }).length === 0, 'Cliente activo sin deuda: sin chips');
afirmar(etiquetasCliente({ activo: true, saldoPendiente: 20 }).join() === 'deuda', 'Con deuda: chip «Debe»');
afirmar(etiquetasCliente({ activo: false, saldoPendiente: 20 }).join() === 'inactivo,deuda', 'Orden de los chips: Inactivo, Debe');
afirmar(botonesOpcionesCliente({ telefono: '987654321' }).join() === 'editar,whatsapp', 'Con celular: Editar | WhatsApp');
afirmar(botonesOpcionesCliente({ telefono: null }).join() === 'editar', 'Sin celular: solo Editar');

// ---- Pantalla (código fuente)
const pagina = leer('src/app/mas/clientes/page.tsx');
const iLista = pagina.indexOf('clientesFiltrados.map(');
const filas = pagina.slice(iLista, pagina.indexOf('</ul>', iLista));
afirmar(filas.includes('line-clamp-2') && filas.includes('datosContactoCliente(cliente)'), 'La lista corta el nombre a 2 líneas con «…» y muestra los datos con rótulo');
afirmar(!filas.includes('Sin documento') && !filas.includes('WhatsApp') && !filas.includes('Editar') && filas.includes('setClienteOpcionesId(cliente.id)'), 'La fila no tiene botones y toda ella abre el pop-up');
afirmar(filas.includes('Debe {formatearMonto(cliente.saldoPendiente, simboloMoneda)}') && filas.includes('CLASE_CHIP_ALERTA'), 'La deuda va en un chip rojo a la derecha');
const iPopup = pagina.indexOf('<HojaOpciones');
const popup = pagina.slice(iPopup, pagina.indexOf('</HojaOpciones>'));
afirmar(popup.includes('tituloCompleto') && popup.includes('resumenCliente(clienteOpciones)') && popup.includes('No registrado'), 'El pop-up muestra el nombre completo y los cuadros Documento y Celular');
afirmar(popup.includes('flex gap-2') && popup.includes('bg-bodega/10') && popup.includes('text-bodega-oscuro') && popup.includes('border-[#25D366]') && popup.includes('<IconoWhatsApp'), 'Botones en fila: «Editar» turquesa suave y «WhatsApp» con su logo y borde verde');
afirmar(popup.includes('disabled={!esPremium}') && popup.includes('WhatsApp: función Premium') && !popup.includes('Contactar'), 'WhatsApp sigue siendo Premium (se deshabilita en Gratis con su aviso)');
afirmar(popup.includes('h-12'), 'Los botones del pop-up miden 48 px de alto');
afirmar(pagina.includes('Buscar por nombre, DNI o celular…') && pagina.includes('soloDigitosAlEscribir(e.target.value)'), 'El buscador y el formulario siguen igual');

// ---- HojaOpciones: el título completo es opcional y por defecto se corta (Fiados y los demás no cambian)
const hoja = leer('src/components/hoja-opciones.tsx');
afirmar(hoja.includes('tituloCompleto = false') && hoja.includes("tituloCompleto ? 'break-words leading-snug' : 'truncate'"), 'HojaOpciones: «tituloCompleto» es opcional y por defecto el título se corta como antes');
afirmar(hoja.includes('usarCapaAtras(true, onCerrar)'), 'HojaOpciones sigue cerrándose con «Atrás»');

// ---- Saltos de línea (CRLF)
for (const ruta of ['src/app/mas/clientes/page.tsx', 'src/components/hoja-opciones.tsx', 'src/core/clientes-lista.ts', 'scripts/probar-clientes-lista.ts', 'scripts/probar-capas-atras.ts']) {
  afirmar(!/(^|[^\r])\n/.test(leer(ruta)), `${ruta}: todos los saltos de línea son CRLF`);
}

console.log('🎉 Todas las pruebas de la lista de Clientes pasaron.');
