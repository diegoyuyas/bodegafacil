/**
 * Vende Fácil — Buscador de la pantalla de Fiados (lógica pura)
 * ------------------------------------------------------------
 * Busca por nombre, teléfono, DNI/RUC o monto de la deuda. Ignora mayúsculas y tildes («jose» encuentra
 * «José») y acepta varias palabras en cualquier orden («lopez ana» encuentra «Ana López»).
 */
import type { Cliente } from './tipos';

function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

/** Con menos de 3 dígitos no se busca en el teléfono: «45» no debe traer a todos los que tengan un 45 en el número. */
const DIGITOS_MINIMOS_TELEFONO = 3;

function coincidePalabra(cliente: Pick<Cliente, 'nombre' | 'documento' | 'telefono' | 'saldoPendiente'>, palabra: string): boolean {
  const p = sinTildes(palabra);
  if (sinTildes(cliente.nombre).includes(p)) return true;
  if (cliente.documento && sinTildes(cliente.documento).includes(p)) return true;
  const digitos = soloDigitos(palabra);
  if (digitos.length >= DIGITOS_MINIMOS_TELEFONO && cliente.telefono && soloDigitos(cliente.telefono).includes(digitos)) return true;
  return cliente.saldoPendiente.toFixed(2).includes(palabra.trim());
}

export function coincideConBusqueda(
  cliente: Pick<Cliente, 'nombre' | 'documento' | 'telefono' | 'saldoPendiente'>,
  busqueda: string,
): boolean {
  const palabras = busqueda.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return true;
  return palabras.every((p) => coincidePalabra(cliente, p));
}
