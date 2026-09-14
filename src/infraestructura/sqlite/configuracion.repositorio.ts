import type { ConfiguracionRepositorio } from '@/core/repositorios';
import type { BaseDatosLocal } from './base-datos';

export class ConfiguracionRepositorioSqlite implements ConfiguracionRepositorio {
  constructor(private readonly bd: BaseDatosLocal) {}

  obtenerValor(clave: string): string | null {
    const fila = this.bd.consultar<{ valor: string }>(
      'SELECT valor FROM configuracion_app WHERE clave = ?',
      [clave],
    )[0];
    return fila?.valor ?? null;
  }

  establecerValor(clave: string, valor: string): void {
    this.bd.ejecutar(
      `INSERT INTO configuracion_app (clave, valor) VALUES (?, ?)
       ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
      [clave, valor],
    );
  }

  eliminarValor(clave: string): void {
    this.bd.ejecutar('DELETE FROM configuracion_app WHERE clave = ?', [clave]);
  }
}
