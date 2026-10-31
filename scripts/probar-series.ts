/**
 * Prueba de Series y comprobantes (Etapas 1 a 3): formato, validaciones, RUC, qué tipos hay disponibles,
 * correlativo atómico y sin saltos, factura con RUC, anulada conserva su número, ventas antiguas sin número,
 * Premium vencido, asignación a usuarios, bitácora y que todo sobreviva a un respaldo.
 *
 * Uso: npx tsx scripts/probar-series.ts
 */
import path from 'node:path';
import { BaseDatosLocal } from '../src/infraestructura/sqlite/base-datos';
import { ConfiguracionRepositorioSqlite } from '../src/infraestructura/sqlite/configuracion.repositorio';
import { ProductoRepositorioSqlite } from '../src/infraestructura/sqlite/producto.repositorio';
import { ClienteRepositorioSqlite } from '../src/infraestructura/sqlite/cliente.repositorio';
import { CajaRepositorioSqlite } from '../src/infraestructura/sqlite/caja.repositorio';
import { VentaRepositorioSqlite } from '../src/infraestructura/sqlite/venta.repositorio';
import { UsuarioRepositorioSqlite } from '../src/infraestructura/sqlite/usuario.repositorio';
import { ActividadUsuarioRepositorioSqlite } from '../src/infraestructura/sqlite/actividad-usuario.repositorio';
import { SerieComprobanteRepositorioSqlite } from '../src/infraestructura/sqlite/serie-comprobante.repositorio';
import { ContextoActor } from '../src/infraestructura/sqlite/contexto-actor';
import { CLAVE_PLAN_VENCE_EN } from '../src/core/plan';
import { ErrorDeNegocio } from '../src/core/reglas-negocio';
import { textoDeActividad } from '../src/core/actividad';
import { construirLineasComprobante, construirTextoComprobante } from '../src/core/comprobante-impresion';
import { construirHojaVentas, exportarVentasACsv } from '../src/core/exportacion';
import { construirMensajeVenta } from '../src/core/whatsapp';
import { construirDatosComprobanteDeVenta } from '../src/infraestructura/comprobante/datos-comprobante';
import {
  comprobantePorDefecto,
  comprobanteConTipo,
  comprobantesDisponibles,
  ejemploComprobante,
  elegirSerie,
  esRucValido,
  formatearComprobante,
  normalizarSerie,
  numeroMaximo,
  seriesDisponibles,
  sugerirSerie,
  esSerieValida,
  textoComprobante,
  validarClienteParaFactura,
  validarSerie,
  validarSiguienteNumero,
  type SerieComprobante,
} from '../src/core/comprobantes';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

function lanza(fn: () => unknown, claseError: new (...args: never[]) => Error = ErrorDeNegocio): Error | null {
  try {
    fn();
  } catch (e) {
    return e instanceof claseError ? e : null;
  }
  return null;
}

