/**
 * Prueba del logotipo del negocio (Etapa 1): validación del archivo, tamaño final, qué se guarda y cuándo sale
 * en la imagen del ticket. (El dibujo en el canvas y la galería del teléfono se comprueban en el celular.)
 *
 * Uso: npx tsx scripts/probar-logo.ts
 */
import path from 'node:path';
import { BaseDatosLocal } from '../src/infraestructura/sqlite/base-datos';
import { ConfiguracionRepositorioSqlite } from '../src/infraestructura/sqlite/configuracion.repositorio';
import { ProductoRepositorioSqlite } from '../src/infraestructura/sqlite/producto.repositorio';
import { ClienteRepositorioSqlite } from '../src/infraestructura/sqlite/cliente.repositorio';
import { CajaRepositorioSqlite } from '../src/infraestructura/sqlite/caja.repositorio';
import { VentaRepositorioSqlite } from '../src/infraestructura/sqlite/venta.repositorio';
import { construirDatosComprobanteDeVenta } from '../src/infraestructura/comprobante/datos-comprobante';
import { construirTextoComprobante } from '../src/core/comprobante-impresion';
import { ErrorDeNegocio } from '../src/core/reglas-negocio';
import {
  CLAVE_LOGO_DATOS,
  CLAVE_LOGO_EN_IMAGEN,
  LOGO_ALTO_MAXIMO,
  LOGO_ANCHO_MAXIMO,
  LOGO_ARCHIVO_MAXIMO_BYTES,
  LOGO_DATOS_MAXIMO_CARACTERES,
  calcularTamanoLogo,
  esLogoValido,
  logoEnImagenActivo,
  tamanoLogoEnImagen,
  validarArchivoLogo,
} from '../src/core/logo';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}
const lanza = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof ErrorDeNegocio;
  }
  return false;
};

