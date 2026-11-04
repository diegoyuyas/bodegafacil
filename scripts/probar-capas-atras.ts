/**
 * Prueba del botón «Atrás» con pop-ups abiertos, de los botones del detalle de un pedido y de las opciones de un
 * cliente. Lógica pura + revisión del código fuente (el aspecto real solo se ve en el celular).
 *
 * Uso: npx tsx scripts/probar-capas-atras.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PilaCapasAtras } from '../src/core/capas-atras';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

// ---- La pila
const pila = new PilaCapasAtras();
afirmar(pila.cerrarUltima() === false, 'Sin pop-ups abiertos, «Atrás» sigue su camino normal (devuelve false)');
const cerradas: string[] = [];
const detalle = pila.abrir(() => cerradas.push('detalle'));
const menu = pila.abrir(() => cerradas.push('menu'));
afirmar(pila.cantidad === 2, 'Se apuntan los pop-ups abiertos');
afirmar(pila.cerrarUltima() === true && cerradas.join() === 'menu', 'Con dos abiertos, «Atrás» cierra solo el de más arriba (el menú)');
pila.quitar(menu);
afirmar(pila.cerrarUltima() === true && cerradas.join() === 'menu,detalle', 'Después cierra el de abajo (el detalle)');
pila.quitar(detalle);
afirmar(pila.cantidad === 0 && pila.cerrarUltima() === false, 'Sin pop-ups, «Atrás» vuelve a subir de pantalla');
pila.quitar(999);
afirmar(pila.cantidad === 0, 'Quitar un pop-up que ya no está no rompe nada');
const a = pila.abrir(() => cerradas.push('a'));
pila.abrir(() => cerradas.push('b'));
pila.quitar(a);
afirmar(pila.cerrarUltima() === true && cerradas.at(-1) === 'b', 'Si el de abajo se cierra por otro camino (✕, tocar fuera), «Atrás» sigue cerrando el que queda');

// ---- Código
const raiz = path.join(__dirname, '..');
const leer = (ruta: string) => readFileSync(path.join(raiz, ruta), 'utf8').replace(/\r\n/g, '\n');
const gancho = leer('src/hooks/usar-capa-atras.ts');
const hoja = leer('src/components/detalle-venta-sheet.tsx');
const menuTicket = leer('src/components/menu-imprimir-ticket.tsx');
const opciones = leer('src/components/hoja-opciones.tsx');
const clientes = leer('src/app/mas/clientes/page.tsx');
const atras = leer('src/components/manejar-boton-atras.tsx');

afirmar(gancho.includes("'vendefacil:atras'") && gancho.includes('evento.preventDefault()') && atras.includes("'vendefacil:atras'"), '«Atrás» de Android avisa a los pop-ups con el mismo evento que ya usaba la app; si uno lo cierra, no se cambia de pantalla');
afirmar(hoja.includes('usarCapaAtras(true, onCerrar)') && hoja.includes('usarCapaAtras(confirmando, () => setConfirmando(false))'), 'Detalle del pedido: «Atrás» lo cierra (y antes cierra su confirmación de anular, si está abierta)');
afirmar(menuTicket.includes('usarCapaAtras(true, onCerrar)') && opciones.includes('usarCapaAtras(true, onCerrar)'), 'El menú de ticket y las opciones de un cliente también se cierran con «Atrás»');
afirmar(hoja.indexOf('usarCapaAtras(') < hoja.indexOf('if (!montado) return null;'), 'Los ganchos van antes del «return null» (orden de hooks estable)');

// ---- Detalle del pedido: botones en fila
afirmar(/Enviar\n/.test(hoja) && hoja.includes('<IconoTacho tamano={24} />') && hoja.includes('<IconoImpresora tamano={24} />') && hoja.includes('<IconoWhatsApp tamano={24}'), 'Enviar (WhatsApp), Reimprimir (impresora) y Anular pedido (tacho), cada uno con su ícono');

// ---- Opciones de un cliente
afirmar(clientes.includes('<HojaOpciones') && clientes.includes('abrirEdicion(cliente)') && clientes.includes('abrirChatWhatsApp(telefonoCliente)'), 'Clientes: al tocar un cliente se abre un pop-up con Editar y Contactar');
const iEditar = clientes.indexOf('            Editar\n          </button>');
const iContactar = clientes.indexOf('Contactar\n            </button>');
afirmar(iEditar > 0 && iContactar > iEditar && clientes.slice(iEditar, iContactar).includes('<IconoWhatsApp'), 'Orden: «Editar» y debajo el logo de WhatsApp con «Contactar»');
const filas = clientes.slice(clientes.indexOf('clientesFiltrados.map('), clientes.indexOf('</ul>', clientes.indexOf('clientesFiltrados.map(')));
afirmar(!filas.includes('WhatsApp') && !filas.includes('Editar') && filas.includes('setClienteOpcionesId(cliente.id)'), 'La fila de cada cliente ya no tiene botones de WhatsApp ni Editar: toda la fila se toca');
afirmar(opciones.includes('createPortal(') && opciones.includes('bottom-[calc(4rem+var(--area-segura-abajo)+var(--desfase-viewport-abajo,0px))]') && opciones.includes('z-40'), 'El pop-up de opciones se apoya sobre la barra inferior (no la tapa), igual que el detalle de un pedido');

// ---- Sin botones duplicados
for (const [pantalla, ruta, texto] of [['Compras', 'src/app/compras/page.tsx', 'Registrar una compra'], ['Clientes', 'src/app/mas/clientes/page.tsx', 'Agregar el primero'], ['Productos', 'src/app/productos/page.tsx', 'Agregar el primero']] as const) {
  const codigo = leer(ruta);
  afirmar(!codigo.includes(texto) && !codigo.includes('textoAccion'), `${pantalla}: ya no está el botón «${texto}» (queda el de arriba)`);
}
afirmar(leer('src/app/compras/page.tsx').includes('Nueva compra') && leer('src/app/productos/page.tsx').includes('Nuevo producto') && leer('src/app/mas/clientes/page.tsx').includes('Nuevo cliente'), 'Cada pantalla conserva su botón de arriba (Nueva compra, Nuevo producto, Nuevo cliente)');

console.log('🎉 Todas las pruebas de «Atrás» y pop-ups pasaron.');
