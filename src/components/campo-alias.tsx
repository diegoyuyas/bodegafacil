'use client';

import { useState } from 'react';
import { MAXIMO_ALIAS_POR_PRODUCTO, productosConMismoAlias, validarAlias, ErrorDeNegocio } from '@/core/reglas-negocio';
import { mayusculasAlEscribir, partirAlias } from '@/core/texto';
import type { Producto } from '@/core/tipos';

/**
 * Campo "Alias" con etiquetas (chips): al escribir una coma (o Enter) lo escrito
 * se convierte en etiqueta; cada una se quita con su X. Lo que quede escrito sin
 * confirmar (`texto`) lo recoge quien guarda el producto, así no se pierde si
 * el usuario toca "Guardar" sin poner la última coma.
 *
 * Un alias repetido en OTRO producto solo muestra un aviso, nunca bloquea.
 */
export function CampoAlias({
  alias,
  onCambiarAlias,
  texto,
  onCambiarTexto,
  productos,
  excluirProductoId,
}: {
  alias: string[];
  onCambiarAlias: (lista: string[]) => void;
  texto: string;
  onCambiarTexto: (texto: string) => void;
  productos: Producto[];
  excluirProductoId?: number;
}) {
  const [mensaje, setMensaje] = useState<string | null>(null);

  /** Suma a la lista los alias de `crudo`; si alguno no es válido no suma ninguno y lo avisa. */
  function confirmar(crudo: string): boolean {
    const nuevos = partirAlias(crudo);
    if (nuevos.length === 0) return true;
    const lista = partirAlias([...alias, ...nuevos].join(','));
    try {
      validarAlias(lista);
    } catch (e) {
      setMensaje(e instanceof ErrorDeNegocio ? e.message : 'El alias no es válido.');
      return false;
    }
    setMensaje(null);
    onCambiarAlias(lista);
    return true;
  }

  function alEscribir(valor: string) {
    const escrito = mayusculasAlEscribir(valor);
    const ultimaComa = escrito.lastIndexOf(',');
    if (ultimaComa === -1) {
      setMensaje(null);
      onCambiarTexto(escrito);
      return;
    }
    // Todo lo anterior a la última coma pasa a etiquetas; lo que sigue queda escribiéndose.
    const resto = escrito.slice(ultimaComa + 1).replace(/^\s+/, '');
    if (confirmar(escrito.slice(0, ultimaComa))) {
      onCambiarTexto(resto);
    } else {
      onCambiarTexto(escrito.slice(0, ultimaComa));
    }
  }

  function quitar(aliasQuitado: string) {
    setMensaje(null);
    onCambiarAlias(alias.filter((a) => a !== aliasQuitado));
  }

  const llegoAlMaximo = alias.length >= MAXIMO_ALIAS_POR_PRODUCTO;
  const avisos = [...alias, ...partirAlias(texto)].flatMap((a) => {
    const otros = productosConMismoAlias(a, productos, excluirProductoId);
    return otros.length > 0 ? [`El alias ${a} también lo tiene ${otros.map((p) => p.nombre).join(', ')}.`] : [];
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-linea p-2">
        {alias.map((a) => (
          <span
            key={a}
            className="inline-flex items-center gap-1 rounded-md border border-linea bg-papel px-2 py-1 text-xs font-semibold text-tinta"
          >
            {a}
            <button
              type="button"
              onClick={() => quitar(a)}
              aria-label={`Quitar alias ${a}`}
              className="px-0.5 text-sm leading-none text-tinta-suave active:text-alerta"
            >
              ×
            </button>
          </span>
        ))}
        {!llegoAlMaximo && (
          <input
            value={texto}
            onChange={(e) => alEscribir(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (confirmar(texto)) onCambiarTexto('');
              } else if (e.key === 'Backspace' && texto === '') {
                const ultimo = alias[alias.length - 1];
                if (ultimo !== undefined) quitar(ultimo);
              }
            }}
            autoCapitalize="characters"
            className="h-8 min-w-[6rem] flex-1 bg-transparent px-1 text-sm uppercase outline-none"
          />
        )}
      </div>
      <p className="mt-1 text-xs text-tinta-suave">
        Ingresa una coma después de cada alias. Ej: cobertura, bitter, winter
      </p>
      {llegoAlMaximo && (
        <p className="mt-1 text-xs text-tinta-suave">Máximo {MAXIMO_ALIAS_POR_PRODUCTO} alias por producto.</p>
      )}
      {mensaje && <p className="mt-1 text-xs text-alerta">{mensaje}</p>}
      {avisos.map((aviso) => (
        <p key={aviso} className="mt-1 text-xs font-semibold text-acento-oscuro">
          {aviso}
        </p>
      ))}
    </div>
  );
}