async function main() {
  // ---------- 1. Funciones puras ----------
  afirmar(formatearComprobante('001', 123, 7) === '001-0000123', 'Formato SERIE-NÚMERO con 7 dígitos: 001-0000123');
  afirmar(formatearComprobante('002', 45, 8) === '002-00000045', 'Formato con 8 dígitos: 002-00000045');
  afirmar(textoComprobante({ tipo: 'nota_venta', serie: null, numero: null, ventaId: 12 }) === 'V-12', 'La nota de venta sigue con V-N');
  afirmar(textoComprobante({ tipo: 'boleta', serie: null, numero: null, ventaId: 7 }) === 'V-7', 'Una venta sin número (anterior a las series) se muestra como V-N');

  afirmar(validarSerie(' 001 ') === '001' && validarSerie('999') === '999' && validarSerie('010') === '010', 'Serie válida: exactamente 3 números (se recortan los espacios)');
  afirmar(
    ['B001', 'F001', 'E001', 'EB01', 'T001', 'V01', '12', '1234', '00A', '0 1', '0-1', '', '  ', '٠٠١'].every((s) => lanza(() => validarSerie(s)) !== null),
    'Serie inválida: con letras (B001, F001, E001, EB01, T001, V01...), de 2 o 4 números, con espacios o guiones, o vacía',
  );
  afirmar(!esSerieValida('B001') && !esSerieValida('01') && esSerieValida('001'), 'esSerieValida: solo 3 números');
  afirmar(sugerirSerie([]) === '001' && sugerirSerie(['001']) === '002' && sugerirSerie(['001', '003']) === '002' && sugerirSerie(['B001']) === '001', 'Serie sugerida: la primera libre desde la 001');
  afirmar(normalizarSerie(' 002') === '002', 'normalizarSerie recorta espacios');
  afirmar(numeroMaximo(7) === 9_999_999 && numeroMaximo(8) === 99_999_999, 'Máximos: 9 999 999 (7 dígitos) y 99 999 999 (8 dígitos)');
  afirmar(
    lanza(() => validarSiguienteNumero(0, 7)) !== null && lanza(() => validarSiguienteNumero(1.5, 7)) !== null && lanza(() => validarSiguienteNumero(10_000_000, 7)) !== null && validarSiguienteNumero(501, 7) === 501,
    'Siguiente número: entero desde 1 y que quepa en los dígitos de la serie',
  );
  afirmar(
    ejemploComprobante('001', 7, 1) === '001-0000001' && ejemploComprobante('002', 8, 25) === '002-00000025' && ejemploComprobante('B001', 7, 1) === null && ejemploComprobante('01', 7, 1) === null && ejemploComprobante('001', 7, 0) === null && ejemploComprobante('001', 9, 1) === null,
    'Ejemplo en vivo: 001-0000001; mientras lo escrito no sea válido (letras, 2 números...), no muestra nada',
  );

  // RUC: los primeros cuatro son RUC reales; los de prefijo 10/15/16/17 se armaron con el mismo módulo 11 (ver comentario).
  afirmar(['20100070970', '20131312955', '20100047218', '20100128056'].every(esRucValido), 'RUC reales de empresa (prefijo 20) con dígito verificador correcto');
  // Ejemplo a mano: 10123456781 → 5·1+4·0+3·1+2·2+7·3+6·4+5·5+4·6+3·7+2·8 = 143; 143 % 11 = 0; (11 - 0) % 10 = 1 ✔.
  afirmar(
    esRucValido('10123456781') && esRucValido('15123456782') && esRucValido('16123456789') && esRucValido('17123456785'),
    'RUC válidos con prefijo 10, 15, 16 y 17 (dígito verificador módulo 11)',
  );
  afirmar(!esRucValido('20100070971'), 'RUC con dígito verificador equivocado → inválido');
  afirmar(!esRucValido('12345678901') && !esRucValido('30100070970') && !esRucValido('11123456785'), 'RUC con prefijo no permitido → inválido');
  afirmar(!esRucValido('2010007097') && !esRucValido('201000709700') && !esRucValido('2010007097A') && !esRucValido('') && !esRucValido(null) && !esRucValido(undefined), 'RUC que no tiene 11 dígitos exactos (o no son números) → inválido');
  afirmar(esRucValido(' 20100070970 '), 'El RUC con espacios alrededor se acepta (se recorta)');
  afirmar(
    lanza(() => validarClienteParaFactura(null, null)) !== null &&
      lanza(() => validarClienteParaFactura(1, null)) !== null &&
      lanza(() => validarClienteParaFactura(1, '12345678')) !== null &&
      lanza(() => validarClienteParaFactura(1, '20100070970')) === null,
    'Factura: exige cliente registrado con RUC válido (mensajes distintos si falta cliente, RUC o es inválido)',
  );

  const serie = (id: number, tipo: 'boleta' | 'factura', texto: string, extra: Partial<SerieComprobante> = {}): SerieComprobante => ({
    id,
    tipo,
    serie: texto,
    digitosNumero: 7,
    siguienteNumero: 1,
    activo: true,
    predeterminada: false,
    creadoEn: '',
    actualizadoEn: '',
    ...extra,
  });
  const sB = serie(1, 'boleta', '001', { predeterminada: true });
  const sB2 = serie(2, 'boleta', '003');
  const sF = serie(3, 'factura', '002', { predeterminada: true });

  afirmar(seriesDisponibles(true) && !seriesDisponibles(false), 'Las series solo están disponibles con Premium (un solo punto de decisión)');
  afirmar(JSON.stringify(comprobantesDisponibles(true, [])) === '["nota_venta"]', 'Sin series creadas: solo nota de venta');
  afirmar(JSON.stringify(comprobantesDisponibles(false, [sB, sF])) === '["nota_venta"]', 'Sin Premium: solo nota de venta aunque haya series');
  afirmar(JSON.stringify(comprobantesDisponibles(true, [sB, sF])) === '["nota_venta","boleta","factura"]', 'Con series de Boleta y Factura: las tres opciones');
  afirmar(JSON.stringify(comprobantesDisponibles(true, [sB, serie(4, 'factura', '009', { activo: false })])) === '["nota_venta","boleta"]', 'Una serie desactivada no habilita su tipo');
  afirmar(comprobantePorDefecto(comprobantesDisponibles(true, [sB, sF])) === 'boleta', 'Con Boleta y Factura, por defecto aparece Boleta');
  afirmar(comprobantePorDefecto(comprobantesDisponibles(true, [sF])) === 'nota_venta' && comprobantePorDefecto(['nota_venta']) === 'nota_venta', 'Sin Boleta, el valor por defecto es nota de venta (nunca Factura)');
  afirmar(elegirSerie('boleta', [sB, sB2, sF], null)?.id === 1, 'Sin serie asignada se usa la predeterminada del tipo');
  afirmar(elegirSerie('boleta', [sB, sB2, sF], 2)?.id === 2, 'Con serie asignada se usa esa');
  afirmar(elegirSerie('boleta', [sB, { ...sB2, activo: false }, sF], 2)?.id === 1, 'Una serie asignada que se desactivó se ignora: cae a la predeterminada');
  afirmar(elegirSerie('boleta', [sF], null) === null, 'Sin series activas del tipo: ninguna');
  afirmar(elegirSerie('boleta', [serie(5, 'boleta', '005'), serie(6, 'boleta', '006')], null)?.id === 5, 'Sin predeterminada marcada: la activa más antigua');

  // ---------- 2. Con base de datos ----------
  const bd = await BaseDatosLocal.crear({
    localizarArchivo: () => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
  });
  const actor = new ContextoActor();
  const actividad = new ActividadUsuarioRepositorioSqlite(bd, actor);
  const configuracion = new ConfiguracionRepositorioSqlite(bd);
  const productos = new ProductoRepositorioSqlite(bd, actividad);
  const clientes = new ClienteRepositorioSqlite(bd, configuracion, actividad);
  const caja = new CajaRepositorioSqlite(bd, actividad);
  const series = new SerieComprobanteRepositorioSqlite(bd, actividad, configuracion);
  const ventas = new VentaRepositorioSqlite(bd, productos, caja, configuracion, actividad, series);
  const usuarios = new UsuarioRepositorioSqlite(bd, configuracion, undefined, actividad);

  const fila = <T>(sql: string, params: unknown[] = []) => bd.consultar<T>(sql, params)[0] as T;
  const cuantasVentas = () => fila<{ n: number }>('SELECT COUNT(*) AS n FROM venta').n;
  const premium = (activo: boolean) => configuracion.establecerValor(CLAVE_PLAN_VENCE_EN, activo ? '2099-12-31' : '2000-01-01');
  premium(true);

  const { usuario: diego } = await usuarios.crearPrimerAdministrador({ nombre: 'diego', clave: 'Admin.2024' });
  const luis = await usuarios.crear({ nombre: 'luis', clave: '1234', rol: 'estandar' });
  const gaseosa = productos.crear({ nombre: 'Gaseosa', precioVenta: 4, costo: 2, stockActual: 100, stockMinimo: 1, controlaStock: true, unidadMedida: 'unidad' });
  const lineas = [{ productoId: gaseosa.id, cantidad: 1 }];
  const vender = (extra: object = {}) => ventas.registrarVenta({ lineas, metodoPago: 'efectivo', ...extra });

  // A. Sin series: solo notas de venta.
  const nota1 = vender();
  afirmar(nota1.tipoComprobante === 'nota_venta' && nota1.serie === null && nota1.numeroComprobante === null && nota1.comprobante === `V-${nota1.id}`, 'Sin series, la venta es nota de venta con su V-N de siempre');
  afirmar(lanza(() => vender({ tipoComprobante: 'boleta' })) !== null, 'Sin series no se puede emitir una boleta (mensaje claro)');
  afirmar(JSON.stringify(comprobantesDisponibles(true, series.listar())) === '["nota_venta"]', 'Con la tabla de series vacía solo hay nota de venta');

  // B. Crear series (con un administrador dentro, para ver la bitácora).
  actor.establecerUsuario(diego.id);
  const b001 = series.crear({ tipo: 'boleta', serie: '001' });
  const f001 = series.crear({ tipo: 'factura', serie: '002' });
  const b002 = series.crear({ tipo: 'boleta', serie: '003' });
  afirmar(b001.serie === '001' && b001.digitosNumero === 7 && b001.siguienteNumero === 1 && b001.activo, 'Serie creada: mayúsculas, 7 dígitos y empieza en 1 por defecto');
  afirmar(b001.predeterminada && f001.predeterminada && !b002.predeterminada, 'La primera serie de cada tipo queda como predeterminada');
  afirmar(lanza(() => series.crear({ tipo: 'boleta', serie: '001' })) !== null, 'No se puede repetir una serie (sin importar mayúsculas)');
  afirmar(lanza(() => series.crear({ tipo: 'factura', serie: '001' })) !== null, 'Ni siquiera con otro tipo: una serie es única en toda la tienda');
  afirmar(lanza(() => series.crear({ tipo: 'boleta', serie: '12' })) !== null, 'Serie de 2 caracteres → rechazada');
  afirmar(lanza(() => series.crear({ tipo: 'boleta', serie: '777', digitosNumero: 9 })) !== null, 'Dígitos distintos de 7 u 8 → rechazados');
  configuracion.establecerValor('series_digitos_numero_defecto', '8');
  const b008 = series.crear({ tipo: 'boleta', serie: '005' });
  afirmar(b008.digitosNumero === 8, 'Una serie nueva toma los dígitos por defecto de la configuración (8)');
  configuracion.establecerValor('series_digitos_numero_defecto', '7');
  afirmar(series.obtenerPorId(b008.id).digitosNumero === 8, 'Cambiar el valor por defecto después NO altera las series ya creadas');
  afirmar(JSON.stringify(comprobantesDisponibles(true, series.listar())) === '["nota_venta","boleta","factura"]', 'Con series creadas aparecen Boleta y Factura');

  // C. Correlativo por serie.
  const bol1 = vender({ tipoComprobante: 'boleta' });
  const bol2 = vender({ tipoComprobante: 'boleta' });
  const bol3 = vender({ tipoComprobante: 'boleta' });
  afirmar([bol1, bol2, bol3].map((v) => v.numeroComprobante).join() === '1,2,3', 'Tres boletas seguidas: números 1, 2 y 3');
  afirmar(bol1.serie === '001' && bol1.comprobante === '001-0000001' && bol3.comprobante === '001-0000003', 'La boleta se muestra como 001-0000001 (usa la serie predeterminada)');
  afirmar(series.obtenerPorId(b001.id).siguienteNumero === 4, 'El siguiente número de la serie avanza a 4');
  const nota2 = vender();
  afirmar(series.obtenerPorId(b001.id).siguienteNumero === 4 && nota2.numeroComprobante === null, 'Una nota de venta no gasta números de ninguna serie');
  afirmar(fila<{ s: number }>('SELECT siguiente_numero AS s FROM serie_comprobante WHERE id = ?', [b002.id]).s === 1, 'Cada serie lleva su propio correlativo (003 sigue en 1)');

  // D. Si la venta falla, el número no se gasta.
  const antes = cuantasVentas();
  afirmar(lanza(() => ventas.registrarVenta({ lineas: [{ productoId: gaseosa.id, cantidad: 1000 }], metodoPago: 'efectivo', tipoComprobante: 'boleta' })) !== null, 'Una boleta sin stock suficiente falla');
  afirmar(lanza(() => ventas.registrarVenta({ lineas, metodoPago: 'fiado', tipoComprobante: 'boleta' })) !== null, 'Una boleta al fiado sin cliente falla');
  afirmar(cuantasVentas() === antes && series.obtenerPorId(b001.id).siguienteNumero === 4, 'Tras los fallos no quedó venta a medias y el número 4 NO se gastó');
  const bol4 = vender({ tipoComprobante: 'boleta' });
  afirmar(bol4.numeroComprobante === 4, 'La siguiente boleta usa el 4: sin saltos');

  // E. Anulada conserva su número y nunca se reutiliza.
  ventas.anularVenta(bol2.id, 'Error al digitar');
  const bol2Anulada = ventas.obtenerPorId(bol2.id);
  afirmar(bol2Anulada.anulada && bol2Anulada.numeroComprobante === 2 && bol2Anulada.comprobante === '001-0000002', 'La boleta anulada conserva su número (001-0000002)');
  const bol5 = vender({ tipoComprobante: 'boleta' });
  afirmar(bol5.numeroComprobante === 5, 'El número de una anulada no se reutiliza: la siguiente es la 5');

  // F. Ventas anteriores sin número + índice único.
  bd.ejecutar("INSERT INTO venta (metodo_pago, subtotal, total) VALUES ('efectivo', 10, 10)");
  const vieja = ventas.obtenerPorId(bd.ultimoIdInsertado());
  afirmar(vieja.tipoComprobante === 'nota_venta' && vieja.serie === null && vieja.numeroComprobante === null && vieja.comprobante === `V-${vieja.id}`, 'Una venta guardada sin comprobante (como las anteriores) queda como nota de venta, sin número');
  bd.ejecutar("INSERT INTO venta (metodo_pago, subtotal, total) VALUES ('efectivo', 1, 1)");
  afirmar(true, 'Varias ventas sin serie conviven (el índice único ignora los NULL)');
  afirmar(
    lanza(() => bd.ejecutar("INSERT INTO venta (metodo_pago, subtotal, total, tipo_comprobante, serie, numero_comprobante) VALUES ('efectivo', 1, 1, 'boleta', '001', 1)"), Error) !== null,
    'La base rechaza repetir (serie, número): índice único',
  );

  // G. Factura: cliente registrado con RUC válido.
  afirmar(lanza(() => vender({ tipoComprobante: 'factura' })) !== null, 'Factura sin cliente → rechazada');
  // Los clientes de antes de que existiera el documento quedan con documento vacío (NULL).
  bd.ejecutar("INSERT INTO cliente (nombre) VALUES ('CLIENTE ANTIGUO SIN DOCUMENTO')");
  const sinRuc = { id: bd.ultimoIdInsertado() };
  afirmar(lanza(() => vender({ tipoComprobante: 'factura', clienteId: sinRuc.id })) !== null, 'Factura a un cliente sin RUC → rechazada');
  const rucMalo = clientes.crear('Cliente RUC Malo', '20100070971');
  afirmar(lanza(() => vender({ tipoComprobante: 'factura', clienteId: rucMalo.id })) !== null, 'Factura a un cliente con RUC inválido → rechazada');
  const dni = clientes.crear('Cliente Con DNI', '12345678');
  afirmar(lanza(() => vender({ tipoComprobante: 'factura', clienteId: dni.id })) !== null, 'Factura a un cliente con DNI (8 dígitos) → rechazada');
  afirmar(series.obtenerPorId(f001.id).siguienteNumero === 1, 'Las facturas rechazadas no gastaron ningún número de 002');
  const empresa = clientes.crear('Empresa SAC', '20100070970');
  const fac1 = vender({ tipoComprobante: 'factura', clienteId: empresa.id });
  afirmar(fac1.tipoComprobante === 'factura' && fac1.comprobante === '002-0000001' && fac1.clienteId === empresa.id, 'Factura a cliente con RUC válido: 002-0000001');
  afirmar(bol5.numeroComprobante === 5 && series.obtenerPorId(b001.id).siguienteNumero === 6, 'La factura lleva su propio correlativo: no movió el de 001');
  const bolCliente = vender({ tipoComprobante: 'boleta', clienteId: sinRuc.id });
  afirmar(bolCliente.numeroComprobante === 6, 'La boleta no exige RUC: se puede emitir a un cliente sin RUC');

  // H. «Siguiente número» editable.
  const cambiada = series.actualizar(b001.id, { siguienteNumero: 100 });
  afirmar(cambiada.siguienteNumero === 100, 'Se puede subir el siguiente número (continuar un talonario físico)');
  const bol100 = vender({ tipoComprobante: 'boleta' });
  afirmar(bol100.comprobante === '001-0000100', 'La siguiente boleta sale con el 100');
  afirmar(lanza(() => series.actualizar(b001.id, { siguienteNumero: 3 })) !== null, 'Bajar el siguiente número está prohibido (ni el administrador puede)');
  afirmar(lanza(() => series.actualizar(b001.id, { siguienteNumero: 100 })) !== null, 'Ni siquiera a un número ya emitido');
  afirmar(series.obtenerPorId(b001.id).siguienteNumero === 101, 'Tras los intentos de bajarlo, el correlativo sigue en 101');
  afirmar(series.actualizar(b001.id, { siguienteNumero: 101 }).siguienteNumero === 101, 'Dejarlo igual no es un error');
  const bolSigue = vender({ tipoComprobante: 'boleta' });
  afirmar(bolSigue.numeroComprobante === 101, 'El correlativo continúa: la siguiente boleta es la 101');
  afirmar(lanza(() => series.actualizar(b001.id, { serie: '777' })) !== null, 'Una serie que ya se usó no puede cambiar de nombre');
  afirmar(lanza(() => series.actualizar(b001.id, { digitosNumero: 8 })) !== null, 'Una serie que ya se usó no puede cambiar de dígitos');
  const b002Cambiada = series.actualizar(b002.id, { serie: '004', digitosNumero: 8 });
  afirmar(b002Cambiada.serie === '004' && b002Cambiada.digitosNumero === 8, 'Una serie sin uso sí puede cambiar de nombre y de dígitos');
  afirmar(lanza(() => series.actualizar(b002.id, { serie: '001' })) !== null, 'Cambiar el nombre a uno que ya existe → rechazado');

  // I. Largo del número y serie agotada.
  const bolOcho = vender({ tipoComprobante: 'boleta', serieId: b008.id });
  afirmar(bolOcho.comprobante === '005-00000001', 'Una serie de 8 dígitos muestra 8 dígitos: 005-00000001');
  const llena = series.crear({ tipo: 'boleta', serie: '006', siguienteNumero: 9_999_999 });
  afirmar(vender({ tipoComprobante: 'boleta', serieId: llena.id }).comprobante === '006-9999999', 'El último número que cabe (9 999 999) se emite');
  const ventasAntesLlena = cuantasVentas();
  afirmar(lanza(() => vender({ tipoComprobante: 'boleta', serieId: llena.id })) !== null && cuantasVentas() === ventasAntesLlena, 'Una serie llena avisa con claridad y no guarda la venta');
  afirmar(lanza(() => vender({ tipoComprobante: 'factura', serieId: b001.id, clienteId: empresa.id })) !== null, 'Usar una serie de otro tipo → rechazado');

  // J. Premium vencido: solo nota de venta; las series se conservan.
  premium(false);
  const activasAntes = series.listarActivas().length;
  afirmar(lanza(() => vender({ tipoComprobante: 'boleta' })) !== null, 'Premium vencido: no se puede emitir boleta');
  afirmar(lanza(() => vender({ tipoComprobante: 'factura', clienteId: empresa.id })) !== null, 'Premium vencido: no se puede emitir factura');
  afirmar(vender().tipoComprobante === 'nota_venta', 'Premium vencido: la nota de venta sigue funcionando (nadie queda bloqueado)');
  afirmar(JSON.stringify(comprobantesDisponibles(false, series.listar())) === '["nota_venta"]' && series.listarActivas().length === activasAntes, 'Premium vencido: solo nota de venta, y las series se conservan');
  premium(true);
  afirmar(vender({ tipoComprobante: 'boleta' }).tipoComprobante === 'boleta', 'Al reactivar el Premium vuelven las boletas');

  // K. Asignación a usuarios y serie predeterminada.
  afirmar(series.resolverSerie('boleta', luis.id)?.id === b001.id, 'Un usuario sin asignación usa la predeterminada del tipo');
  series.asignarAUsuario(luis.id, 'boleta', b002.id);
  afirmar(series.resolverSerie('boleta', luis.id)?.id === b002.id && series.resolverSerie('boleta', diego.id)?.id === b001.id, 'La serie asignada a Luis es solo suya: el administrador sigue con la predeterminada');
  actor.establecerUsuario(luis.id);
  const bolLuis = vender({ tipoComprobante: 'boleta' });
  afirmar(bolLuis.serie === '004' && bolLuis.comprobante === '004-00000001' && bolLuis.usuarioId === luis.id, 'Luis (estándar) emite con su serie asignada y su número de 8 dígitos');
  actor.establecerUsuario(diego.id);
  afirmar(vender({ tipoComprobante: 'boleta' }).serie === '001', 'Diego emite con la predeterminada (001)');
  afirmar(lanza(() => series.asignarAUsuario(luis.id, 'factura', b002.id)) !== null, 'No se puede asignar una serie de otro tipo');
  afirmar(lanza(() => series.asignarAUsuario(9999, 'boleta', b002.id)) !== null, 'No se puede asignar a un usuario que no existe');
  afirmar(series.listarAsignaciones().length === 1, 'Queda registrada una sola asignación');

  series.establecerActiva(b002.id, false);
  afirmar(series.resolverSerie('boleta', luis.id)?.id === b001.id, 'Si se desactiva la serie de Luis, cae a la predeterminada (nadie se queda sin poder vender)');
  afirmar(lanza(() => series.asignarAUsuario(luis.id, 'boleta', b002.id)) !== null, 'No se puede asignar una serie desactivada');
  series.establecerActiva(b002.id, true);
  afirmar(series.resolverSerie('boleta', luis.id)?.id === b002.id, 'Al reactivar la serie, la asignación de Luis vuelve a valer');
  series.asignarAUsuario(luis.id, 'boleta', null);
  afirmar(series.resolverSerie('boleta', luis.id)?.id === b001.id && series.listarAsignaciones().length === 0, 'Quitar la asignación devuelve a Luis a la predeterminada');

  series.establecerActiva(b001.id, false);
  const ahora = series.listar().filter((s) => s.tipo === 'boleta');
  afirmar(!series.obtenerPorId(b001.id).predeterminada && ahora.filter((s) => s.activo && s.predeterminada).length === 1, 'Al desactivar la predeterminada, otra serie activa del tipo toma su lugar');
  afirmar(series.obtenerPorId(b001.id).siguienteNumero > 0 && ventas.obtenerPorId(bol1.id).comprobante === '001-0000001', 'Desactivar no borra: la serie y sus números emitidos se conservan');
  afirmar(lanza(() => vender({ tipoComprobante: 'boleta', serieId: b001.id })) !== null, 'Una serie desactivada no emite');
  series.establecerActiva(b001.id, true);
  afirmar(!series.obtenerPorId(b001.id).predeterminada, 'Al reactivar una serie, no le quita la predeterminada a la que ya está');
  series.establecerPredeterminada(b001.id);
  afirmar(series.obtenerPorId(b001.id).predeterminada && series.listar().filter((s) => s.tipo === 'boleta' && s.predeterminada).length === 1, 'Se puede elegir otra predeterminada (siempre una sola por tipo)');
  series.establecerActiva(f001.id, false);
  afirmar(JSON.stringify(comprobantesDisponibles(true, series.listar())) === '["nota_venta","boleta"]' && lanza(() => vender({ tipoComprobante: 'factura', clienteId: empresa.id })) !== null, 'Sin ninguna serie de factura activa, desaparece Factura');
  series.establecerActiva(f001.id, true);

  // L. Bitácora.
  const acciones = bd.consultar<{ accion: string; detalle: string | null; entidad: string }>('SELECT accion, detalle, entidad FROM actividad_usuario ORDER BY id');
  const hubo = (a: string) => acciones.some((x) => x.accion === a);
  afirmar(hubo('serie_creada') && hubo('serie_modificada') && hubo('serie_desactivada') && hubo('serie_asignada') && hubo('serie_numero_cambiado'), 'La bitácora registra: serie creada, modificada, desactivada, asignada y siguiente número cambiado');
  afirmar(acciones.find((x) => x.accion === 'serie_creada')?.detalle === '001 (Boleta)' && acciones.find((x) => x.accion === 'serie_asignada')?.entidad === 'usuario', 'El detalle es legible (001 (Boleta)) y la asignación queda sobre el usuario');
  afirmar(textoDeActividad({ accion: 'serie_creada', detalle: '001 (Boleta)' }) === 'creó la serie 001 (Boleta)', 'La actividad se lee en palabras: «creó la serie 001 (Boleta)»');

  // N. Etapa 3: ticket, listas, reimpresión, exportación y WhatsApp.
  afirmar(
    comprobanteConTipo({ tipo: 'boleta', serie: '001', numero: 1, ventaId: 9, digitos: 7 }) === 'Boleta 001-0000001' &&
      comprobanteConTipo({ tipo: 'factura', serie: '002', numero: 45, ventaId: 9, digitos: 8 }) === 'Factura 002-00000045' &&
      comprobanteConTipo({ tipo: 'nota_venta', serie: null, numero: null, ventaId: 12 }) === 'Nota de venta V-12' &&
      comprobanteConTipo({ tipo: 'boleta', serie: null, numero: null, ventaId: 7 }) === 'Nota de venta V-7',
    'Etiqueta para listas y reportes: «Boleta 001-0000001» / «Factura 002-00000045» / «Nota de venta V-12»',
  );
  const contenedorFalso = {
    configuracion,
    ventas,
    clientes,
    usuarios,
    plan: { obtenerEstado: () => ({ tipo: 'premium' }) },
  } as unknown as Parameters<typeof construirDatosComprobanteDeVenta>[0];

  // Todo ticket (nota de venta, boleta o factura): arriba «DOCUMENTO INTERNO», debajo la serie y el número,
  // y al final «Documento interno, sin valor tributario». (Se arma a un ancho mayor para leer cada línea completa.)
  const lineasDe = (ventaId: number, ancho = 80) =>
    construirLineasComprobante(construirDatosComprobanteDeVenta(contenedorFalso, ventaId), ancho).map((l) => l.texto);
  const ARRIBA = (l: string[]) => l.findIndex((x) => x === 'DOCUMENTO INTERNO');
  const LEYENDA = 'Documento interno, sin valor tributario';

  const tBoleta = lineasDe(bol1.id);
  afirmar(
    ARRIBA(tBoleta) >= 0 && tBoleta[ARRIBA(tBoleta) + 1] === '001-0000001' && tBoleta[ARRIBA(tBoleta) + 2] === `Pedido V-${bol1.id}` && !tBoleta.some((x) => x.includes('BOLETA') || x.includes('NOTA DE VENTA')),
    'Ticket de boleta: «DOCUMENTO INTERNO», debajo «001-0000001» y la referencia «Pedido V-N»',
  );
  const tFactura = lineasDe(fac1.id);
  afirmar(
    tFactura[ARRIBA(tFactura) + 1] === '002-0000001' && tFactura.some((x) => x.includes('RUC: 20100070970')) && !tFactura.some((x) => x.includes('DNI:') || x.includes('FACTURA')),
    'Ticket de factura: «DOCUMENTO INTERNO», debajo «002-0000001», y el documento del cliente como RUC',
  );
  const tNota = lineasDe(nota1.id);
  afirmar(tNota[ARRIBA(tNota) + 1] === `V-${nota1.id}` && !tNota.some((x) => x.startsWith('Pedido V-')), 'Ticket de nota de venta: «DOCUMENTO INTERNO» y, debajo, su V-N de siempre (sin línea de pedido aparte)');
  afirmar([tBoleta, tFactura, tNota].every((l) => l[l.length - 1] === LEYENDA), 'En los tres tickets, la leyenda «Documento interno, sin valor tributario» es lo último');
  const tAngosto = lineasDe(bol1.id, 32);
  afirmar(tAngosto.slice(-2).join(' ') === 'Documento interno, sin valor tributario' && tAngosto.slice(-2).every((x) => x.length <= 32), 'En papel de 32 caracteres la leyenda se parte en la coma y se lee completa');
  const textoTicket = construirTextoComprobante(construirDatosComprobanteDeVenta(contenedorFalso, bol1.id));
  afirmar(textoTicket.includes('DOCUMENTO INTERNO') && textoTicket.includes('001-0000001') && textoTicket.trimEnd().includes('sin valor tributario'), 'El texto que se manda a la impresora trae el encabezado, el número y la leyenda');
  const tOcho = lineasDe(bolOcho.id);
  afirmar(tOcho[ARRIBA(tOcho) + 1] === '005-00000001', 'El ticket respeta los 8 dígitos de la serie');
  const tAnulada = lineasDe(bol2.id);
  afirmar(tAnulada[ARRIBA(tAnulada) + 1] === '001-0000002', 'Reimprimir una boleta anulada conserva su número');

  const deHoy = ventas.listarDeHoyConDetalle();
  afirmar(
    deHoy.find((v) => v.id === bol1.id)?.comprobante === '001-0000001' &&
      deHoy.find((v) => v.id === fac1.id)?.comprobante === '002-0000001' &&
      deHoy.find((v) => v.id === nota1.id)?.comprobante === `V-${nota1.id}` &&
      deHoy.find((v) => v.id === bolOcho.id)?.comprobante === '005-00000001' &&
      deHoy.find((v) => v.id === bol2.id)?.comprobante === '001-0000002' &&
      deHoy.find((v) => v.id === bol2.id)?.anulada === true,
    'La lista de Inicio muestra el número de cada comprobante (la anulada también, marcada como anulada)',
  );
  const hoy = bd.consultar<{ d: string }>("SELECT date('now','localtime') AS d")[0]!.d;
  afirmar(ventas.listarPorRangoConDetalle(hoy, hoy).find((v) => v.id === bol1.id)?.comprobante === '001-0000001', 'La lista por rango también trae el comprobante');

  const buscar = (t: string) => ventas.buscarParaReimprimir(hoy, hoy, t).map((v) => v.id);
  afirmar(buscar('001-0000003').join() === String(bol3.id), 'Reimprimir: se encuentra por el número completo (001-0000003)');
  afirmar(buscar('001-').includes(bol1.id) && buscar('001-').includes(bol2.id) && !buscar('001-').includes(fac1.id), 'Reimprimir: se encuentra por la serie y el guion (001-)');
  afirmar(buscar('002-').includes(fac1.id) && !buscar('002-').includes(bol1.id), 'Reimprimir: la serie de factura trae solo facturas');
  afirmar(buscar(`V-${bol1.id}`).includes(bol1.id), 'Reimprimir: la referencia interna V-N sigue funcionando');
  afirmar(ventas.buscarParaReimprimir(hoy, hoy, '').find((v) => v.id === fac1.id)?.comprobante === '002-0000001', 'La lista de reimpresión trae el comprobante de cada venta');

  const detalle = ventas.listarDetalleParaExportar(hoy, hoy);
  const filaBoleta = detalle.find((f) => f.pedido === `V-${bol1.id}`)!;
  const filaFactura = detalle.find((f) => f.pedido === `V-${fac1.id}`)!;
  const filaNota = detalle.find((f) => f.pedido === `V-${nota1.id}`)!;
  afirmar(filaBoleta.comprobante === 'Boleta 001-0000001' && filaFactura.comprobante === 'Factura 002-0000001' && filaNota.comprobante === `Nota de venta V-${nota1.id}`, 'Exportación: la columna Comprobante trae tipo y número (y Pedido sigue siendo V-N)');
  const anuladasExp = ventas.listarAnuladasParaExportar(hoy, hoy);
  afirmar(anuladasExp.find((f) => f.pedido === `V-${bol2.id}`)?.comprobante === 'Boleta 001-0000002', 'La hoja de anuladas conserva el número de la boleta anulada');
  const csv = exportarVentasACsv(detalle);
  afirmar(csv.split('\r\n')[0]!.includes('Pedido,Comprobante,Fecha') && csv.includes('Boleta 001-0000001') && csv.includes('Factura 002-0000001'), 'El CSV de ventas tiene la columna «Comprobante» junto a «Pedido»');
  const hoja = construirHojaVentas(detalle);
  const iPedido = hoja.encabezados.indexOf('Pedido');
  afirmar(hoja.encabezados[iPedido + 1] === 'Comprobante' && hoja.filas.some((f) => f[iPedido] === `V-${bol1.id}` && f[iPedido + 1] === 'Boleta 001-0000001'), 'El Excel de ventas tiene la columna «Comprobante» junto a «Pedido»');
  afirmar(
    exportarVentasACsv([{ ...filaNota, comprobante: undefined }]).includes(`Nota de venta V-${nota1.id}`),
    'Una fila sin comprobante (datos antiguos) se exporta como nota de venta',
  );

  const mensajeBoleta = construirMensajeVenta('Mi Bodega', ventas.obtenerPorId(bol1.id), [], 'S/');
  const mensajeNota = construirMensajeVenta('Mi Bodega', ventas.obtenerPorId(nota1.id), [], 'S/');
  afirmar(mensajeBoleta.includes('Venta: 001-0000001') && mensajeNota.includes(`Venta: V-${nota1.id}`), 'El mensaje de WhatsApp lleva el número del comprobante (V-N en notas de venta)');

  // M. Respaldo: todo viaja en la misma base.
  const bd2 = await BaseDatosLocal.crear({
    localizarArchivo: () => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    datosPrevios: bd.exportar(),
  });
  const config2 = new ConfiguracionRepositorioSqlite(bd2);
  const series2 = new SerieComprobanteRepositorioSqlite(bd2, undefined, config2);
  const ventas2 = new VentaRepositorioSqlite(bd2, new ProductoRepositorioSqlite(bd2), new CajaRepositorioSqlite(bd2), config2, undefined, series2);
  afirmar(series2.listar().length === series.listar().length, 'Tras restaurar un respaldo siguen todas las series');
  afirmar(ventas2.obtenerPorId(bol1.id).comprobante === '001-0000001' && ventas2.obtenerPorId(bol2.id).anulada, 'Tras restaurar, las ventas conservan su número y la anulada sigue anulada');
  const bolRestaurada = ventas2.registrarVenta({ lineas, metodoPago: 'efectivo', tipoComprobante: 'boleta' });
  afirmar(bolRestaurada.numeroComprobante !== null && bolRestaurada.numeroComprobante > 101, 'Tras restaurar, el correlativo continúa sin repetir números');

  console.log('\n🎉 Series y comprobantes (Etapas 1 a 3) funciona: correlativo atómico, sin saltos ni repetidos.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
