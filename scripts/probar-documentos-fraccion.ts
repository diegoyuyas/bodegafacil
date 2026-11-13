/**
 * Prueba de la Etapa 4 de Venta Entero/Fracción: los documentos de una venta (ticket de texto, imagen e impresora,
 * mensaje de WhatsApp, detalle de Pedidos, saldo de fiados y Reimprimir) dicen la unidad de cada línea.
 *
 * Uso: npx tsx scripts/probar-documentos-fraccion.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BaseDatosLocal } from '../src/infraestructura/sqlite/base-datos';
import { CajaRepositorioSqlite } from '../src/infraestructura/sqlite/caja.repositorio';
import { ClienteRepositorioSqlite } from '../src/infraestructura/sqlite/cliente.repositorio';
import { ConfiguracionRepositorioSqlite } from '../src/infraestructura/sqlite/configuracion.repositorio';
import { FiadoRepositorioSqlite } from '../src/infraestructura/sqlite/fiado.repositorio';
import { ProductoRepositorioSqlite } from '../src/infraestructura/sqlite/producto.repositorio';
import { UsuarioRepositorioSqlite } from '../src/infraestructura/sqlite/usuario.repositorio';
import { VentaRepositorioSqlite } from '../src/infraestructura/sqlite/venta.repositorio';
import { construirDatosComprobanteDeVenta } from '../src/infraestructura/comprobante/datos-comprobante';
import { CLAVE_VENTA_ENTERO_FRACCION, valorParaGuardar } from '../src/core/configuracion';
import { construirLineasComprobante, construirLineasDeTicket, construirTextoComprobante } from '../src/core/comprobante-impresion';
import { construirDetalleVenta } from '../src/core/detalle-venta';
import { sufijoUnidad } from '../src/core/unidades';
import { aUnidadesBase } from '../src/core/venta-fraccion';
import { construirMensajeDeuda, construirMensajeVenta } from '../src/core/whatsapp';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

const localizarArchivo = () => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const leer = (...ruta: string[]) => readFileSync(path.join(__dirname, '..', ...ruta), 'utf-8');

async function main() {
  // ---- La palabra después de la cantidad
  afirmar(sufijoUnidad('Caja', 1) === ' caja' && sufijoUnidad('Caja', 8) === ' cajas' && sufijoUnidad('Unidad', 8) === ' unidades', 'Después de una cantidad: " caja", " cajas", " unidades"');
  afirmar(sufijoUnidad(null, 3) === '' && sufijoUnidad(undefined, 3) === '' && sufijoUnidad('', 3) === '', 'Una línea sin unidad (las ventas de siempre) no lleva nada');

  const bd = await BaseDatosLocal.crear({ localizarArchivo });
  const configuracion = new ConfiguracionRepositorioSqlite(bd);
  const productos = new ProductoRepositorioSqlite(bd);
  const clientes = new ClienteRepositorioSqlite(bd, configuracion);
  const caja = new CajaRepositorioSqlite(bd);
  const ventas = new VentaRepositorioSqlite(bd, productos, caja, configuracion);
  const usuarios = new UsuarioRepositorioSqlite(bd, configuracion);
  const fiados = new FiadoRepositorioSqlite(bd, caja);
  const contenedorFalso = {
    configuracion,
    ventas,
    clientes,
    usuarios,
    plan: { obtenerEstado: () => ({ tipo: 'premium' }) },
  } as unknown as Parameters<typeof construirDatosComprobanteDeVenta>[0];
  configuracion.establecerValor(CLAVE_VENTA_ENTERO_FRACCION, valorParaGuardar(true));

  const galleta = productos.crear({
    nombre: 'Galleta Soda', precioVenta: 20, costo: 14, stockActual: 248, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad',
    formaVenta: 'fraccion', unidadEntera: 'Caja', unidadFraccion: 'Unidad', factorFraccion: 12, precioFraccion: 2,
  });
  const arroz = productos.crear({
    nombre: 'Arroz', precioVenta: 8, costo: 6, stockActual: 5000, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad',
    formaVenta: 'fraccion', unidadEntera: 'Kg', unidadFraccion: 'Gramo', factorFraccion: 1000, precioFraccion: 0.008,
  });
  const gaseosa = productos.crear({ nombre: 'Inca Kola', precioVenta: 3, costo: 2, stockActual: 20, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad' });

  const venta = ventas.registrarVenta({
    lineas: [
      { productoId: galleta.id, cantidad: aUnidadesBase(1, 8, 12) },
      { productoId: arroz.id, cantidad: 250 },
      { productoId: gaseosa.id, cantidad: 2 },
    ],
    metodoPago: 'efectivo',
  });

  // ---- Lo que leen Pedidos, Inicio y WhatsApp
  const resumen = ventas.obtenerLineas(venta.id);
  afirmar(resumen.length === 4 && resumen[0]?.unidad === 'Caja' && resumen[1]?.unidad === 'Unidad' && resumen[2]?.unidad === 'Gramo' && resumen[3]?.unidad === null, 'Las líneas de la venta traen su unidad (Caja, Unidad, Gramo) y las normales null');
  const paraMensaje = ventas.obtenerLineasParaMensaje(venta.id);
  afirmar(paraMensaje[0]?.unidad === 'Caja' && paraMensaje[1]?.unidad === 'Unidad' && paraMensaje[3]?.unidad === null, 'Las líneas para el mensaje también');

  // ---- WhatsApp
  const mensaje = construirMensajeVenta('Mi Bodega', ventas.obtenerPorId(venta.id), paraMensaje, 'S/');
  afirmar(mensaje.includes('• GALLETA SODA x1 caja — S/ 20.00') && mensaje.includes('• GALLETA SODA x8 unidades — S/ 16.00'), 'WhatsApp: «GALLETA SODA x1 caja — S/ 20.00» y «GALLETA SODA x8 unidades — S/ 16.00»');
  afirmar(mensaje.includes('• ARROZ x250 gramos — S/ 2.00'), 'WhatsApp: «ARROZ x250 gramos — S/ 2.00»');
  afirmar(mensaje.includes('• INCA KOLA x2 — S/ 6.00') && mensaje.includes('Total: S/ 44.00'), 'WhatsApp: el producto normal sale como siempre («INCA KOLA x2 — S/ 6.00») y el total suma todo (S/ 44.00)');

  // ---- Detalle de Pedidos (la ventana que se abre al tocar un pedido)
  const filas = construirDetalleVenta(resumen, 'S/');
  afirmar(filas[0]?.cantidadTexto === '1 caja' && filas[0]?.precioUnitarioTexto === 'S/ 20.00' && filas[0]?.subtotal === 20, 'Detalle: «1 caja × S/ 20.00» = S/ 20.00');
  afirmar(filas[1]?.cantidadTexto === '8 unidades' && filas[1]?.precioUnitarioTexto === 'S/ 2.00' && filas[1]?.subtotal === 16, 'Detalle: «8 unidades × S/ 2.00» = S/ 16.00');
  afirmar(filas[2]?.cantidadTexto === '250 gramos' && filas[2]?.precioUnitarioTexto === 'S/ 0.008' && filas[2]?.subtotal === 2, 'Detalle: «250 gramos × S/ 0.008» = S/ 2.00 (el precio del gramo con sus decimales)');
  afirmar(filas[3]?.cantidadTexto === '2' && filas[3]?.precioUnitarioTexto === 'S/ 3.00' && filas[3]?.subtotal === 6, 'Detalle: el producto normal sale como siempre («2 × S/ 3.00»)');
  afirmar(filas.reduce((s, f) => s + (f.subtotal ?? 0), 0) === venta.total, 'Los subtotales del detalle suman el total de la venta');
  const sinPrecio = construirDetalleVenta([{ producto: 'ANTIGUA', cantidad: 2 }]);
  afirmar(sinPrecio[0]?.precioUnitarioTexto === null && sinPrecio[0]?.subtotal === null && sinPrecio[0]?.cantidadTexto === '2', 'Una venta muy antigua sin precio sigue sin mostrar precio');

  // ---- Ticket (el mismo texto sirve para la imagen y para la impresora): una línea por producto, sin precio por caja ni por unidad
  const ticket = (ancho: number, ventaId = venta.id) => construirLineasComprobante(construirDatosComprobanteDeVenta(contenedorFalso, ventaId), ancho).map((l) => l.texto);
  const t48 = ticket(48);
  const fila48 = (inicio: string) => t48.find((l) => l.startsWith(inicio));
  afirmar(t48.includes('GALLETA SODA') && fila48('  1 caja y 8 unidades')?.endsWith('S/ 36.00') === true, 'Ticket: «GALLETA SODA» y debajo «1 caja y 8 unidades» con el subtotal S/ 36.00 (20 + 16 juntos)');
  afirmar(t48.includes('ARROZ') && fila48('  250 gramos')?.endsWith('S/ 2.00') === true, 'Ticket: «ARROZ» y debajo «250 gramos» con S/ 2.00');
  afirmar(t48.includes('2 INCA KOLA') && fila48('  S/ 3.00 c/u')?.endsWith('S/ 6.00') === true, 'Ticket: el producto normal queda como siempre («2 INCA KOLA» y «S/ 3.00 c/u … S/ 6.00»)');
  afirmar(t48.every((l) => !l.includes(' por caja') && !l.includes(' por unidad') && !l.includes(' por gramo') && !l.includes(' por kg')), 'Ticket: no aparece ningún precio por caja, por unidad, por kg ni por gramo');
  afirmar(!t48.some((l) => l.includes('1 caja GALLETA') || l.includes('8 unidades GALLETA')), 'Ticket: la caja y las unidades ya no salen en dos líneas separadas');
  const t32 = ticket(32);
  afirmar(t32.every((l) => l.length <= 32) && t32.some((l) => l.startsWith('  1 caja y 8 unidades')), 'En papel de 32 caracteres ninguna línea se pasa del ancho');
  const texto = construirTextoComprobante(construirDatosComprobanteDeVenta(contenedorFalso, venta.id));
  afirmar(texto.includes('1 caja y 8 unidades') && texto.includes('IMPORTE TOTAL:'), 'El texto completo del ticket (impresora) también sale así');
  afirmar(t48.some((l) => l.includes('IMPORTE TOTAL:') && l.endsWith("S/ 44.00")), 'El total del ticket suma todas las líneas (S/ 44.00)');
  // Cantidad larga: en papel angosto el subtotal baja a su línea y no se corta la cantidad
  const ventaGrande = ventas.registrarVenta({ lineas: [{ productoId: galleta.id, cantidad: aUnidadesBase(10, 11, 12) }], metodoPago: 'efectivo' });
  const g32 = ticket(32, ventaGrande.id);
  const iGrande = g32.indexOf('  10 cajas y 11 unidades');
  afirmar(iGrande >= 0 && g32[iGrande + 1]?.trim() === 'S/ 222.00' && g32[iGrande + 1]?.endsWith('S/ 222.00') === true && g32.every((l) => l.length <= 32), 'Papel de 32: «10 cajas y 11 unidades» y el subtotal S/ 222.00 abajo, a la derecha, sin cortar nada');
  const g48 = ticket(48, ventaGrande.id);
  afirmar(g48.some((l) => l.startsWith('  10 cajas y 11 unidades') && l.endsWith('S/ 222.00')), 'Papel de 48: todo en una sola línea');
  ventas.anularVenta(ventaGrande.id);
  // Agrupar: solo se juntan las líneas seguidas del mismo producto; las demás pasan igual
  const agrupadas = construirLineasDeTicket([
    { producto: 'MANZANA', cantidad: 1, unidad: 'Kg', precioUnitario: 4.5, subtotal: 4.5, descripcion: 'madura' },
    { producto: 'MANZANA', cantidad: 900, unidad: 'Gramo', precioUnitario: 0.0045, subtotal: 4.05, descripcion: null },
    { producto: 'PAN', cantidad: 3, unidad: null, precioUnitario: 0.5, subtotal: 1.5, descripcion: null },
    { producto: 'ARROZ', cantidad: 2, unidad: 'Kg', precioUnitario: 8, subtotal: 16, descripcion: null },
  ]);
  afirmar(agrupadas.length === 3 && agrupadas[0]?.cantidadTexto === '1 kg y 900 gramos' && agrupadas[0]?.subtotal === 8.55 && agrupadas[0]?.nota === 'madura', 'Agrupar: 1 kg y 900 gramos de manzana = una línea de S/ 8.55 (con su nota)');
  afirmar(agrupadas[1]?.cantidadTexto === undefined && agrupadas[1]?.descripcion === 'PAN' && agrupadas[2]?.cantidadTexto === '2 kg' && agrupadas[2]?.subtotal === 16, 'Agrupar: el pan normal pasa igual y el arroz vendido solo en kg sale «2 kg»');

  // ---- Reimprimir y WhatsApp desde Pedidos usan lo mismo (no hay un camino aparte)
  const pedidos = leer('src', 'app', 'pedidos', 'page.tsx');
  afirmar(pedidos.includes('obtenerLineasParaMensaje(venta.id)') && pedidos.includes('construirMensajeVenta('), 'Pedidos arma el WhatsApp con las mismas líneas');
  const hoja = leer('src', 'components', 'detalle-venta-sheet.tsx');
  afirmar(hoja.includes('construirDetalleVenta(lineas, simboloMoneda)') && hoja.includes('fila.precioUnitarioTexto'), 'La ventana de detalle usa la cantidad con unidad y el precio con sus decimales');
  const datos = leer('src', 'infraestructura', 'comprobante', 'datos-comprobante.ts');
  afirmar(datos.includes('construirLineasDeTicket(lineas)'), 'Los datos del comprobante (imagen, impresora y Reimprimir) juntan cada producto por fracciones en una línea');

  // ---- Fiado: el saldo pendiente por WhatsApp
  const maria = clientes.crear('María', '12345678', '999888777');
  const ventaFiada = ventas.registrarVenta({
    lineas: [{ productoId: galleta.id, cantidad: aUnidadesBase(2, 3, 12) }, { productoId: gaseosa.id, cantidad: 1 }],
    metodoPago: 'fiado',
    clienteId: maria.id,
  });
  const deudas = fiados.listarDeudasPendientesDetalladas(maria.id);
  const deudaVenta = deudas.find((d) => d.ventaId === ventaFiada.id);
  afirmar(deudaVenta?.lineas.length === 3 && deudaVenta.lineas[0]?.unidad === 'Caja' && deudaVenta.lineas[1]?.unidad === 'Unidad' && deudaVenta.lineas[2]?.unidad === null, 'La deuda fiada trae las líneas con su unidad');
  const mensajeDeuda = construirMensajeDeuda(clientes.obtenerPorId(maria.id), deudas, 'S/');
  afirmar(mensajeDeuda.includes('• GALLETA SODA x2 cajas') && mensajeDeuda.includes('• GALLETA SODA x3 unidades') && mensajeDeuda.includes('• INCA KOLA x1'), 'El saldo pendiente dice «GALLETA SODA x2 cajas» y «x3 unidades»; el producto normal igual que antes');

  // ---- Interruptor apagado: lo ya vendido sigue diciendo sus unidades
  configuracion.establecerValor(CLAVE_VENTA_ENTERO_FRACCION, valorParaGuardar(false));
  afirmar(construirMensajeVenta('Mi Bodega', ventas.obtenerPorId(venta.id), ventas.obtenerLineasParaMensaje(venta.id), 'S/').includes('x8 unidades'), 'Con el interruptor apagado, una venta ya hecha se sigue viendo en cajas y unidades');
  const ventaOff = ventas.registrarVenta({ lineas: [{ productoId: galleta.id, cantidad: 2 }], metodoPago: 'efectivo' });
  afirmar(construirMensajeVenta('Mi Bodega', ventas.obtenerPorId(ventaOff.id), ventas.obtenerLineasParaMensaje(ventaOff.id), 'S/').includes('• GALLETA SODA x2 cajas — S/ 40.00'), 'Con el interruptor apagado, vender 2 cajas dice «x2 cajas — S/ 40.00»');

  console.log('\n🎉 Los documentos de una venta por fracciones (Etapa 4) funcionan.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
