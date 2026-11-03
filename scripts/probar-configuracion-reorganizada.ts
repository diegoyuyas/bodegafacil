/**
 * Prueba de la reorganización de Más > Configuración: la pantalla Configuración queda solo con sus 6 opciones,
 * y la moneda, el prefijo de país y la apariencia (Preferencias), el plan y la activación con código (Mi plan)
 * pasan a sus propias opciones del menú Más, con el mismo funcionamiento. Revisa el código fuente.
 *
 * Uso: npx tsx scripts/probar-configuracion-reorganizada.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

const raiz = path.join(__dirname, '..');
const leer = (ruta: string) => readFileSync(path.join(raiz, ruta), 'utf8').replace(/\r\n/g, '\n');
const contiene = (texto: string, partes: string[]) => partes.every((p) => texto.includes(p));

const configuracion = leer('src/app/mas/configuracion/page.tsx');
const preferencias = leer('src/app/mas/preferencias/page.tsx');
const miPlan = leer('src/app/mas/mi-plan/page.tsx');
const mas = leer('src/app/mas/page.tsx');

// ---- Configuración: solo sus 6 opciones, en su orden
const enlaces = [...configuracion.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
afirmar(
  enlaces.join(',') ===
    '/mas,/mas/configuracion/configuracion-venta,/mas/configuracion/pin,/mas/configuracion/administracion-usuarios,/mas/configuracion/backup-automatico,/mas/configuracion/informacion-negocio,/mas/configuracion/configuracion-impresoras',
  'Configuración tiene el botón volver y exactamente sus 6 opciones, en el mismo orden',
);
afirmar(
  contiene(configuracion, ['Configuración de Venta', 'Configurar PIN', 'Administración de Usuarios', 'Configurar Backup Automático', 'Información del Negocio', 'Configuración de Impresión']),
  'Configuración muestra: Configuración de Venta, Configurar PIN, Administración de Usuarios, Configurar Backup Automático, Información del Negocio y Configuración de Impresión',
);
for (const quitado of ['Tipo de moneda', 'Prefijo país', 'Activar Premium', 'ID de este dispositivo', 'Código de activación', 'Activar con este código', '<select', '<textarea', 'CLAVE_MONEDA', 'activarConCodigo']) {
  afirmar(!configuracion.includes(quitado), `Configuración ya no tiene «${quitado}»`);
}
afirmar(configuracion.includes('Función Premium'), 'Las etiquetas «Función Premium» de las opciones se conservan');

// ---- Preferencias: moneda, prefijo y apariencia
afirmar(existsSync(path.join(raiz, 'src/app/mas/preferencias/page.tsx')), 'Existe la pantalla Preferencias');
afirmar(contiene(preferencias, ['<h1', 'Preferencias', 'Tipo de moneda', 'Prefijo país', 'Apariencia']), 'Preferencias tiene: Tipo de moneda, Prefijo país y Apariencia');
afirmar(contiene(preferencias, ['CLAVE_MONEDA', 'MONEDAS_DISPONIBLES', 'cambiarMoneda', 'CLAVE_PREFIJO_PAIS', 'PAISES_AMERICA', 'cambiarPrefijoPais', 'contenedor.persistir()']), 'Preferencias usa los mismos selectores y guarda igual que antes (moneda y prefijo)');
afirmar(contiene(preferencias, ['OPCIONES_APARIENCIA', 'cambiarApariencia', 'role="radiogroup"']), 'La Apariencia ofrece Claro / Oscuro / Automático como opciones excluyentes');
afirmar(contiene(preferencias, ['Cambia el símbolo que se muestra en toda la app', 'El código con el que se arma el número de celular']), 'Se conservan los textos de ayuda de moneda y prefijo');

// ---- Mi plan: estado, ID, código
afirmar(existsSync(path.join(raiz, 'src/app/mas/mi-plan/page.tsx')), 'Existe la pantalla Mi plan');
afirmar(contiene(miPlan, ['Mi plan', 'Plan Premium', 'te quedan', 'diasRestantes', 'Plan Gratis', 'LIMITE_VENTAS_PLAN_GRATIS']), 'Mi plan muestra el estado del plan y los días restantes (Premium) o los pedidos usados (Gratis)');
afirmar(contiene(miPlan, ['ID de este dispositivo', 'obtenerIdDispositivoTexto', 'navigator.clipboard', 'Copiar', 'Código copiado']), 'Mi plan muestra el ID del dispositivo con botón Copiar');
afirmar(contiene(miPlan, ['Código de activación', 'Activar con este código', 'activarConCodigo', 'Código aceptado', 'Verificando…']), 'Mi plan tiene el campo de código y el botón «Activar con este código»');
afirmar(contiene(miPlan, ['contenedor.persistir().catch', 'invalidando los códigos ya pedidos']), 'Mi plan sigue guardando el ID del dispositivo la primera vez que se genera');
afirmar(contiene(miPlan, ['setEstadoPlan(contenedor.plan.obtenerEstado())']), 'Tras activar con un código, el estado del plan se actualiza en pantalla');

// ---- Menú Más
const posConfiguracion = mas.indexOf("href: '/mas/configuracion',");
const posPreferencias = mas.indexOf("href: '/mas/preferencias',");
const posMiPlan = mas.indexOf("href: '/mas/mi-plan',");
afirmar(posConfiguracion > 0 && posPreferencias > posConfiguracion && posMiPlan > posPreferencias, 'En Más: Configuración, luego Preferencias y luego Mi plan');
afirmar(mas.includes("etiqueta: 'Preferencias',\n    descripcion: 'Moneda, prefijo de país y apariencia',"), 'Preferencias lleva el subtítulo «Moneda, prefijo de país y apariencia»');
afirmar(mas.includes("etiqueta: 'Mi plan',\n    descripcion: 'Estado de Premium y activación',"), 'Mi plan lleva el subtítulo «Estado de Premium y activación»');
const bloquePref = mas.slice(posPreferencias, posPreferencias + 220);
const bloquePlan = mas.slice(posMiPlan, posMiPlan + 200);
afirmar(bloquePref.includes("permiso: 'configuracion'") && bloquePlan.includes("permiso: 'configuracion'"), 'Ambas opciones piden el mismo permiso que Configuración (quien no lo tenía, tampoco las ve)');
afirmar(mas.includes("'/mas/preferencias': IconoPreferencias") && mas.includes("'/mas/mi-plan': IconoPlan"), 'Las dos opciones nuevas tienen su ícono');

console.log('🎉 Todas las pruebas de la reorganización de Configuración pasaron.');
