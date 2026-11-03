/**
 * Prueba de la barra de navegación inferior (Etapa V2): qué accesos tiene, en qué pantallas se
 * muestra, cuál se resalta y cuándo se oculta por el teclado. Lógica pura: no necesita celular.
 *
 * Uso: npx tsx scripts/probar-navegacion.ts
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { ACCESOS_BARRA, calcularDesfaseAbajo, esAccesoActivo, esCampoDeTexto, mostrarBarraInferior, normalizarRuta } from '../src/core/navegacion';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

// ---- Accesos
afirmar(ACCESOS_BARRA.map((a) => a.etiqueta).join(',') === 'Inicio,Venta,Productos,Clientes,Más', 'La barra tiene Inicio, Venta, Productos, Clientes y Más (Clientes en lugar de Fiados)');
afirmar(new Set(ACCESOS_BARRA.map((a) => a.href)).size === ACCESOS_BARRA.length, 'Cada acceso lleva a una ruta distinta');
for (const acceso of ACCESOS_BARRA) {
  const archivo = acceso.href === '/' ? 'src/app/page.tsx' : `src/app${acceso.href}/page.tsx`;
  afirmar(existsSync(path.join(__dirname, '..', archivo)), `La ruta ${acceso.href} existe como pantalla (${archivo})`);
}

// ---- Dónde se muestra
for (const ruta of ['/', '/productos', '/mas/clientes', '/mas']) {
  afirmar(mostrarBarraInferior(ruta), `Se muestra en la pantalla principal ${ruta}`);
}
afirmar(mostrarBarraInferior('/productos/') && mostrarBarraInferior('/mas/clientes.html') && mostrarBarraInferior('/index.html'), 'Se muestra aunque la ruta venga con "/" final o ".html"');
for (const ruta of ['/ventas/nueva', '/ventas/voz', '/compras/nueva', '/compras/editar', '/fiados', '/mas/configuracion/pin', '/mas/reportes', '/caja', '/admin']) {
  afirmar(!mostrarBarraInferior(ruta), `Se oculta en ${ruta} (formulario, venta en curso o subpantalla)`);
}
afirmar(!mostrarBarraInferior(null), 'Sin ruta conocida no se muestra');

// ---- Acceso activo
afirmar(esAccesoActivo('/', '/') && !esAccesoActivo('/', '/productos'), 'Inicio solo se resalta en la raíz');
afirmar(esAccesoActivo('/productos', '/productos') && esAccesoActivo('/productos', '/productos/'), 'Productos se resalta en su pantalla');
afirmar(esAccesoActivo('/mas/clientes', '/mas/clientes') && !esAccesoActivo('/mas/clientes', '/mas'), 'Clientes se resalta en su pantalla y no en Más');
afirmar(!esAccesoActivo('/mas', '/mas/clientes') && esAccesoActivo('/mas', '/mas'), 'En Clientes se resalta Clientes, no Más (aunque su ruta cuelgue de /mas)');
afirmar(esAccesoActivo('/mas', '/mas/reportes') && !esAccesoActivo('/mas/clientes', '/mas/reportes'), 'Más se resalta en sus otras subpantallas');
afirmar(ACCESOS_BARRA.find((a) => a.id === 'clientes')?.href === '/mas/clientes', 'El acceso Clientes abre la pantalla de Clientes (no la de Fiados)');
afirmar(!ACCESOS_BARRA.some((a) => a.href === '/fiados'), 'Fiados ya no está en la barra: se abre desde Más > Fiados');
afirmar(!esAccesoActivo('/mas', '/masivo'), 'Una ruta que solo empieza igual (/masivo) no cuenta');
afirmar(normalizarRuta('/mas/clientes/?x=1#a') === '/mas/clientes' && normalizarRuta('') === '/', 'Se ignoran parámetros y la ruta vacía es la raíz');

// ---- Teclado
afirmar(esCampoDeTexto('INPUT', 'text') && esCampoDeTexto('input', 'number') && esCampoDeTexto('INPUT', 'search') && esCampoDeTexto('INPUT', undefined), 'Campos de texto, número y búsqueda abren el teclado');
afirmar(esCampoDeTexto('TEXTAREA', undefined) && esCampoDeTexto('DIV', undefined, true), 'Áreas de texto y contenido editable abren el teclado');
afirmar(!esCampoDeTexto('INPUT', 'checkbox') && !esCampoDeTexto('INPUT', 'radio') && !esCampoDeTexto('INPUT', 'range') && !esCampoDeTexto('INPUT', 'file'), 'Interruptores, casillas, deslizadores y archivos no ocultan la barra');
afirmar(!esCampoDeTexto('BUTTON', undefined) && !esCampoDeTexto('SELECT', undefined) && !esCampoDeTexto(null, null), 'Botones, listas y nada enfocado no ocultan la barra');

// ---- Barra fija al borde visible (desfase del viewport)
afirmar(calcularDesfaseAbajo(800, 800, 0) === 0, 'Desfase: si el área fija y lo visible miden lo mismo, no se corrige nada');
afirmar(calcularDesfaseAbajo(800, 778, 0) === 22, 'Desfase: si el área fija es 22 px más alta que lo visible, se sube 22 px');
afirmar(calcularDesfaseAbajo(800, 770, 8) === 22, 'Desfase: cuenta también el desplazamiento de lo visible dentro del área fija');
afirmar(calcularDesfaseAbajo(800, 799.4, 0) === 0, 'Desfase: una diferencia de subpíxeles no mueve la barra');
afirmar(calcularDesfaseAbajo(800, 810, 0) === 0, 'Desfase: nunca baja la barra (diferencia negativa = 0)');
afirmar(calcularDesfaseAbajo(800, 400, 0) === 0, 'Desfase: una diferencia gigante (teclado abierto) se ignora');
afirmar(calcularDesfaseAbajo(Number.NaN, 700, 0) === 0 && calcularDesfaseAbajo(0, 0, 0) === 0, 'Desfase: datos inválidos no rompen ni mueven nada');

const barra = readFileSync(__dirname + '/../src/components/barra-inferior.tsx', 'utf8').replace(/\r\n/g, '\n');
afirmar(barra.includes('fixed inset-x-0 bottom-[var(--desfase-viewport-abajo,0px)]') && barra.includes('usarDesfaseViewport()'), 'La barra va fija abajo y se ancla al borde visible');
afirmar(barra.includes('h-16') && barra.includes('{acceso.etiqueta}') && barra.includes('<Icono'), 'La barra siempre dibuja ícono y nombre de cada pestaña, con alto fijo (h-16)');
afirmar(!/(\bopacity-0\b|\bhidden\b|\bsr-only\b|max-h-)/.test(barra), 'Nada en la barra puede esconder los nombres ni cambiar su alto');
const layoutTexto = readFileSync(__dirname + '/../src/app/layout.tsx', 'utf8').replace(/\r\n/g, '\n');
afirmar(layoutTexto.indexOf('<BarraInferior />') > layoutTexto.indexOf('{children}'), 'La barra se dibuja en el layout raíz, fuera de la pantalla animada');

console.log('🎉 Todas las pruebas de la barra de navegación pasaron.');
