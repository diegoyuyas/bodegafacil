/**
 * Prueba de la Etapa 3 de Nueva venta: el campo de cliente queda siempre activo (buscar o escribir) con una ayuda
 * corta, y el celular solo se pide cuando se va a enviar por WhatsApp y el cliente no tiene teléfono registrado.
 * Revisión del código fuente (el aspecto real solo se ve en el celular).
 *
 * Uso: npx tsx scripts/probar-nueva-venta-etapa3.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

const pagina = readFileSync(path.join(__dirname, '..', 'src/app/ventas/nueva/page.tsx'), 'utf8').replace(/\r\n/g, '\n');
const iCliente = pagina.indexOf('{/* Cliente: opcional siempre');
const iAccion = pagina.indexOf('{/* Acción principal */}');
const cliente = pagina.slice(iCliente, iAccion);

// ---- Cliente: siempre activo
afirmar(iCliente > 0 && iAccion > iCliente, 'Después de Cliente viene directamente el botón de cobrar (WhatsApp y ticket pasaron a después de cobrar)');
afirmar(cliente.includes('value={busquedaCliente}') && cliente.includes('Buscar o escribir el nombre del cliente…') && cliente.includes('clientesEncontrados.map('), 'El campo de cliente está siempre a la vista, listo para escribir o buscar un cliente existente');
afirmar(!/useState\(false\)/.test(cliente) && !cliente.includes('aria-expanded') && !cliente.includes('⌄'), 'No hay plegado ni despliegue en el campo de cliente');
afirmar(cliente.includes("'(obligatorio para fiado)'") && cliente.includes("'(opcional)'") && cliente.includes('La factura necesita un cliente registrado con RUC.') && cliente.includes('El fiado necesita un cliente registrado.'), 'Siguen los avisos de cliente obligatorio para fiado y factura');
afirmar(!pagina.includes('Si no seleccionas ni escribes a nadie') && !pagina.includes('Para guardarlo, créalo en'), 'El texto largo de ayuda ya no está');
afirmar(cliente.includes('Sin cliente: <span className="font-medium text-tinta">Cliente eventual</span>.') && cliente.includes('Saldrá a nombre de') && cliente.includes('(sin\n                    registrarlo)'), 'Ayuda corta: «Sin cliente: Cliente eventual» o «Saldrá a nombre de X (sin registrarlo)»');
afirmar(cliente.includes('seleccionarCliente(cliente)') && cliente.includes('clienteSeleccionado ? ('), 'Seleccionar un cliente existente funciona igual que antes');

// ---- El celular ya no se pide antes de cobrar (la etapa 4 lo pide después, solo si hace falta)
afirmar(!cliente.includes('Número de celular') && !cliente.includes('telefonoCelular'), 'En el formulario ya no hay campo de celular');

console.log('🎉 Todas las pruebas de la Etapa 3 de Nueva venta pasaron.');
