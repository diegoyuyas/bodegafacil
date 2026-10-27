import type { ActividadUsuarioRepositorio } from '@/core/repositorios';
import type { AccionActividad, ActividadUsuario, EventoActividad, ResumenVentasUsuario } from '@/core/actividad';
import { ahoraLocalSql } from '@/core/tiempo';
import type { BaseDatosLocal } from './base-datos';
import type { ContextoActor } from './contexto-actor';

interface FilaActividad {
  id: number;
  fecha_hora: string;
  usuario_id: number;
  usuario_nombre: string;
  accion: string;
  entidad: string;
  entidad_id: number | null;
  detalle: string | null;
  autorizado_por: number | null;
  autorizado_nombre: string | null;
}

/**
 * Bitácora de actividad de usuarios. Solo guarda cuando rige el control de usuarios (hay un usuario
 * dentro); sin él no hay a quién atribuirle nada y `registrar` no hace nada.
 */
export class ActividadUsuarioRepositorioSqlite implements ActividadUsuarioRepositorio {
  constructor(
    private readonly bd: BaseDatosLocal,
    private readonly actor: ContextoActor,
  ) {}

  usuarioActualId(): number | null {
    return this.actor.usuarioActualId();
  }

  registrar(evento: EventoActividad): void {
    const usuarioId = this.actor.usuarioActualId();
    if (usuarioId === null) return;
    const autorizadoPor = evento.permiso ? this.actor.consumirAutorizacion(evento.permiso) : null;
    this.bd.ejecutar(
      `INSERT INTO actividad_usuario (fecha_hora, usuario_id, accion, entidad, entidad_id, detalle, autorizado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ahoraLocalSql(), usuarioId, evento.accion, evento.entidad, evento.entidadId ?? null, evento.detalle ?? null, autorizadoPor],
    );
  }

  listar(filtros: { desde: string; hasta: string; usuarioId?: number | null; limite?: number }): ActividadUsuario[] {
    const filas = this.bd.consultar<FilaActividad>(
      `SELECT a.id AS id, a.fecha_hora AS fecha_hora, a.usuario_id AS usuario_id, u.nombre AS usuario_nombre,
              a.accion AS accion, a.entidad AS entidad, a.entidad_id AS entidad_id, a.detalle AS detalle,
              a.autorizado_por AS autorizado_por, au.nombre AS autorizado_nombre
       FROM actividad_usuario a
       JOIN usuario u ON u.id = a.usuario_id
       LEFT JOIN usuario au ON au.id = a.autorizado_por
       WHERE substr(a.fecha_hora, 1, 10) >= ? AND substr(a.fecha_hora, 1, 10) <= ?
         AND (? IS NULL OR a.usuario_id = ?)
       ORDER BY a.id DESC
       LIMIT ?`,
      [filtros.desde, filtros.hasta, filtros.usuarioId ?? null, filtros.usuarioId ?? null, filtros.limite ?? 300],
    );
    return filas.map((f) => ({
      id: f.id,
      fechaHora: f.fecha_hora,
      usuarioId: f.usuario_id,
      usuarioNombre: f.usuario_nombre,
      accion: f.accion as AccionActividad,
      entidad: f.entidad,
      entidadId: f.entidad_id,
      detalle: f.detalle,
      autorizadoPorId: f.autorizado_por,
      autorizadoPorNombre: f.autorizado_nombre,
    }));
  }

  resumenVentasPorUsuario(desde: string, hasta: string): ResumenVentasUsuario[] {
    return this.bd
      .consultar<{ usuario_id: number | null; nombre: string; cantidad: number; total: number; anuladas: number }>(
        `SELECT v.usuario_id AS usuario_id, COALESCE(u.nombre, 'Sin usuario') AS nombre,
                SUM(CASE WHEN v.anulada = 0 THEN 1 ELSE 0 END) AS cantidad,
                COALESCE(SUM(CASE WHEN v.anulada = 0 THEN v.total ELSE 0 END), 0) AS total,
                SUM(CASE WHEN v.anulada = 1 THEN 1 ELSE 0 END) AS anuladas
         FROM venta v
         LEFT JOIN usuario u ON u.id = v.usuario_id
         WHERE substr(v.fecha_hora, 1, 10) >= ? AND substr(v.fecha_hora, 1, 10) <= ?
         GROUP BY v.usuario_id
         ORDER BY total DESC`,
        [desde, hasta],
      )
      .map((f) => ({
        usuarioId: f.usuario_id,
        usuarioNombre: f.nombre,
        cantidad: f.cantidad,
        total: f.total,
        anuladas: f.anuladas,
      }));
  }
}
