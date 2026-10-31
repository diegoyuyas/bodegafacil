import type { RegistroActividad } from '@/core/actividad';
import { CLAVE_SERIES_DIGITOS_NUMERO } from '@/core/configuracion';
import type { Permiso } from '@/core/permisos';
import {
  digitosNumeroDeConfiguracion,
  elegirSerie,
  esSerieValida,
  formatearComprobante,
  normalizarSerie,
  numeroMaximo,
  validarDigitosNumero,
  validarSerie,
  validarSiguienteNumero,
  ETIQUETA_COMPROBANTE,
  type SerieComprobante,
  type TipoSerie,
} from '@/core/comprobantes';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import type {
  AsignacionSerieUsuario,
  CambiosSerie,
  ConfiguracionRepositorio,
  DatosNuevaSerie,
  NumeroReservado,
  SerieComprobanteRepositorio,
} from '@/core/repositorios';
import type { BaseDatosLocal } from './base-datos';

interface FilaSerie {
  id: number;
  tipo: TipoSerie;
  serie: string;
  digitos_numero: number;
  siguiente_numero: number;
  activo: number;
  es_predeterminada: number;
  creado_en: string;
  actualizado_en: string;
}

function mapearSerie(fila: FilaSerie): SerieComprobante {
  return {
    id: fila.id,
    tipo: fila.tipo,
    serie: fila.serie,
    digitosNumero: fila.digitos_numero,
    siguienteNumero: fila.siguiente_numero,
    activo: fila.activo === 1,
    predeterminada: fila.es_predeterminada === 1,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

/**
 * Series de comprobantes. El siguiente número se toma con `tomarSiguienteNumero`, que NO abre su propia
 * transacción: lo llama `registrarVenta` dentro de la misma transacción que guarda la venta, así un número
 * nunca se repite ni se salta (si la venta falla, el número vuelve atrás junto con todo lo demás).
 */
export class SerieComprobanteRepositorioSqlite implements SerieComprobanteRepositorio {
  constructor(
    private readonly bd: BaseDatosLocal,
    private readonly actividad?: RegistroActividad,
    private readonly configuracion?: ConfiguracionRepositorio,
  ) {}

  listar(): SerieComprobante[] {
    return this.bd.consultar<FilaSerie>('SELECT * FROM serie_comprobante ORDER BY tipo, id').map(mapearSerie);
  }

  listarActivas(): SerieComprobante[] {
    return this.listar().filter((s) => s.activo);
  }

  obtenerPorId(id: number): SerieComprobante {
    const fila = this.bd.consultar<FilaSerie>('SELECT * FROM serie_comprobante WHERE id = ?', [id])[0];
    if (!fila) throw new ErrorDeNegocio('Esa serie no existe.');
    return mapearSerie(fila);
  }

  crear(datos: DatosNuevaSerie): SerieComprobante {
    return this.bd.transaccion(() => {
      const serie = validarSerie(datos.serie);
      this.exigirSerieLibre(serie, null);
      const digitos = validarDigitosNumero(
        datos.digitosNumero ?? digitosNumeroDeConfiguracion(this.configuracion?.obtenerValor(CLAVE_SERIES_DIGITOS_NUMERO) ?? null),
      );
      const siguiente = validarSiguienteNumero(datos.siguienteNumero ?? 1, digitos);
      // La primera serie activa de un tipo queda como la predeterminada.
      const hayPredeterminada = this.bd.consultar<{ n: number }>(
        'SELECT COUNT(*) AS n FROM serie_comprobante WHERE tipo = ? AND activo = 1 AND es_predeterminada = 1',
        [datos.tipo],
      )[0]?.n;
      this.bd.ejecutar(
        `INSERT INTO serie_comprobante (tipo, serie, digitos_numero, siguiente_numero, activo, es_predeterminada)
         VALUES (?, ?, ?, ?, 1, ?)`,
        [datos.tipo, serie, digitos, siguiente, hayPredeterminada ? 0 : 1],
      );
      const id = this.bd.ultimoIdInsertado();
      this.registrar('serie_creada', id, `${serie} (${ETIQUETA_COMPROBANTE[datos.tipo]})`);
      return this.obtenerPorId(id);
    });
  }

  actualizar(id: number, cambios: CambiosSerie): SerieComprobante {
    return this.bd.transaccion(() => {
      const actual = this.obtenerPorId(id);
      const emitido = this.resumenEmitido(actual.serie);

      const serieNueva = cambios.serie === undefined ? actual.serie : validarSerie(cambios.serie);
      const digitosNuevos = cambios.digitosNumero === undefined ? actual.digitosNumero : validarDigitosNumero(cambios.digitosNumero);
      const cambiaNombre = serieNueva !== actual.serie;
      const cambiaDigitos = digitosNuevos !== actual.digitosNumero;

      if (emitido.cantidad > 0 && cambiaNombre) {
        throw new ErrorDeNegocio(`La serie ${actual.serie} ya se usó en ventas: no se le puede cambiar el nombre. Crea una serie nueva.`);
      }
      if (emitido.cantidad > 0 && cambiaDigitos) {
        throw new ErrorDeNegocio(`La serie ${actual.serie} ya se usó en ventas: no se pueden cambiar los dígitos del número. Crea una serie nueva.`);
      }
      if (cambiaNombre) this.exigirSerieLibre(serieNueva, id);

      let siguiente = actual.siguienteNumero;
      if (cambios.siguienteNumero !== undefined) {
        siguiente = validarSiguienteNumero(cambios.siguienteNumero, digitosNuevos);
        if (siguiente < actual.siguienteNumero) {
          throw new ErrorDeNegocio(
            `La numeración no se puede bajar: el siguiente número de ${actual.serie} es el ${actual.siguienteNumero} y solo puede subir.`,
          );
        }
      } else if (cambiaDigitos) {
        validarSiguienteNumero(actual.siguienteNumero, digitosNuevos);
      }

      this.bd.ejecutar(
        `UPDATE serie_comprobante
         SET serie = ?, digitos_numero = ?, siguiente_numero = ?, actualizado_en = datetime('now')
         WHERE id = ?`,
        [serieNueva, digitosNuevos, siguiente, id],
      );

      if (cambiaNombre || cambiaDigitos) {
        this.registrar('serie_modificada', id, cambiaNombre ? `${actual.serie} → ${serieNueva}` : serieNueva);
      }
      if (siguiente !== actual.siguienteNumero) {
        this.registrar('serie_numero_cambiado', id, `${serieNueva}: ${actual.siguienteNumero} → ${siguiente}`);
      }
      return this.obtenerPorId(id);
    });
  }

  establecerActiva(id: number, activo: boolean): SerieComprobante {
    return this.bd.transaccion(() => {
      const actual = this.obtenerPorId(id);
      if (actual.activo === activo) return actual;

      if (activo) {
        if (!esSerieValida(actual.serie)) {
          throw new ErrorDeNegocio(
            `La serie ${actual.serie} es antigua (tiene letras) y ya no se puede usar: las series son de 3 números (001). Crea una nueva.`,
          );
        }
        // Al reactivar, si el tipo se quedó sin predeterminada activa, esta pasa a serlo.
        const hay = this.bd.consultar<{ n: number }>(
          'SELECT COUNT(*) AS n FROM serie_comprobante WHERE tipo = ? AND activo = 1 AND es_predeterminada = 1',
          [actual.tipo],
        )[0]?.n;
        this.bd.ejecutar(
          `UPDATE serie_comprobante SET activo = 1, es_predeterminada = ?, actualizado_en = datetime('now') WHERE id = ?`,
          [hay ? 0 : 1, id],
        );
        this.registrar('serie_modificada', id, `${actual.serie} (reactivada)`);
      } else {
        this.bd.ejecutar(
          `UPDATE serie_comprobante SET activo = 0, es_predeterminada = 0, actualizado_en = datetime('now') WHERE id = ?`,
          [id],
        );
        if (actual.predeterminada) {
          // Otra serie activa del mismo tipo (la más antigua) toma su lugar.
          const siguiente = this.bd.consultar<{ id: number }>(
            'SELECT id FROM serie_comprobante WHERE tipo = ? AND activo = 1 ORDER BY id LIMIT 1',
            [actual.tipo],
          )[0];
          if (siguiente) this.bd.ejecutar('UPDATE serie_comprobante SET es_predeterminada = 1 WHERE id = ?', [siguiente.id]);
        }
        this.registrar('serie_desactivada', id, actual.serie);
      }
      return this.obtenerPorId(id);
    });
  }

  establecerPredeterminada(id: number): SerieComprobante {
    return this.bd.transaccion(() => {
      const actual = this.obtenerPorId(id);
      if (!actual.activo) throw new ErrorDeNegocio('Esa serie está desactivada: actívala primero.');
      this.bd.ejecutar('UPDATE serie_comprobante SET es_predeterminada = 0 WHERE tipo = ?', [actual.tipo]);
      this.bd.ejecutar(`UPDATE serie_comprobante SET es_predeterminada = 1, actualizado_en = datetime('now') WHERE id = ?`, [id]);
      this.registrar('serie_modificada', id, `${actual.serie} (predeterminada)`);
      return this.obtenerPorId(id);
    });
  }

  asignarAUsuario(usuarioId: number, tipo: TipoSerie, serieId: number | null): void {
    this.bd.transaccion(() => {
      const usuario = this.bd.consultar<{ nombre: string }>('SELECT nombre FROM usuario WHERE id = ?', [usuarioId])[0];
      if (!usuario) throw new ErrorDeNegocio('Ese usuario no existe.');
      if (serieId === null) {
        this.bd.ejecutar('DELETE FROM usuario_serie WHERE usuario_id = ? AND tipo = ?', [usuarioId, tipo]);
        this.registrar('serie_asignada', usuarioId, `(ninguna de ${ETIQUETA_COMPROBANTE[tipo]}) a ${usuario.nombre}`, 'usuario', 'administrar_usuarios');
        return;
      }
      const serie = this.obtenerPorId(serieId);
      if (serie.tipo !== tipo) throw new ErrorDeNegocio(`La serie ${serie.serie} no es de tipo ${ETIQUETA_COMPROBANTE[tipo]}.`);
      if (!serie.activo) throw new ErrorDeNegocio(`La serie ${serie.serie} está desactivada.`);
      this.bd.ejecutar('INSERT OR REPLACE INTO usuario_serie (usuario_id, tipo, serie_id) VALUES (?, ?, ?)', [usuarioId, tipo, serieId]);
      this.registrar('serie_asignada', usuarioId, `${serie.serie} a ${usuario.nombre}`, 'usuario', 'administrar_usuarios');
    });
  }

  listarAsignaciones(): AsignacionSerieUsuario[] {
    return this.bd
      .consultar<{ usuario_id: number; tipo: TipoSerie; serie_id: number }>(
        'SELECT usuario_id, tipo, serie_id FROM usuario_serie ORDER BY usuario_id, tipo',
      )
      .map((f) => ({ usuarioId: f.usuario_id, tipo: f.tipo, serieId: f.serie_id }));
  }

  resolverSerie(tipo: TipoSerie, usuarioId: number | null): SerieComprobante | null {
    const asignada =
      usuarioId === null
        ? null
        : (this.bd.consultar<{ serie_id: number }>('SELECT serie_id FROM usuario_serie WHERE usuario_id = ? AND tipo = ?', [usuarioId, tipo])[0]
            ?.serie_id ?? null);
    return elegirSerie(tipo, this.listar(), asignada);
  }

  tomarSiguienteNumero(serieId: number): NumeroReservado {
    const serie = this.obtenerPorId(serieId);
    if (!serie.activo) throw new ErrorDeNegocio(`La serie ${serie.serie} está desactivada.`);

    // El primer número libre desde el «siguiente»: nunca se repite uno ya emitido (ni siquiera el de una venta anulada).
    let numero = serie.siguienteNumero;
    const usados = this.bd.consultar<{ n: number }>(
      'SELECT numero_comprobante AS n FROM venta WHERE serie = ? AND numero_comprobante >= ? ORDER BY numero_comprobante',
      [serie.serie, numero],
    );
    for (const { n } of usados) {
      if (n === numero) numero += 1;
      else if (n > numero) break;
    }

    if (numero > numeroMaximo(serie.digitosNumero)) {
      throw new ErrorDeNegocio(`La serie ${serie.serie} llegó a su último número. Crea una serie nueva para seguir.`);
    }
    this.bd.ejecutar(`UPDATE serie_comprobante SET siguiente_numero = ?, actualizado_en = datetime('now') WHERE id = ?`, [numero + 1, serieId]);
    return {
      serieId,
      serie: serie.serie,
      numero,
      digitosNumero: serie.digitosNumero,
      texto: formatearComprobante(serie.serie, numero, serie.digitosNumero),
    };
  }

  resumenEmitido(serie: string): { cantidad: number; maximo: number | null } {
    const fila = this.bd.consultar<{ cantidad: number; maximo: number | null }>(
      'SELECT COUNT(*) AS cantidad, MAX(numero_comprobante) AS maximo FROM venta WHERE serie = ?',
      [serie],
    )[0];
    return { cantidad: fila?.cantidad ?? 0, maximo: fila?.maximo ?? null };
  }

  private exigirSerieLibre(serie: string, ignorarId: number | null): void {
    const existe = this.bd.consultar<{ id: number }>(
      'SELECT id FROM serie_comprobante WHERE serie = ? COLLATE NOCASE AND id <> ?',
      [normalizarSerie(serie), ignorarId ?? -1],
    )[0];
    if (existe) throw new ErrorDeNegocio(`Ya existe la serie ${serie}. Usa otra.`);
  }

  private registrar(
    accion: Parameters<RegistroActividad['registrar']>[0]['accion'],
    id: number,
    detalle: string,
    entidad = 'serie',
    permiso: Permiso = 'configuracion',
  ): void {
    this.actividad?.registrar({ accion, entidad, entidadId: id, detalle, permiso });
  }
}