async function main() {
  // ---- Archivo elegido
  afirmar(LOGO_ANCHO_MAXIMO === 384 && LOGO_ALTO_MAXIMO === 160, 'El logotipo se reduce a un máximo de 384 × 160 px');
  afirmar(
    !lanza(() => validarArchivoLogo('image/png', 50_000)) && !lanza(() => validarArchivoLogo('image/jpeg', 2_000_000)) && !lanza(() => validarArchivoLogo('image/webp', 10)) && !lanza(() => validarArchivoLogo('IMAGE/PNG', 100)),
    'Se aceptan imágenes PNG, JPG y WebP',
  );
  afirmar(
    ['image/svg+xml', 'image/gif', 'application/pdf', 'text/html', ''].every((tipo) => lanza(() => validarArchivoLogo(tipo, 1000))),
    'Se rechazan SVG, GIF, PDF y cualquier archivo que no sea imagen permitida',
  );
  afirmar(lanza(() => validarArchivoLogo('image/png', 0)), 'Un archivo vacío se rechaza');
  afirmar(!lanza(() => validarArchivoLogo('image/jpeg', LOGO_ARCHIVO_MAXIMO_BYTES)) && lanza(() => validarArchivoLogo('image/jpeg', LOGO_ARCHIVO_MAXIMO_BYTES + 1)), 'Hasta 10 MB se acepta; más pesado, se rechaza con un mensaje claro');

  // ---- Tamaño final
  const t = (a: number, b: number) => calcularTamanoLogo(a, b);
  afirmar(JSON.stringify(t(1000, 500)) === '{"ancho":320,"alto":160}', 'Una imagen de 1000 × 500 queda en 320 × 160 (conserva la proporción)');
  afirmar(JSON.stringify(t(4000, 4000)) === '{"ancho":160,"alto":160}', 'Una foto cuadrada de 4000 × 4000 queda en 160 × 160');
  afirmar(JSON.stringify(t(1000, 100)) === '{"ancho":384,"alto":38}', 'Un logotipo muy ancho queda limitado por el ancho (384 × 38)');
  afirmar(JSON.stringify(t(100, 1000)) === '{"ancho":16,"alto":160}', 'Un logotipo muy alto queda limitado por el alto');
  afirmar(JSON.stringify(t(200, 100)) === '{"ancho":200,"alto":100}' && JSON.stringify(t(384, 160)) === '{"ancho":384,"alto":160}', 'Una imagen chica no se agranda (saldría borrosa)');
  afirmar(JSON.stringify(t(1, 10000)) === '{"ancho":1,"alto":160}', 'Nunca queda con 0 píxeles');
  afirmar(lanza(() => t(0, 100)) && lanza(() => t(100, -5)) && lanza(() => t(Number.NaN, 10)), 'Un tamaño ilegible se rechaza');

  // ---- Lo guardado
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD';
  afirmar(esLogoValido(png) && esLogoValido(jpeg), 'Un PNG o JPEG en texto es un logotipo válido');
  afirmar(
    [null, undefined, '', 'data:image/png;base64,', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', 'javascript:alert(1)', 'https://sitio.com/logo.png', 'data:image/png;base64,@@@@'].every((x) => !esLogoValido(x)),
    'Se descarta lo guardado que no sea PNG/JPEG en texto (SVG, GIF, enlaces, vacío o dañado)',
  );
  afirmar(!esLogoValido(`data:image/png;base64,${'A'.repeat(LOGO_DATOS_MAXIMO_CARACTERES)}`), 'Un logotipo guardado demasiado pesado se descarta');
  afirmar(logoEnImagenActivo(null) && logoEnImagenActivo('1') && !logoEnImagenActivo('0'), 'El interruptor «Mostrar en la imagen del ticket» viene ACTIVADO y solo «0» lo apaga');

  // ---- Cómo se dibuja arriba del ticket
  afirmar(JSON.stringify(tamanoLogoEnImagen(384, 160, 360)) === '{"ancho":288,"alto":120}', 'En la imagen del ticket el logotipo se ajusta al ancho útil y a 120 px de alto');
  afirmar(JSON.stringify(tamanoLogoEnImagen(100, 50, 360)) === '{"ancho":100,"alto":50}', 'Un logotipo chico se dibuja a su tamaño (sin agrandar)');
  afirmar(JSON.stringify(tamanoLogoEnImagen(0, 50, 360)) === '{"ancho":0,"alto":0}', 'Un logotipo ilegible no ocupa lugar');

  // ---- Integración: sale (o no) en la imagen del ticket
  const bd = await BaseDatosLocal.crear({
    localizarArchivo: () => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
  });
  const configuracion = new ConfiguracionRepositorioSqlite(bd);
  const productos = new ProductoRepositorioSqlite(bd);
  const clientes = new ClienteRepositorioSqlite(bd, configuracion);
  const caja = new CajaRepositorioSqlite(bd);
  const ventas = new VentaRepositorioSqlite(bd, productos, caja, configuracion);
  const contenedor = { configuracion, ventas, clientes, plan: { obtenerEstado: () => ({ tipo: 'premium' }) } } as unknown as Parameters<typeof construirDatosComprobanteDeVenta>[0];
  const producto = productos.crear({ nombre: 'Gaseosa', precioVenta: 4, costo: 2, stockActual: 10, stockMinimo: 1, controlaStock: true, unidadMedida: 'unidad' });
  const venta = ventas.registrarVenta({ lineas: [{ productoId: producto.id, cantidad: 1 }], metodoPago: 'efectivo' });

  afirmar(construirDatosComprobanteDeVenta(contenedor, venta.id).logoParaImagen === null, 'Sin logotipo guardado, el ticket no lleva logotipo');
  configuracion.establecerValor(CLAVE_LOGO_DATOS, png);
  afirmar(construirDatosComprobanteDeVenta(contenedor, venta.id).logoParaImagen === png, 'Con logotipo guardado (y el interruptor sin tocar) va en la imagen del ticket');
  configuracion.establecerValor(CLAVE_LOGO_EN_IMAGEN, '0');
  afirmar(construirDatosComprobanteDeVenta(contenedor, venta.id).logoParaImagen === null, 'Con el interruptor apagado no va, pero el logotipo sigue guardado');
  afirmar(configuracion.obtenerValor(CLAVE_LOGO_DATOS) === png, 'Apagar el interruptor no borra el logotipo');
  configuracion.establecerValor(CLAVE_LOGO_EN_IMAGEN, '1');
  configuracion.establecerValor(CLAVE_LOGO_DATOS, 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=');
  afirmar(construirDatosComprobanteDeVenta(contenedor, venta.id).logoParaImagen === null, 'Un dato dañado o no permitido guardado antes nunca llega al ticket');
  configuracion.establecerValor(CLAVE_LOGO_DATOS, png);
  const datosConLogo = construirDatosComprobanteDeVenta(contenedor, venta.id);
  const textoConLogo = construirTextoComprobante(datosConLogo);
  configuracion.eliminarValor(CLAVE_LOGO_DATOS);
  afirmar(construirTextoComprobante(construirDatosComprobanteDeVenta(contenedor, venta.id)) === textoConLogo, 'El texto que va a la impresora no cambia con el logotipo (la impresión del logo es otra etapa)');
  afirmar(configuracion.obtenerValor(CLAVE_LOGO_DATOS) === null, 'Quitar el logotipo lo borra');

  // ---- Respaldo: el logotipo viaja con la base
  configuracion.establecerValor(CLAVE_LOGO_DATOS, png);
  const restaurada = await BaseDatosLocal.crear({
    localizarArchivo: () => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    datosPrevios: bd.exportar(),
  });
  afirmar(new ConfiguracionRepositorioSqlite(restaurada).obtenerValor(CLAVE_LOGO_DATOS) === png, 'El logotipo viaja en el respaldo (se recupera al restaurar)');

  console.log('\n🎉 Logotipo del negocio (Etapa 1): validaciones, tamaño y guardado funcionan.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
